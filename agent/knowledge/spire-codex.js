const DEFAULT_BASE_URL = 'https://spire-codex.com/api';
const cardEvaluations = require('./card-evaluations.json');
const encounterStrategies = require('./encounter-strategies.json');
const { deriveMechanicTags } = require('./mechanic-tags');
const evaluationIndex = new Map();
const encounterStrategyIndex = new Map((encounterStrategies.encounters || []).map(item => [normalizeKey(item.id), item]));
for (const card of cardEvaluations.cards || []) {
  for (const key of [card.id, card.name, card.nameEn]) {
    if (key) evaluationIndex.set(normalizeKey(key), card);
  }
}

function normalizeKey(value) {
  return String(value || '')
    .replace(/^CARD_/i, '')
    .replace(/\+$/, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
}

function stripMarkup(value) {
  return String(value || '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function makeIndex(items) {
  const index = new Map();
  for (const item of items || []) {
    for (const key of [item?.id, item?.name]) {
      const normalized = normalizeKey(key);
      if (normalized && !index.has(normalized)) index.set(normalized, item);
    }
  }
  return index;
}

function inferUpgraded(card) {
  if (!card || typeof card === 'string') return /\+$/.test(String(card || '').trim());
  if (card.upgraded === true || card.isUpgraded === true || card.IsUpgraded === true) return true;
  return /\+$/.test(String(card.name || '').trim());
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveItem(ref, index) {
  const raw = typeof ref === 'string' ? { id: ref, name: ref } : (ref || {});
  const match = index.get(normalizeKey(raw.id)) || index.get(normalizeKey(raw.name)) || null;
  const catalog = match || {};
  const upgraded = inferUpgraded(raw) || inferUpgraded(match);
  const runtimeDescription = hasText(raw.description) && raw.descriptionSource !== 'unavailable'
    ? raw.description
    : null;
  const runtimeDescriptionSource = runtimeDescription
    ? (raw.descriptionSource === 'catalog' ? 'catalog' : 'runtime')
    : null;
  const catalogDescription = (upgraded && (catalog.upgradeDescription || catalog.upgrade_description))
    || catalog.description
    || null;
  const runtimeEnergyKnown = raw.energyCostSource === 'runtime'
    || hasOwn(raw, 'energyCost')
    || hasOwn(raw, 'energyCostX')
    || hasOwn(raw, 'cost');
  const runtimeStarKnown = raw.starCostSource === 'runtime';
  const catalogStarKnown = hasOwn(catalog, 'star_cost')
    || hasOwn(catalog, 'starCost')
    || hasOwn(catalog, 'is_x_star_cost')
    || hasOwn(catalog, 'isXStarCost');
  const energyCostX = runtimeEnergyKnown
    ? Boolean(raw.energyCostX ?? raw.costsX)
    : Boolean(catalog.energyCostX ?? catalog.is_x_cost ?? catalog.isXCost);
  const energyCost = energyCostX
    ? null
    : (runtimeEnergyKnown
      ? (raw.energyCost ?? raw.cost ?? null)
      : (catalog.energyCost ?? catalog.cost ?? null));
  const starCostX = runtimeStarKnown
    ? Boolean(raw.starCostX)
    : Boolean(catalog.starCostX ?? catalog.is_x_star_cost ?? catalog.isXStarCost);
  const starCost = starCostX
    ? null
    : (runtimeStarKnown
      ? (raw.starCost ?? null)
      : (catalog.starCost ?? catalog.star_cost ?? null));
  return {
    ...catalog,
    ...raw,
    originalId: raw.id || catalog.id || raw.name,
    name: raw.name || catalog.name,
    cost: energyCost,
    energyCost,
    energyCostX,
    energyCostSource: runtimeEnergyKnown ? 'runtime' : (match ? 'catalog' : 'unavailable'),
    starCost,
    starCostX,
    starCostSource: runtimeStarKnown ? 'runtime' : (catalogStarKnown ? 'catalog' : 'unavailable'),
    upgraded,
    description: runtimeDescription || catalogDescription,
    descriptionSource: runtimeDescriptionSource || (catalogDescription ? 'catalog' : 'unavailable'),
    upgrade_description: raw.upgrade_description || raw.upgradeDescription || catalog.upgradeDescription || catalog.upgrade_description,
    upgradeDescription: raw.upgradeDescription || raw.upgrade_description || catalog.upgradeDescription || catalog.upgrade_description
  };
}

function actMatches(value, act, actId) {
  const normalizedActId = normalizeKey(actId);
  if (normalizedActId) return normalizeKey(value).includes(normalizedActId);
  if (!Number.isFinite(Number(act))) return false;
  return new RegExp(`\\bAct\\s+${Number(act)}\\b`, 'i').test(String(value || ''));
}

function encounterRoomType(kind) {
  return String(kind).toLowerCase() === 'normal' ? 'Monster' : kind;
}

function sameMonster(left, right) {
  const leftKeys = [left?.id, left?.name].map(normalizeKey).filter(Boolean);
  const rightKeys = new Set([right?.id, right?.name].map(normalizeKey).filter(Boolean));
  return leftKeys.some(key => rightKeys.has(key));
}

function rankEncounterMatches(encounters, enemyRefs, { kind, act, actId } = {}) {
  const roomType = String(encounterRoomType(kind) || '').toLowerCase();
  const actual = (enemyRefs || []).filter(Boolean);
  return (encounters || [])
    .filter(item => String(item?.room_type || '').toLowerCase() === roomType)
    .filter(item => item.act == null || actMatches(item.act, act, actId))
    .map(item => {
      const catalogMonsters = item.monsters || [];
      const matches = actual.filter(enemy => catalogMonsters.some(monster => sameMonster(monster, enemy))).length;
      const catalogSize = (item.monsters || []).length;
      // Encounter monster arrays can describe a spawn pool rather than literal
      // multiplicity. A match is exact when every currently visible enemy is
      // covered by that pool; extra catalog variants do not invalidate it.
      const exactComposition = actual.length > 0 && matches === actual.length;
      const score = matches * 100
        + (item.act == null ? 0 : 20)
        + (exactComposition ? 40 : 0)
        - Math.abs(catalogSize - actual.length) * 8;
      return { item, matches, exactComposition, score };
    })
    .filter(candidate => candidate.matches > 0)
    .sort((left, right) => right.score - left.score
      || Number(right.exactComposition) - Number(left.exactComposition)
      || String(left.item.id).localeCompare(String(right.item.id)));
}

function mechanicTags(monster) {
  const moves = Array.isArray(monster?.moves) ? monster.moves : [];
  const text = JSON.stringify({ moves, powers: monster?.innate_powers, pattern: monster?.attack_pattern }).toLowerCase();
  const tags = [];
  if (moves.some(move => Number(move?.damage?.hit_count) > 1)) tags.push('multi_hit');
  if (/all.?players|all.?enemies|所有/.test(text)) tags.push('aoe');
  if (/summon|召唤/.test(text)) tags.push('summons');
  if (/status|状态|dazed|眩晕|slimed|黏液|wound|伤口|burn|灼伤/.test(text)) tags.push('status_cards');
  if (/strength|力量|buff|增益/.test(text)) tags.push('scaling');
  if (/weak|虚弱|vulnerable|易伤|frail|脆弱/.test(text)) tags.push('debuffs');
  if (/artifact|人工制品/.test(text)) tags.push('artifact');
  if (/thorns|荆棘/.test(text)) tags.push('thorns');
  if (/regen|再生|heal|治疗|回复/.test(text) || moves.some(move => Number(move?.heal) > 0)) tags.push('healing');
  if (moves.some(move => Number(move?.block) > 0)) tags.push('block');
  return [...new Set(tags)];
}

function compactMonster(monster) {
  if (!monster) return null;
  return {
    id: monster.id || null,
    name: monster.name || monster.id || '未知敌人',
    type: monster.type || null,
    hp: {
      min: monster.min_hp ?? null,
      max: monster.max_hp ?? null,
      ascensionMin: monster.min_hp_ascension ?? null,
      ascensionMax: monster.max_hp_ascension ?? null
    },
    moves: (monster.moves || []).map(move => ({
      id: move.id || null,
      name: move.name || move.id || null,
      intent: move.intent || null,
      damage: move.damage || null,
      block: move.block ?? null,
      heal: move.heal ?? null,
      powers: move.powers || [],
      description: stripMarkup(move.description || '') || null
    })),
    damageValues: monster.damage_values || {},
    blockValues: monster.block_values || {},
    innatePowers: monster.innate_powers || [],
    attackPattern: monster.attack_pattern || null,
    mechanicTags: mechanicTags(monster)
  };
}

function compactEncounter(encounter, monsterIndex) {
  if (!encounter) return null;
  const strategy = encounterStrategyIndex.get(normalizeKey(encounter.id));
  return {
    id: encounter.id || null,
    name: encounter.name || encounter.id || '未知遭遇',
    roomType: encounter.room_type || null,
    act: encounter.act || null,
    isWeak: Boolean(encounter.is_weak),
    tags: encounter.tags || [],
    exact: false,
    strategy: strategy ? {
      summary: strategy.summary,
      dangerWindows: strategy.dangerWindows,
      deckChecks: strategy.deckChecks,
      priorityTargets: strategy.priorityTargets,
      tips: strategy.tips,
      avoid: strategy.avoid,
      confidence: strategy.confidence,
      sources: strategy.sources
    } : null,
    monsters: (encounter.monsters || []).map(ref => compactMonster(resolveItem(ref, monsterIndex))).filter(Boolean)
  };
}

function resolveEncounter(ref, encounterIndex, monsterIndex) {
  if (!ref) return null;
  const encounter = resolveItem(ref, encounterIndex);
  const hasCatalogMatch = encounterIndex.has(normalizeKey(ref?.id || ref))
    || encounterIndex.has(normalizeKey(ref?.name || ref));
  if (hasCatalogMatch) return compactEncounter(encounter, monsterIndex);
  const monster = resolveItem(ref, monsterIndex);
  const hasMonsterMatch = monsterIndex.has(normalizeKey(ref?.id || ref))
    || monsterIndex.has(normalizeKey(ref?.name || ref));
  return hasMonsterMatch ? {
    id: null,
    name: monster.name,
    roomType: monster.type || null,
    act: null,
    exact: false,
    monsters: [compactMonster(monster)]
  } : null;
}

function attachEvaluation(card) {
  const evaluation = evaluationIndex.get(normalizeKey(card?.id))
    || evaluationIndex.get(normalizeKey(card?.originalId))
    || evaluationIndex.get(normalizeKey(card?.name));
  if (!evaluation) return card;
  return {
    ...card,
    evaluation: {
      capturedAt: cardEvaluations.capturedAt,
      gameVersion: cardEvaluations.game?.version || null,
      dataChannel: cardEvaluations.game?.channel || null,
      prior: evaluation.prior,
      community: evaluation.community,
      expertConsensus: evaluation.expertConsensus,
      mechanicTags: deriveMechanicTags({
        ...card,
        description: card.description || evaluation.description
      }, evaluation.mechanicTags),
      advice: evaluation.evaluation || null
    }
  };
}

function asList(body, key) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.[key])) return body[key];
  return [];
}

function createSpireCodexClient({
  baseURL = process.env.GAMEBUDDY_SPIRE_CODEX_URL || DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4500
} = {}) {
  let catalogsPromise;
  let encounterCatalogsPromise;

  async function fetchJson(pathname) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(baseURL).replace(/\/$/, '')}${pathname}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`spire codex http ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadEncounterCatalogs() {
    if (!encounterCatalogsPromise) {
      encounterCatalogsPromise = Promise.all([
        fetchJson('/monsters?lang=zhs'),
        fetchJson('/encounters?lang=zhs'),
        fetchJson('/powers?lang=zhs').catch(() => [])
      ]).then(([monstersBody, encountersBody, powersBody]) => {
        const monsters = asList(monstersBody, 'monsters');
        const encounters = asList(encountersBody, 'encounters');
        const powers = asList(powersBody, 'powers');
        return {
          monsters,
          encounters,
          powers,
          monsterIndex: makeIndex(monsters),
          encounterIndex: makeIndex(encounters),
          powerIndex: makeIndex(powers)
        };
      }).catch(error => {
        encounterCatalogsPromise = undefined;
        throw error;
      });
    }
    return encounterCatalogsPromise;
  }

  async function loadCatalogs() {
    if (!catalogsPromise) {
      catalogsPromise = Promise.all([
        fetchJson('/cards?lang=zhs'),
        fetchJson('/relics?lang=zhs'),
        fetchJson('/potions?lang=zhs'),
        loadEncounterCatalogs()
      ]).then(([cardsBody, relicsBody, potionsBody, encounterCatalogs]) => {
        const cards = asList(cardsBody, 'cards');
        const relics = asList(relicsBody, 'relics');
        const potions = asList(potionsBody, 'potions');
        return {
          cards,
          relics,
          potions,
          cardIndex: makeIndex(cards),
          relicIndex: makeIndex(relics),
          potionIndex: makeIndex(potions),
          ...encounterCatalogs
        };
      }).catch(error => {
        catalogsPromise = undefined;
        throw error;
      });
    }
    return catalogsPromise;
  }

  async function loadDraftContext(state, reward) {
    try {
      const catalogs = await loadCatalogs();
      const cards = (reward.cards || []).map(card => attachEvaluation(resolveItem(card, catalogs.cardIndex)));
      const deckCards = (state?.player?.cards || []).map(card => attachEvaluation(resolveItem(card, catalogs.cardIndex)));
      const relics = (state?.player?.relics || []).map(relic => resolveItem(relic, catalogs.relicIndex));
      const potions = (state?.player?.potions || []).map(potion => resolveItem(potion, catalogs.potionIndex));
      const act = Number(reward?.context?.act ?? state?.run?.act);
      const actId = reward?.context?.actId || state?.run?.actId || null;
      const mapNodes = state?.map?.nodes || [];
      const nodeIndex = new Map(mapNodes.map(node => [node.id, node]));
      const upcomingNodes = (state?.map?.routes || []).flatMap(route => {
        const currentAt = route.indexOf(state?.map?.current);
        const startAt = currentAt >= 0 ? currentAt + 1 : 0;
        return route.slice(startAt, startAt + 3).map(id => nodeIndex.get(id)).filter(Boolean);
      });
      const bossNode = mapNodes.find(node => node?.id === state?.map?.boss);
      const bossRef = reward?.context?.nextBossId
        || state?.run?.nextBossId
        || reward?.context?.nextBoss
        || state?.run?.nextBoss
        || bossNode?.encounterId
        || bossNode?.encounterName
        || null;
      const knownBoss = resolveEncounter(bossRef, catalogs.encounterIndex, catalogs.monsterIndex);
      if (knownBoss) knownBoss.exact = true;
      const possibleBosses = catalogs.encounters
        .filter(item => String(item.room_type).toLowerCase() === 'boss' && actMatches(item.act, act, actId))
        .map(item => compactEncounter(item, catalogs.monsterIndex));
      const possibleElites = catalogs.encounters
        .filter(item => String(item.room_type).toLowerCase() === 'elite' && actMatches(item.act, act, actId))
        .map(item => compactEncounter(item, catalogs.monsterIndex));
      const knownUpcomingElites = [...new Map(upcomingNodes
        .filter(node => String(node.type).toLowerCase() === 'elite' && (node.encounterId || node.encounterName))
        .map(node => resolveEncounter(node.encounterId || node.encounterName, catalogs.encounterIndex, catalogs.monsterIndex))
        .filter(Boolean)
        .map(item => [item.id || item.name, { ...item, exact: true }])).values()];
      const defeatedEncounters = (reward?.context?.defeatedEnemies || [])
        .map(ref => resolveEncounter(ref, catalogs.encounterIndex, catalogs.monsterIndex))
        .filter(Boolean)
        .map(item => ({ ...item, exact: true }));
      const offerIds = cards.map(card => card.id).filter(Boolean);
      const deckIds = [...new Set(deckCards.map(card => card.id).filter(Boolean))];
      const relicIds = [...new Set(relics.map(relic => relic.id).filter(Boolean))];
      const params = new URLSearchParams({
        character: String(state?.run?.character || '').toUpperCase(),
        cards: deckIds.join(','),
        relics: relicIds.join(','),
        offer: offerIds.join(','),
        lang: 'zhs'
      });
      let coach = null;
      if (params.get('character') && offerIds.length) {
        try {
          coach = await fetchJson(`/runs/pick-coach?${params.toString()}`);
        } catch {
          coach = null;
        }
      }
      return {
        available: true,
        source: 'spire-codex',
        cards,
        deckCards,
        relics,
        potions,
        threats: {
          knownBoss,
          possibleBosses: knownBoss ? [] : possibleBosses,
          possibleElites,
          knownUpcomingElites,
          defeatedEncounters
        },
        coach: coach?.available ? coach : null
      };
    } catch {
      return {
        available: false,
        source: 'bridge',
        cards: (reward.cards || []).map(card => attachEvaluation(typeof card === 'string' ? { id: card, name: card } : card)),
        deckCards: (state?.player?.cards || []).map(card => attachEvaluation(typeof card === 'string' ? { id: card, name: card } : card)),
        relics: state?.player?.relics || [],
        potions: state?.player?.potions || [],
        threats: { knownBoss: null, possibleBosses: [], possibleElites: [], knownUpcomingElites: [], defeatedEncounters: [] },
        coach: null
      };
    }
  }

  async function loadEncounterContext(state) {
    const catalogs = await loadEncounterCatalogs();
    const room = `${state?.run?.room || ''} ${state?.run?.currentNode || ''}`;
    const kind = /boss/i.test(room) ? 'Boss' : /elite/i.test(room) ? 'Elite' : 'Normal';
    const enemyRefs = (state?.combat?.enemies || []).filter(enemy => enemy && enemy.alive !== false);
    const actualEnemies = enemyRefs.map(enemy => (
      catalogs.monsterIndex.get(normalizeKey(enemy?.id))
      || catalogs.monsterIndex.get(normalizeKey(enemy?.name))
      || null
    )).filter(Boolean);
    const actId = state?.run?.actId || null;
    const act = state?.run?.act;
    let encounter = null;
    if (kind === 'Boss' && state?.run?.nextBossId) {
      const resolved = resolveItem(state.run.nextBossId, catalogs.encounterIndex);
      if (catalogs.encounterIndex.has(normalizeKey(state.run.nextBossId))) encounter = resolved;
    }
    if (!encounter) {
      const match = rankEncounterMatches(catalogs.encounters, enemyRefs, { kind, act, actId })[0] || null;
      encounter = match?.exactComposition ? match.item : null;
    }
    const encounterMonsters = (encounter?.monsters || []).map(ref => resolveItem(ref, catalogs.monsterIndex));
    const monstersToExplain = [...new Map((actualEnemies.length ? actualEnemies : encounterMonsters)
      .filter(monster => catalogs.monsterIndex.has(normalizeKey(monster.id)) || catalogs.monsterIndex.has(normalizeKey(monster.name)))
      .map(monster => [monster.id || monster.name, monster])).values()];
    const monsters = monstersToExplain.map(monster => ({
      ...compactMonster(monster),
      innatePowers: (monster.innate_powers || []).map(power => ({
        ...power,
        knowledge: resolveItem(power.power_id, catalogs.powerIndex)
      })),
      moves: (monster.moves || []).map(move => ({
        id: move.id || null,
        name: move.name || move.id || null,
        intent: move.intent || null,
        damage: move.damage || null,
        block: move.block ?? null,
        heal: move.heal ?? null,
        powers: (move.powers || []).map(power => ({
          ...power,
          knowledge: resolveItem(power.power_id, catalogs.powerIndex)
        }))
      }))
    }));
    return {
      available: true,
      source: 'spire-codex',
      kind,
      encounter: encounter ? {
        id: encounter.id,
        name: encounter.name,
        act: encounter.act,
        isWeak: Boolean(encounter.is_weak),
        tags: encounter.tags || []
      } : null,
      monsters
    };
  }

  return { loadDraftContext, loadEncounterContext };
}

module.exports = { DEFAULT_BASE_URL, normalizeKey, stripMarkup, mechanicTags, inferUpgraded, resolveItem, rankEncounterMatches, createSpireCodexClient };
