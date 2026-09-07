const DEFAULT_BASE_URL = 'https://spire-codex.com/api';

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
        fetchJson('/relics?lang=zhs')
      ]).then(([cardsBody, relicsBody]) => {
        const cards = asList(cardsBody, 'cards');
        const relics = asList(relicsBody, 'relics');
        return {
          cards,
          relics,
          cardIndex: makeIndex(cards),
          relicIndex: makeIndex(relics)
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
      const cards = (reward.cards || []).map(card => resolveItem(card, catalogs.cardIndex));
      const deckCards = (state?.player?.cards || []).map(card => resolveItem(card, catalogs.cardIndex));
      const relics = (state?.player?.relics || []).map(relic => resolveItem(relic, catalogs.relicIndex));
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
        coach: coach?.available ? coach : null
      };
    } catch {
      return {
        available: false,
        source: 'bridge',
        cards: (reward.cards || []).map(card => typeof card === 'string' ? { id: card, name: card } : card),
        deckCards: state?.player?.cards || [],
        relics: state?.player?.relics || [],
        coach: null
      };
    }
  }

  return { loadDraftContext };
}

module.exports = { DEFAULT_BASE_URL, normalizeKey, stripMarkup, createSpireCodexClient };
