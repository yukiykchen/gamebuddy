const { SCHEMA } = require('../recommendation');
const { createSpireCodexClient, normalizeKey, stripMarkup } = require('../knowledge/spire-codex');

const codexClient = createSpireCodexClient();

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, 6).map(card => {
    if (typeof card === 'string') return { id: card, name: card };
    return card && typeof card === 'object' ? card : null;
  }).filter(card => card && (card.id || card.name));
}

function normalizeReward(payload, state) {
  if (!payload || typeof payload !== 'object') return null;
  const cards = normalizeCards(payload.cards || payload.offered || payload.options);
  if (!cards.length) return null;
  return {
    cards,
    canSkip: payload.canSkip !== false,
    source: payload.source || 'combat',
    context: {
      act: payload.context?.act ?? state?.run?.act ?? null,
      floor: payload.context?.floor ?? state?.run?.floor ?? null,
      defeatedType: payload.context?.defeatedType || payload.defeatedType || null,
      defeatedEnemies: payload.context?.defeatedEnemies || payload.defeatedEnemies || [],
      actId: payload.context?.actId ?? state?.run?.actId ?? null,
      actName: payload.context?.actName ?? state?.run?.actName ?? null,
      nextBossId: payload.context?.nextBossId || payload.nextBossId || state?.run?.nextBossId || null,
      nextBoss: payload.context?.nextBoss || payload.nextBoss || null
    }
  };
}

function findCardReward(observation) {
  const state = observation?.state;
  const events = observation?.recentEvents || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.name === 'card.reward.opened') return normalizeReward(event.data, state);
    if (event?.name === 'card.reward.closed' || event?.name === 'map.opened' || event?.name === 'combat.started' || event?.name === 'rest.opened') return null;
  }
  return normalizeReward(state?.cardReward || state?.reward, state);
}

function mapNodes(state) {
  return new Map((state?.map?.nodes || []).map(node => [node.id, node]));
}

function upcomingThreats(state, reward) {
  const byId = mapNodes(state);
  const routes = state?.map?.routes || [];
  const upcoming = routes.flatMap(route => route.slice(0, 3).map(id => byId.get(id)).filter(Boolean));
  const currentRow = byId.get(state?.map?.current)?.row;
  const bossRow = byId.get(state?.map?.boss)?.row;
  const defeatedType = String(reward?.context?.defeatedType || '').toLowerCase();
  return {
    eliteSoon: upcoming.some(node => node.type === 'Elite'),
    bossSoon: Number.isFinite(currentRow) && Number.isFinite(bossRow) && bossRow - currentRow <= 3,
    defeatedElite: defeatedType.includes('elite'),
    defeatedBoss: defeatedType.includes('boss')
  };
}

function threatTagSet(knowledge, threats) {
  const encounters = [
    knowledge?.threats?.knownBoss,
    ...(knowledge?.threats?.knownUpcomingElites || []),
    ...(threats?.eliteSoon ? (knowledge?.threats?.possibleElites || []) : [])
  ].filter(Boolean);
  return new Set(encounters.flatMap(encounter => (encounter.monsters || [])
    .flatMap(monster => monster.mechanicTags || [])));
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function cardFacts(card) {
  const description = stripMarkup((card.upgraded && card.upgrade_description) || card.description || card.text || '');
  const cost = card.is_x_cost || card.isXCost ? null : (Number.isFinite(Number(card.cost)) ? Number(card.cost) : null);
  const damage = numeric(card.damage) * Math.max(1, numeric(card.hit_count || card.hitCount) || 1);
  const block = numeric(card.block);
  const draw = numeric(card.cards_draw || card.cardsDraw);
  const energy = numeric(card.energy_gain || card.energyGain);
  const typeKey = String(card.type_key || card.type || '').toLowerCase();
  const rarityKey = String(card.rarity_key || card.rarity || '').toLowerCase();
  const target = String(card.target || '').toLowerCase();
  const powerNames = (card.powers_applied || card.powersApplied || []).map(power => String(power.power_key || power.power || '')).filter(Boolean);
  const keywords = (card.keywords_key || card.keywords || []).map(String);
  const searchable = `${description} ${powerNames.join(' ')} ${keywords.join(' ')}`.toLowerCase();
  return {
    description,
    cost,
    damage,
    block,
    draw,
    energy,
    typeKey,
    rarityKey,
    target,
    powerNames,
    keywords,
    isAttack: typeKey.includes('attack') || typeKey.includes('攻击'),
    isSkill: typeKey.includes('skill') || typeKey.includes('技能'),
    isPower: typeKey.includes('power') || typeKey.includes('能力'),
    isRare: rarityKey.includes('rare') || rarityKey.includes('稀有'),
    isAoE: target.includes('allenem') || /所有敌人|all enemies/.test(searchable),
    isScaling: /strength|dexterity|focus|doom|poison|forge|replay|力量|敏捷|集中|厄运|中毒|锻造|重放/.test(searchable),
    isControl: /weak|vulnerable|strength.*-|虚弱|易伤|失去.*力量|降低.*力量/.test(searchable),
    isConditional: /if |when |whenever|若|如果|每当|致命|fatal|只能|only/.test(searchable),
    exhausts: /exhaust|消耗/.test(searchable),
    innate: /innate|固有/.test(searchable)
  };
}

function deckContext(state, knowledge) {
  const cards = knowledge.deckCards || state?.player?.cards || [];
  const facts = cards.map(cardFacts);
  const counts = new Map();
  const tagCounts = new Map();
  for (const card of cards) {
    const key = normalizeKey(card.id || card.name);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
    for (const tag of card.evaluation?.mechanicTags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  return {
    size: cards.length,
    attacks: facts.filter(fact => fact.isAttack).length,
    skills: facts.filter(fact => fact.isSkill).length,
    powers: facts.filter(fact => fact.isPower).length,
    draw: facts.reduce((sum, fact) => sum + fact.draw, 0),
    blockCards: facts.filter(fact => fact.block > 0).length,
    counts,
    tagCounts,
    act: numeric(state?.run?.act) || 1
  };
}

function coachMap(coach) {
  return new Map((coach?.offers || []).map(item => [normalizeKey(item.id), item]));
}

function fitAnalysis(facts, threats) {
  let bossPoints = 0;
  const bossReasons = [];
  if (facts.isScaling || facts.isPower) {
    bossPoints += 2;
    bossReasons.push('长战能持续放大收益');
  }
  if (facts.draw >= 2 || facts.energy > 0) {
    bossPoints += 1;
    bossReasons.push('改善长战循环和资源');
  }
  if (facts.isControl) {
    bossPoints += 1;
    bossReasons.push('可压低 Boss 的关键回合压力');
  }
  if (facts.cost !== null && facts.cost >= 3 && !facts.isScaling) bossPoints -= 1;

  let elitePoints = 0;
  const eliteReasons = [];
  if (facts.damage >= 10 || facts.isAoE) {
    elitePoints += 2;
    eliteReasons.push(facts.isAoE ? '群体伤害适合多目标精英' : '前置伤害足，能缩短高压战斗');
  }
  if (facts.block >= 8 || facts.isControl) {
    elitePoints += 1;
    eliteReasons.push('能处理精英的爆发回合');
  }
  if (facts.cost === 0 || facts.energy > 0) {
    elitePoints += 1;
    eliteReasons.push('即时节奏好，不容易卡手');
  }
  if (facts.isPower && facts.damage === 0 && facts.block === 0) elitePoints -= 1;

  function result(points, reasons, soon) {
    const level = points >= 3 ? '强' : points >= 1 ? '中' : '弱';
    const suffix = soon ? '，而且即将遇到该类战斗' : '';
    return { level, reason: `${reasons[0] || '没有明显的专项优势'}${suffix}` };
  }
  return {
    boss: result(bossPoints, bossReasons, threats.bossSoon),
    elite: result(elitePoints, eliteReasons, threats.eliteSoon),
    bossPoints,
    elitePoints
  };
}

function analyzeCard(card, state, context, threats, coachItem, enemyTags = new Set()) {
  const facts = cardFacts(card);
  const fit = fitAnalysis(facts, threats);
  const copies = context.counts.get(normalizeKey(card.id || card.name)) || 0;
  const pros = [];
  const cons = [];
  const scenarios = [];
  let score = 42;

  const knowledgePrior = typeof card.evaluation?.prior?.score === 'number'
    ? card.evaluation.prior.score
    : null;
  if (Number.isFinite(knowledgePrior)) {
    score += Math.max(-10, Math.min(12, (knowledgePrior - 50) * 0.24));
    if (knowledgePrior >= 78) {
      const version = card.evaluation.gameVersion ? `（${card.evaluation.gameVersion}）` : '';
      pros.push(`基础评价${version}为 ${card.evaluation.prior.tier} 级，多来源先验表现较好`);
    } else if (knowledgePrior < 35) {
      cons.push('基础数据表现偏低，需要明确的牌组协同才能发挥');
    }
  }

  const synergyTags = ['poison', 'shiv', 'discard', 'exhaust', 'strength', 'self_damage', 'vulnerable', 'orb', 'doom', 'summon', 'stars', 'forge', 'replay', 'retain'];
  const matchedSynergies = (card.evaluation?.mechanicTags || [])
    .filter(tag => synergyTags.includes(tag))
    .map(tag => ({ tag, count: context.tagCounts.get(tag) || 0 }))
    .filter(item => item.count > 0)
    .sort((left, right) => right.count - left.count);
  if (matchedSynergies.length) {
    const best = matchedSynergies[0];
    score += Math.min(8, 2 + best.count * 1.5);
    pros.push(`与牌组已有的 ${best.count} 张「${best.tag}」相关牌形成协同`);
  }

  if (facts.damage) {
    const efficiency = facts.cost === null ? facts.damage / 2 : facts.damage / Math.max(1, facts.cost);
    score += Math.min(12, efficiency * 0.8);
    pros.push(`${facts.damage} 点总伤害，${efficiency >= 9 ? '即时输出效率高' : '能补充输出'}`);
  }
  if (facts.block) {
    const efficiency = facts.cost === null ? facts.block / 2 : facts.block / Math.max(1, facts.cost);
    score += Math.min(10, efficiency * 0.7);
    pros.push(`${facts.block} 点格挡，能提高容错`);
  }
  if (facts.draw) {
    score += Math.min(10, facts.draw * 4);
    pros.push(`抽 ${facts.draw} 张牌，改善牌组循环`);
  }
  if (facts.energy) {
    score += Math.min(10, facts.energy * 5);
    pros.push(`提供 ${facts.energy} 点能量，便于同回合展开`);
  }
  if (facts.isScaling) {
    score += context.act >= 2 || threats.bossSoon ? 8 : 5;
    pros.push('带有成长机制，适合精英或 Boss 长战');
  }
  if (facts.isControl) {
    score += 5;
    pros.push('带弱化/控制，可降低高压敌人的威胁');
  }
  if (facts.isAoE) {
    score += context.act <= 2 ? 7 : 4;
    pros.push('群体效果能处理多目标遭遇');
    scenarios.push('多目标战斗');
  }
  if (facts.isRare) score += 2;
  if (card.upgraded) {
    score += 5;
    pros.push('奖励牌已升级，拿取后立即成型');
  }

  if (context.act === 1 && context.attacks <= Math.max(5, Math.round(context.size * 0.45)) && facts.isAttack) {
    score += 6;
    pros.push('第一章需要前置伤害，这张牌能补当前缺口');
  }
  if (context.blockCards < Math.max(3, Math.round(context.size * 0.25)) && facts.block > 0) {
    score += 6;
    pros.push('当前牌组防御密度偏低，能补足生存');
  }
  if (context.draw === 0 && facts.draw > 0) score += 4;
  if (threats.eliteSoon) score += fit.elitePoints * 2;
  if (threats.bossSoon) score += fit.bossPoints * 2;
  if ((enemyTags.has('summons') || enemyTags.has('aoe')) && facts.isAoE) {
    score += 6;
    pros.push('已知/本章高威胁遭遇包含多目标机制，群体处理能力更有价值');
  }
  if ((enemyTags.has('multi_hit') || enemyTags.has('scaling')) && facts.isControl) {
    score += 5;
    pros.push('弱化或降力量能针对多段攻击/成长型敌人');
  }
  if (enemyTags.has('burst_damage') && facts.block >= 8) {
    score += 4;
    pros.push('高额格挡能覆盖敌人的爆发回合');
  }
  if (enemyTags.has('status_cards') && (facts.draw > 0 || facts.exhausts)) {
    score += 3;
    pros.push('抽牌或消耗能力有助于处理状态牌污染');
  }

  if (Number.isFinite(coachItem?.coach_score)) {
    score += Math.min(16, Math.max(0, coachItem.coach_score) * 0.6);
    if (coachItem.winner_support >= 10) pros.push(`相似胜局中有 ${coachItem.winner_support}% 的牌组采用它`);
  }
  if (Number.isFinite(coachItem?.take_score)) {
    score += Math.min(10, Math.max(0, coachItem.take_score) * 20);
  }

  if (facts.cost !== null && facts.cost >= 3) {
    score -= 7;
    cons.push(`${facts.cost} 费偏重，能量不足时容易卡手`);
  }
  if (facts.isConditional) {
    score -= 2;
    cons.push('收益依赖触发条件，并非每场战斗都稳定');
  }
  if (facts.isPower && facts.damage === 0 && facts.block === 0) {
    cons.push('打出当回合通常没有直接伤害或格挡，短战偏慢');
    scenarios.push('Boss 与持续战');
  }
  if (facts.exhausts) cons.push('通常每场战斗只能使用一次，需要把握时机');
  if (copies >= 2) {
    score -= Math.min(10, copies * 3);
    cons.push(`牌组里已有 ${copies} 张同名牌，继续拿可能降低稳定性`);
  }
  if (context.size >= 18 && !facts.draw && !facts.energy && !facts.isScaling && score < 58) {
    score -= 6;
    cons.push('当前牌组已经较厚，泛用收益不足时应考虑跳过');
  }

  if (fit.elite.level === '强') scenarios.push('精英战');
  if (fit.boss.level === '强') scenarios.push('Boss 战');
  if (!scenarios.length) scenarios.push(facts.damage || facts.block ? '常规战斗' : '特定流派成型后');
  if (!pros.length) pros.push('保留了候选牌的基础功能，可在对应流派中发挥作用');
  if (!cons.length) cons.push('没有明显硬伤，但仍要衡量它是否比跳过更能改善当前牌组');

  return {
    id: card.id || card.originalId || card.name,
    name: card.name || card.id,
    type: card.type || card.type_key || '未知',
    rarity: card.rarity || card.rarity_key || '未知',
    cost: facts.cost,
    upgraded: Boolean(card.upgraded),
    description: facts.description || stripMarkup(card.upgrade_description) || '暂未取得卡牌描述',
    score: Math.max(0, Math.min(100, Math.round(score))),
    pros: pros.slice(0, 4),
    cons: cons.slice(0, 3),
    scenarios: [...new Set(scenarios)].slice(0, 4),
    fit: { boss: fit.boss, elite: fit.elite },
    knowledgeEvaluation: card.evaluation?.advice || null,
    stats: coachItem ? {
      archetypeDelta: coachItem.commitment_delta ?? null,
      winnerSupport: coachItem.winner_support ?? null,
      takeScore: coachItem.take_score ?? null,
      takeBase: coachItem.take_base ?? null,
      knowledgePrior: Number.isFinite(knowledgePrior) ? knowledgePrior : null,
      knowledgeTier: card.evaluation?.prior?.tier || null,
      knowledgeConfidence: card.evaluation?.prior?.confidence || null,
      knowledgeVersion: card.evaluation?.gameVersion || null,
      knowledgeChannel: card.evaluation?.dataChannel || null
    } : (Number.isFinite(knowledgePrior) ? {
      archetypeDelta: null,
      winnerSupport: null,
      takeScore: null,
      takeBase: null,
      knowledgePrior,
      knowledgeTier: card.evaluation?.prior?.tier || null,
      knowledgeConfidence: card.evaluation?.prior?.confidence || null,
      knowledgeVersion: card.evaluation?.gameVersion || null,
      knowledgeChannel: card.evaluation?.dataChannel || null
    } : null)
  };
}

function skipScore(context, bestScore, canSkip) {
  if (!canSkip) return -1;
  let score = 44;
  if (context.size >= 15) score += Math.min(14, (context.size - 14) * 1.5);
  if (bestScore < 55) score += 5;
  return Math.round(score);
}

function explanation(chosen, threats, knowledge) {
  if (chosen.action === 'SKIP') {
    return '三张牌对当前牌组的即时提升都有限。牌组已经有一定厚度，跳过可以保持核心牌的抽取稳定性。';
  }
  const card = chosen.card;
  const clauses = [card.pros[0]];
  if (threats.eliteSoon) clauses.push(`近期有精英，精英适配为${card.fit.elite.level}`);
  if (threats.bossSoon) clauses.push(`接近 Boss，Boss 适配为${card.fit.boss.level}`);
  if (knowledge.coach?.target?.name) clauses.push(`与当前「${knowledge.coach.target.name}」方向更接近`);
  return `建议拿「${card.name}」。${clauses.filter(Boolean).join('；')}。`;
}

function confidenceFor(candidates, source) {
  const best = candidates[0]?.score || 0;
  const second = candidates[1]?.score ?? best;
  const base = source === 'llm' ? 0.7 : 0.54;
  return Math.max(0.42, Math.min(source === 'llm' ? 0.9 : 0.82, base + Math.abs(best - second) / 55));
}

async function recommendCardReward(observation, { llm, now = Date.now(), codex = codexClient } = {}) {
  const state = observation?.state;
  const reward = findCardReward(observation);
  if (!state || !reward) return null;
  const knowledge = await codex.loadDraftContext(state, reward);
  const context = deckContext(state, knowledge);
  const threats = upcomingThreats(state, reward);
  const enemyTags = threatTagSet(knowledge, threats);
  const stats = coachMap(knowledge.coach);
  const options = knowledge.cards.map(card => analyzeCard(card, state, context, threats, stats.get(normalizeKey(card.id || card.name)), enemyTags))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN'));
  if (!options.length) return null;

  const candidates = options.map(card => ({ action: 'TAKE_CARD', score: card.score, card }));
  const skip = skipScore(context, options[0].score, reward.canSkip);
  if (skip >= 0) candidates.push({ action: 'SKIP', score: skip, label: '跳过奖励' });
  candidates.sort((left, right) => right.score - left.score);

  let chosen = candidates[0];
  let source = 'rules';
  let reason = explanation(chosen, threats, knowledge);
  if (llm?.enabled && typeof llm.completeCardReward === 'function') {
    try {
      const pick = await llm.completeCardReward({
        gameVersion: knowledge.cards[0]?.evaluation?.gameVersion || null,
        player: {
          act: state.run?.act,
          floor: state.run?.floor,
          hp: state.player?.hp,
          maxHp: state.player?.maxHp,
          block: state.player?.block,
          gold: state.player?.gold,
          energy: state.player?.energy,
          maxEnergy: state.player?.maxEnergy
        },
        deckSize: context.size,
        eliteSoon: threats.eliteSoon,
        bossSoon: threats.bossSoon,
        archetype: knowledge.coach?.target?.name || null,
        threats: knowledge.threats,
        deck: (knowledge.deckCards || []).map(card => ({
          id: card.id || card.name,
          name: card.name || card.id,
          type: card.type || card.type_key || null,
          cost: card.cost ?? null,
          upgraded: Boolean(card.upgraded),
          description: stripMarkup((card.upgraded && card.upgrade_description) || card.description || card.text || '') || null,
          mechanicTags: card.evaluation?.mechanicTags || []
        })),
        relics: (knowledge.relics || []).map(relic => ({
          id: relic.id || relic.name,
          name: relic.name || relic.id,
          rarity: relic.rarity || null,
          effect: stripMarkup(relic.description || relic.description_raw || '') || null,
          notes: relic.notes || null
        })),
        potions: (knowledge.potions || []).map(potion => ({
          id: potion.id || potion.name,
          name: potion.name || potion.id,
          rarity: potion.rarity || null,
          effect: stripMarkup(potion.description || potion.description_raw || '') || null
        })),
        map: state.map || null,
        candidates: candidates.map((candidate, index) => candidate.action === 'SKIP'
          ? { index, action: 'SKIP', score: candidate.score }
          : {
              index,
              action: 'TAKE_CARD',
              id: candidate.card.id,
              name: candidate.card.name,
              score: candidate.score,
              pros: candidate.card.pros,
              cons: candidate.card.cons,
              knowledgeEvaluation: candidate.card.knowledgeEvaluation,
              bossFit: candidate.card.fit.boss,
              eliteFit: candidate.card.fit.elite
            })
      });
      if (Number.isInteger(pick?.index) && candidates[pick.index]) {
        chosen = candidates[pick.index];
        source = 'llm';
        reason = pick.reason?.trim() || explanation(chosen, threats, knowledge);
      }
    } catch {
      source = 'rules';
      reason = explanation(chosen, threats, knowledge);
    }
  }

  const primary = chosen.action === 'SKIP'
    ? { action: 'SKIP', label: '跳过奖励', score: chosen.score }
    : {
        action: 'TAKE_CARD',
        cardId: chosen.card.id,
        cardName: chosen.card.name,
        label: `拿取 ${chosen.card.name}`,
        score: chosen.score,
        analysis: chosen.card
      };
  return {
    schema: SCHEMA,
    task: 'card_reward',
    timestamp: now,
    source,
    confidence: confidenceFor(candidates, source),
    reason,
    primary,
    alternatives: candidates.filter(candidate => candidate !== chosen).map(candidate => candidate.action === 'SKIP'
      ? { action: 'SKIP', label: '跳过奖励', score: candidate.score }
      : { action: 'TAKE_CARD', cardId: candidate.card.id, cardName: candidate.card.name, label: candidate.card.name, score: candidate.score, analysis: candidate.card }),
    options,
    context: {
      deckSize: context.size,
      eliteSoon: threats.eliteSoon,
      bossSoon: threats.bossSoon,
      defeatedElite: threats.defeatedElite,
      defeatedBoss: threats.defeatedBoss,
      archetype: knowledge.coach?.target?.name || null,
      gold: state.player?.gold ?? null,
      potions: (knowledge.potions || []).map(potion => potion.name || potion.id),
      knownBoss: knowledge.threats?.knownBoss?.name || null,
      knownUpcomingElites: (knowledge.threats?.knownUpcomingElites || []).map(item => item.name),
      possibleElites: (knowledge.threats?.possibleElites || []).map(item => item.name)
    },
    knowledgeSource: knowledge.source
  };
}

function cardRewardSignature(observation) {
  const reward = findCardReward(observation);
  if (!reward) return '';
  return JSON.stringify({
    cards: reward.cards.map(card => [card.id || null, card.name || null, Boolean(card.upgraded)]),
    canSkip: reward.canSkip,
    context: reward.context,
    deck: (observation?.state?.player?.cards || []).map(card => [card.id || card, Boolean(card.upgraded)]),
    relics: observation?.state?.player?.relics || [],
    potions: observation?.state?.player?.potions || [],
    gold: observation?.state?.player?.gold ?? null,
    map: observation?.state?.map || null,
    act: observation?.state?.run?.act ?? null,
    floor: observation?.state?.run?.floor ?? null
  });
}

module.exports = {
  normalizeReward,
  findCardReward,
  upcomingThreats,
  cardFacts,
  deckContext,
  analyzeCard,
  recommendCardReward,
  cardRewardSignature
};
