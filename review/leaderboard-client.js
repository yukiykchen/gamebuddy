'use strict';

const { SharedDanmakuClient } = require('../agent/danmaku/shared-client');

const GAME_MODES = ['Standard', 'Daily', 'Custom'];

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function projectLeaderboardRequest(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    character: source.character,
    ascension: source.ascension,
    gameMode: source.gameMode
  };
}

function normalizeLeaderboardQuery(input) {
  const character = typeof input.character === 'string' ? input.character.trim() : '';
  if (!character || character.length > 64) return null;
  if (!GAME_MODES.includes(input.gameMode)) return null;
  if (!Number.isInteger(input.ascension) || input.ascension < 0 || input.ascension > 10000) return null;
  return { character, ascension: input.ascension, gameMode: input.gameMode };
}

function createLeaderboardClient({ baseUrl, timeoutMs = 4000, fetchImpl, clientId } = {}) {
  const shared = new SharedDanmakuClient({ baseUrl, timeoutMs, clientId });
  const fetchFn = fetchImpl || globalThis.fetch;

  return {
    baseUrl: shared.baseUrl,
    async list(input) {
      const query = normalizeLeaderboardQuery(projectLeaderboardRequest(input));
      if (!query) return { ok: false, reason: 'invalid_query' };
      if (!shared.baseUrl || typeof fetchFn !== 'function') {
        return { ok: false, reason: 'shared_service_not_configured' };
      }
      const url = new URL(`${shared.baseUrl}/v1/leaderboard`);
      url.searchParams.set('character', query.character);
      url.searchParams.set('ascension', String(query.ascension));
      url.searchParams.set('gameMode', query.gameMode);
      const request = withTimeout(shared.timeoutMs);
      try {
        const response = await fetchFn(url.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-gamebuddy-client': shared.clientId
          },
          signal: request.signal
        });
        if (response?.status !== 200) {
          return { ok: false, status: response?.status, reason: 'rejected' };
        }
        try {
          const body = await response.json();
          if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.items)) {
            return { ok: false, status: response.status, reason: 'invalid_response' };
          }
          const enabled = body.enabled !== false;
          return { ok: true, enabled, items: enabled ? body.items : [] };
        } catch {
          return { ok: false, status: response.status, reason: 'invalid_response' };
        }
      } catch (error) {
        return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network_error' };
      } finally {
        request.clear();
      }
    }
  };
}

module.exports = {
  GAME_MODES,
  createLeaderboardClient,
  projectLeaderboardRequest
};
