const DEFAULT_BASE_URL = 'https://spire-codex.com/api';
const cardEvaluations = require('./card-evaluations.json');
const evaluationIndex = new Map();
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

function resolveItem(ref, index) {
  const raw = typeof ref === 'string' ? { id: ref, name: ref } : (ref || {});
  const match = index.get(normalizeKey(raw.id)) || index.get(normalizeKey(raw.name));
  return match ? { ...raw, ...match, originalId: raw.id || raw.name } : { ...raw };
}

function actMatches(value, act, actId) {
  const normalizedActId = normalizeKey(actId);
  if (normalizedActId) return normalizeKey(value).includes(normalizedActId);
  if (!Number.isFinite(Number(act))) return false;
  return new RegExp(`\\bAct\\s+${Number(act)}\\b`, 'i').test(String(value || ''));
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
  if (moves.some(move => Number(move?.block) > 0)) tags.push('block');
  if (moves.some(move => {
    const damage = move?.damage || {};
    return Math.max(Number(damage.normal) || 0, Number(damage.ascension) || 0)
      * Math.max(1, Number(damage.hit_count) || 1) >= 24;
  })) tags.push('burst_damage');
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
  return {
    id: encounter.id || null,
    name: encounter.name || encounter.id || '未知遭遇',
    roomType: encounter.room_type || null,
    act: encounter.act || null,
    isWeak: Boolean(encounter.is_weak),
    tags: encounter.tags || [],
    exact: false,
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
      mechanicTags: evaluation.mechanicTags,
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

  async function loadCatalogs() {
    if (!catalogsPromise) {
      catalogsPromise = Promise.all([
        fetchJson('/cards?lang=zhs'),
        fetchJson('/relics?lang=zhs'),
        fetchJson('/potions?lang=zhs'),
        fetchJson('/monsters?lang=zhs'),
        fetchJson('/encounters?lang=zhs')
      ]).then(([cardsBody, relicsBody, potionsBody, monstersBody, encountersBody]) => {
        const cards = asList(cardsBody, 'cards');
        const relics = asList(relicsBody, 'relics');
        const potions = asList(potionsBody, 'potions');
        const monsters = asList(monstersBody, 'monsters');
        const encounters = asList(encountersBody, 'encounters');
        return {
          cards,
          relics,
          potions,
          monsters,
          encounters,
          cardIndex: makeIndex(cards),
          relicIndex: makeIndex(relics),
          potionIndex: makeIndex(potions),
          monsterIndex: makeIndex(monsters),
          encounterIndex: makeIndex(encounters)
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

  return { loadDraftContext };
}

module.exports = { DEFAULT_BASE_URL, normalizeKey, stripMarkup, mechanicTags, createSpireCodexClient };
