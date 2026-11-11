const clean = text => String(text || '').replace(/\[[^\]]+\]/g, '');
const potions = state => (state?.payload?.potions || []).map(p => p.id).sort().join('|');
const fairyCount = state => (state?.payload?.potions || []).filter(p => p.id === 'FAIRY_IN_A_BOTTLE').length;

function choiceRelations(t, states, payload) {
  const relations = [];
  const before = index => states.findLast(s => s.index < index && s.fact.sourceSessionId === t.facts[index].sourceSessionId);
  const add = (kind, fields, events, inference = 'observed_choice') => {
    const evidenceIds = [...new Set(events.filter(Boolean).map(e => e.eventId))];
    if (evidenceIds.length > 20) return;
    relations.push({ relationId: `${kind}:${evidenceIds[0]}`, kind, fields, evidenceIds,
      scope: 'recorded', inference,
      limitation: inference === 'mechanism_correlated'
        ? '持有、消失、归零恢复与本地精灵机制共同支持；不是直接药水来源ID，也不证明跨读档的同一实例。'
        : '仅反映已记录选择和当时条件，不证明稳定人格、操作最优或缺失范围内的零次。' });
  };
  const choices = t.facts.map((f, index) => ({ f, index })).filter(({ f }) => f.eventType === 'event.option_selected')
    .map(({ f, index }) => {
      const offer = t.facts.slice(0, index).findLast(e => e.eventType === 'event.options_offered' && e.decisionId && e.decisionId === f.decisionId);
      if (!offer || offer.sourceSessionId !== f.sourceSessionId) return null;
      const offerIndex = t.facts.indexOf(offer), state = before(offerIndex);
      if (!state || offerIndex - state.index > 64 || t.facts.slice(state.index + 1, offerIndex).some(e =>
        /^(run.resumed|run.reload_observed|route.selected|combat.started|combat.ended)$/.test(e.eventType))) return null;
      const options = (payload(offer).options || []).filter(o => o.locked === false), label = payload(f).label;
      return { f, index, offer, state, options, selected: options.filter(o => o.label === label) };
    }).filter(Boolean);

  const restRows = [];
  const seenActions = new Set();
  for (let index = 0; index < t.facts.length; index++) {
    const f = t.facts[index], p = payload(f);
    if (f.eventType !== 'rest.action_completed') continue;
    const action = f.actionId || f.decisionId || f.eventId;
    if (seenActions.has(action)) continue;
    seenActions.add(action);
    if (!['heal', 'smith'].includes(p.action)) continue;
    const state = before(index);
    const offer = t.facts.slice(state ? state.index + 1 : index, index).findLast(e => e.eventType === 'rest.options_offered');
    if (!state || !offer || !Number.isFinite(state.payload.hp) || state.payload.hp <= 0
      || !Number.isFinite(state.payload.maxHp) || state.payload.maxHp <= 0 || state.payload.hp > state.payload.maxHp
      || !payload(offer).smithCandidates?.some(c => c.upgraded === false
        && (c.availability == null || c.availability === 'available'))) continue;
    restRows.push({ f, state, offer, action: p.action });
  }
  const healthy = restRows.find(r => r.action === 'heal' && r.state.payload.hp / r.state.payload.maxHp >= .75);
  if (restRows.length >= 3 && restRows.length === seenActions.size && healthy
    && restRows.every(r => r.action === 'heal')) {
    add('rest_choice_style', { restCount: restRows.length, healCount: restRows.length, smithCount: 0,
      healthyHp: healthy.state.payload.hp, healthyMaxHp: healthy.state.payload.maxHp },
    restRows.flatMap(r => [r.state.fact, r.offer, r.f]));
  }

  const food = choices.find(c => payload(c.offer).eventId === 'ROOM_FULL_OF_CHEESE'
    && c.selected.length === 1 && !/失去\d+点生命/.test(clean(c.selected[0].description))
    && c.state.payload.hp > 0 && c.state.payload.hp / c.state.payload.maxHp >= .4
    && c.state.payload.hp / c.state.payload.maxHp <= .6
    && c.options.some(o => /失去\d+点生命/.test(clean(o.description))));
  const debt = choices.find(c => payload(c.offer).eventId === 'CRYSTAL_SPHERE' && c.selected.length === 1
    && /债务/.test(clean(c.selected[0].description))
    && c.options.some(o => /支付\d+金币/.test(clean(o.description))));
  if (food && debt) {
    const bloodCost = Number(clean(food.options.find(o => /失去\d+点生命/.test(clean(o.description))).description).match(/失去(\d+)点生命/)[1]);
    const goldCost = Number(clean(debt.options.find(o => /支付\d+金币/.test(clean(o.description))).description).match(/支付(\d+)金币/)[1]);
    if (Number.isFinite(debt.state.payload.gold) && debt.state.payload.gold >= goldCost)
      add('resource_choice_style', { bloodCost, gold: debt.state.payload.gold, goldCost,
        choiceCount: 2, hp: food.state.payload.hp, maxHp: food.state.payload.maxHp },
      [food.state.fact, food.offer, food.f, debt.state.fact, debt.offer, debt.f]);
  }

  const fairyMechanic = require('../../agent/data/codex/potions.json').find(p => p.id === 'FAIRY_IN_A_BOTTLE');
  if (!/30%/.test(clean(fairyMechanic?.description))) return relations;
  for (let i = 1; i < states.length; i++) {
    const zero = states[i - 1], recovered = states[i];
    if (zero.payload.hp !== 0 || recovered.payload.hp <= 0 || !zero.combat
      || zero.combat.combatId !== recovered.combat?.combatId
      || zero.combat.attemptGeneration !== recovered.combat.attemptGeneration
      || zero.payload.maxHp !== recovered.payload.maxHp
      || recovered.payload.hp !== Math.floor(recovered.payload.maxHp * .3)
      || fairyCount(zero) || fairyCount(recovered)) continue;
    const held = states.slice(0, i - 1).findLast(s => s.combat?.combatId === zero.combat.combatId
      && s.combat.attemptGeneration === zero.combat.attemptGeneration);
    if (!held || fairyCount(held) !== 1 || held.payload.hp <= 0
      || potions(held).split('|').filter(id => id !== 'FAIRY_IN_A_BOTTLE').join('|') !== potions(zero)
      || potions(zero) !== potions(recovered)) continue;
    const window = t.facts.slice(held.index, recovered.index + 1);
    if ((t.coverage.gaps || []).length || window.some((f, n) => f.sourceSessionId !== held.fact.sourceSessionId
      || /^(run.resumed|run.reload_observed|combat.ended|combat.started)$/.test(f.eventType)
      || n > 0 && f.sourceSeq !== window[n - 1].sourceSeq + 1)) continue;
    const heals = t.facts.slice(zero.index + 1, recovered.index).filter(f => f.eventType === 'heal.resolved');
    if (heals.length !== 1 || payload(heals[0]).currentHp !== recovered.payload.hp
      || payload(heals[0]).amount !== recovered.payload.hp
      || payload(heals[0]).targetSide && !/^(player|players|hero|ally|friendly)$/i.test(payload(heals[0]).targetSide)) continue;
    const use = t.facts.slice(zero.index + 1, recovered.index + 9).find(f => f.eventType === 'potion.used'
      && f.combatId === zero.combat.combatId);
    if (!use || payload(use).potionId && payload(use).potionId !== 'FAIRY_IN_A_BOTTLE') continue;
    const kept = choices.findLast(c => c.index < held.index && c.state.payload.act === held.payload.act
      && c.state.payload.floor < held.payload.floor && fairyCount(c.state) === 1
      && c.selected.length > 0 && c.selected.every(o => !/瓶中精灵/.test(clean(o.description)))
      && c.options.some(o => /瓶中精灵/.test(clean(o.description)) && /稀有攻击牌/.test(clean(o.description))));
    if (!kept) continue;
    const afterChoice = states.find(s => s.index > kept.index);
    if (!afterChoice || fairyCount(afterChoice) !== 1 || afterChoice.payload.act !== kept.state.payload.act
      || afterChoice.payload.floor !== kept.state.payload.floor) continue;
    const intervening = states.filter(s => s.index >= afterChoice.index && s.index <= held.index);
    if (intervening.some(s => fairyCount(s) !== 1)) continue;
    if (t.facts.slice(afterChoice.index, held.index).some(f => /^potion\.(used|discarded|gained)$/.test(f.eventType)
      && payload(f).potionId === 'FAIRY_IN_A_BOTTLE')) continue;
    const start = t.facts.find(f => f.eventType === 'combat.started' && f.combatId === zero.combat.combatId
      && payload(f).boss === true && payload(f).enemies?.length === 2);
    if (!start) continue;
    const entry = before(t.facts.indexOf(start));
    if (!entry || entry.payload.act !== recovered.payload.act || entry.payload.floor !== recovered.payload.floor) continue;
    add('fairy_kept_rescue', { potionName: fairyMechanic.name, floorGap: recovered.payload.floor - kept.state.payload.floor,
      entryHp: entry.payload.hp, recoveredHp: recovered.payload.hp, bossCount: 2 },
    [kept.state.fact, kept.offer, kept.f, afterChoice.fact, start, entry.fact, held.fact, zero.fact, heals[0], recovered.fact, use],
    'mechanism_correlated');
  }
  return relations;
}

module.exports = { choiceRelations };
