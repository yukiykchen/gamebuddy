'use strict';

const { SharedDanmakuClient } = require('../agent/danmaku/shared-client');
const { summarize } = require('./fact-service');
const { normalizeDisplayName } = require('./player-profile');

const CLEAR_FIELDS = [
  'runId',
  'character',
  'ascension',
  'gameMode',
  'startedAt',
  'observedDurationSeconds',
  'combatSaveLoad',
  'finalDeck',
  'finalRelics',
  'selectedEvents',
  'displayName',
  'playerId'
];

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function nonEmptyString(value, maximum = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function uploadDeck(deck) {
  if (!Array.isArray(deck)) return null;
  const cards = [];
  for (const card of deck) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    if (!nonEmptyString(card.id, 128) || typeof card.upgraded !== 'boolean') return null;
    cards.push({ id: card.id, upgraded: card.upgraded });
  }
  return cards;
}

function uploadRelics(relics) {
  if (!Array.isArray(relics)) return null;
  const items = [];
  for (const relic of relics) {
    if (!relic || typeof relic !== 'object' || Array.isArray(relic)) return null;
    if (!nonEmptyString(relic.id, 128)) return null;
    items.push({ id: relic.id });
  }
  return items;
}

function uploadEvents(events) {
  if (!Array.isArray(events)) return null;
  const selected = [];
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    if (typeof event.eventId !== 'string' || typeof event.pageId !== 'string' || typeof event.optionId !== 'string') {
      return null;
    }
    selected.push({ eventId: event.eventId, pageId: event.pageId, optionId: event.optionId });
  }
  return selected;
}

function clearRecordFromSummary(summary, identity = {}) {
  if (!summary || summary.result !== 'win') return null;
  const finalDeck = uploadDeck(summary.finalDeck);
  const finalRelics = uploadRelics(summary.finalRelics);
  const selectedEvents = uploadEvents(summary.selectedEvents);
  if (!finalDeck || !finalRelics || !selectedEvents) return null;
  if (!nonEmptyString(summary.runId) || !nonEmptyString(summary.character) || !nonEmptyString(summary.gameMode, 64)) {
    return null;
  }
  if (!Number.isInteger(summary.ascension) || summary.ascension < 0) return null;
  if (!Number.isInteger(summary.observedDurationSeconds) || summary.observedDurationSeconds < 0) return null;
  if (!Number.isInteger(summary.startedAt) || summary.startedAt < 0) return null;
  return {
    runId: summary.runId,
    character: summary.character,
    ascension: summary.ascension,
    gameMode: summary.gameMode,
    startedAt: summary.startedAt,
    observedDurationSeconds: summary.observedDurationSeconds,
    combatSaveLoad: summary.combatSaveLoad === true,
    finalDeck,
    finalRelics,
    selectedEvents,
    displayName: normalizeDisplayName(identity.displayName),
    playerId: typeof identity.playerId === 'string' ? identity.playerId : ''
  };
}

function createClearUploadClient({ baseUrl, timeoutMs = 4000, fetchImpl, clientId } = {}) {
  const shared = new SharedDanmakuClient({ baseUrl, timeoutMs, clientId });
  const fetchFn = fetchImpl || globalThis.fetch;

  return {
    baseUrl: shared.baseUrl,
    async submit(record) {
      const request = withTimeout(shared.timeoutMs);
      try {
        if (!shared.enabled || typeof fetchFn !== 'function') {
          return { ok: false, reason: 'shared_service_not_configured' };
        }
        const payload = {};
        for (const field of CLEAR_FIELDS) payload[field] = record?.[field];
        const response = await fetchFn(`${shared.baseUrl}/v1/clears`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-gamebuddy-client': shared.clientId
          },
          body: JSON.stringify(payload),
          signal: request.signal
        });
        if (response.status !== 200 && response.status !== 201) {
          return { ok: false, status: response.status, reason: 'rejected' };
        }
        return { ok: true, status: response.status };
      } catch (error) {
        return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network_error' };
      } finally {
        request.clear();
      }
    }
  };
}

function submitClearedRun({ fact, stored, replay = false, facts, coverage, client, identity, summarizeRun = summarize } = {}) {
  try {
    if (!stored?.durable || stored.duplicate || replay) return Promise.resolve(null);
    if (!fact || fact.eventType !== 'run.ended' || fact.payload?.cleared !== true) return Promise.resolve(null);
    const loadedFacts = typeof facts === 'function' ? facts() : facts;
    const loadedCoverage = typeof coverage === 'function' ? coverage() : coverage;
    const profile = typeof identity === 'function' ? identity() : identity;
    const record = clearRecordFromSummary(summarizeRun(fact.runId, loadedFacts || [], loadedCoverage || {}), profile || {});
    if (!record || !client || typeof client.submit !== 'function') return Promise.resolve(null);
    return Promise.resolve()
      .then(() => client.submit(record))
      .catch(() => ({ ok: false, reason: 'clear_upload_failed' }));
  } catch {
    return Promise.resolve({ ok: false, reason: 'clear_upload_failed' });
  }
}

module.exports = {
  CLEAR_FIELDS,
  clearRecordFromSummary,
  createClearUploadClient,
  submitClearedRun
};
