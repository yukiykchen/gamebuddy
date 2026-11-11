const MAX_TEXT = 80;
const MAX_SCENE_KEY = 180;
const DAILY_SUBMISSIONS = 20;

const json = (body, status = 200, request) => new Response(status === 204 ? null : JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': request?.headers.get('origin') || '*',
    'access-control-allow-headers': 'content-type, x-gamebuddy-client',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store'
  }
});

function clean(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validSceneKey(value) {
  const sceneKey = clean(value, MAX_SCENE_KEY);
  return sceneKey && /^[\p{Letter}\p{Number}_:+-]+$/u.test(sceneKey) ? sceneKey : '';
}

function validPhase(value) {
  return value === 'death' ? 'death' : value === 'combat' ? 'combat' : '';
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authorHash(request, env) {
  const client = clean(request.headers.get('x-gamebuddy-client'), 120) || 'anonymous';
  return sha256(`${env.SHARED_DANMAKU_SALT || 'change-me'}:${client}`);
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function listMessages(request, env) {
  const url = new URL(request.url);
  const sceneKey = validSceneKey(url.searchParams.get('sceneKey'));
  const phase = validPhase(url.searchParams.get('phase'));
  if (!sceneKey || !phase) return json({ error: 'sceneKey and phase are required' }, 400, request);
  const result = await env.DB.prepare(`
    SELECT id, scene_key AS sceneKey, phase, text, character, game_version AS gameVersion
    FROM shared_danmaku
    WHERE scene_key = ?1 AND phase = ?2 AND status = 'active' AND report_count < 3
    ORDER BY RANDOM()
  `).bind(sceneKey, phase).all();
  const items = result.results || [];
  if (items.length) {
    await env.DB.prepare(`
      UPDATE shared_danmaku
      SET served_count = served_count + 1
      WHERE scene_key = ?1 AND phase = ?2 AND status = 'active' AND report_count < 3
    `).bind(sceneKey, phase).run();
  }
  return json({ items }, 200, request);
}

async function createMessage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, request);
  }
  const sceneKey = validSceneKey(body?.sceneKey);
  const phase = validPhase(body?.phase);
  const text = clean(body?.text, MAX_TEXT);
  const character = clean(body?.character, 32);
  const gameVersion = clean(body?.gameVersion, 32);
  if (!sceneKey || !phase || !text) return json({ error: 'sceneKey, phase and text are required' }, 400, request);

  const author = await authorHash(request, env);
  const today = new Date().toISOString().slice(0, 10);
  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM shared_danmaku
    WHERE author_hash = ?1 AND created_day = ?2
  `).bind(author, today).first();
  if (Number(count?.count || 0) >= DAILY_SUBMISSIONS) {
    return json({ error: 'daily_limit_reached' }, 429, request);
  }
  const duplicate = await env.DB.prepare(`
    SELECT id FROM shared_danmaku
    WHERE author_hash = ?1 AND scene_key = ?2 AND phase = ?3 AND text = ?4 AND status = 'active'
    LIMIT 1
  `).bind(author, sceneKey, phase, text).first();
  if (duplicate?.id) return json({ error: 'duplicate_message' }, 409, request);

  const item = {
    id: randomId(), sceneKey, phase, text, character, gameVersion
  };
  await env.DB.prepare(`
    INSERT INTO shared_danmaku
      (id, scene_key, phase, text, character, game_version, author_hash, created_day, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(item.id, sceneKey, phase, text, character, gameVersion, author, today, Date.now()).run();
  return json({ item }, 201, request);
}

async function reportMessage(request, env, id) {
  const messageId = clean(id, 80);
  if (!messageId) return json({ error: 'missing_id' }, 400, request);
  const result = await env.DB.prepare(`
    UPDATE shared_danmaku
    SET report_count = report_count + 1,
        status = CASE WHEN report_count + 1 >= 3 THEN 'hidden' ELSE status END
    WHERE id = ?1 AND status = 'active'
  `).bind(messageId).run();
  return result.meta?.changes ? json({ accepted: true }, 200, request) : json({ error: 'not_found' }, 404, request);
}

const MAX_CLEAR_ID = 128;
const MAX_CLEAR_LIST = 300;

function now(env) {
  return typeof env?.now === 'function' ? Number(env.now()) : Date.now();
}

function validToken(value, max = MAX_CLEAR_ID) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function validEventText(value) {
  return typeof value === 'string' && value.length <= MAX_CLEAR_ID && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseDeck(value) {
  if (!Array.isArray(value) || value.length > MAX_CLEAR_LIST) return null;
  const deck = [];
  for (const card of value) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    if (!validToken(card.id) || typeof card.upgraded !== 'boolean') return null;
    if (Object.keys(card).some(key => key !== 'id' && key !== 'upgraded')) return null;
    deck.push({ id: card.id, upgraded: card.upgraded });
  }
  return deck;
}

function parseRelics(value) {
  if (!Array.isArray(value) || value.length > MAX_CLEAR_LIST) return null;
  const relics = [];
  for (const relic of value) {
    if (!relic || typeof relic !== 'object' || Array.isArray(relic)) return null;
    if (!validToken(relic.id)) return null;
    if (Object.keys(relic).some(key => key !== 'id')) return null;
    relics.push({ id: relic.id });
  }
  return relics;
}

function parseEvents(value) {
  if (!Array.isArray(value) || value.length > MAX_CLEAR_LIST) return null;
  const events = [];
  for (const event of value) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    if (!validEventText(event.eventId) || !validEventText(event.pageId) || !validEventText(event.optionId)) return null;
    if (Object.keys(event).some(key => key !== 'eventId' && key !== 'pageId' && key !== 'optionId')) return null;
    events.push({ eventId: event.eventId, pageId: event.pageId, optionId: event.optionId });
  }
  return events;
}

function parseClearBody(body) {
  const finalDeck = parseDeck(body?.finalDeck);
  const finalRelics = parseRelics(body?.finalRelics);
  const selectedEvents = parseEvents(body?.selectedEvents);
  if (!validToken(body?.runId) || !validToken(body?.character, 64) || !validToken(body?.gameMode, 64)) return null;
  if (!Number.isInteger(body?.ascension) || body.ascension < 0 || body.ascension > 10000) return null;
  if (!Number.isInteger(body?.observedDurationSeconds) || body.observedDurationSeconds < 0 || body.observedDurationSeconds > 60 * 60 * 24 * 30) {
    return null;
  }
  if (!Number.isInteger(body?.startedAt) || body.startedAt < 0 || body.startedAt > 4_102_444_800_000) return null;
  if (typeof body?.combatSaveLoad !== 'boolean' || !finalDeck || !finalRelics || !selectedEvents) return null;
  const displayName = String(body?.displayName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) || '匿名人士';
  if (!validToken(body?.playerId, 64)) return null;
  return {
    runId: body.runId,
    character: body.character,
    ascension: body.ascension,
    gameMode: body.gameMode,
    startedAt: body.startedAt,
    observedDurationSeconds: body.observedDurationSeconds,
    combatSaveLoad: body.combatSaveLoad,
    finalDeck,
    finalRelics,
    selectedEvents,
    displayName,
    playerId: body.playerId
  };
}

function mapClear(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    character: row.character,
    ascension: row.ascension,
    gameMode: row.game_mode,
    startedAt: row.started_at,
    observedDurationSeconds: row.observed_duration_seconds,
    combatSaveLoad: Boolean(row.combat_save_load),
    finalDeck: JSON.parse(row.final_deck),
    finalRelics: JSON.parse(row.final_relics),
    selectedEvents: JSON.parse(row.selected_events),
    displayName: row.display_name || '匿名人士',
    playerId: row.player_id,
    createdAt: row.created_at
  };
}

async function createClear(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, request);
  }
  const clear = parseClearBody(body);
  if (!clear) return json({ error: 'invalid_clear' }, 400, request);
  const createdAt = now(env);
  const inserted = await env.CLEARS_DB.prepare(`
    INSERT OR IGNORE INTO clears
      (run_id, character, ascension, game_mode, started_at, observed_duration_seconds, combat_save_load,
       final_deck, final_relics, selected_events, display_name, player_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  `).bind(
    clear.runId,
    clear.character,
    clear.ascension,
    clear.gameMode,
    clear.startedAt,
    clear.observedDurationSeconds,
    clear.combatSaveLoad ? 1 : 0,
    JSON.stringify(clear.finalDeck),
    JSON.stringify(clear.finalRelics),
    JSON.stringify(clear.selectedEvents),
    clear.displayName,
    clear.playerId,
    createdAt
  ).run();
  const row = await env.CLEARS_DB.prepare(`
    SELECT run_id, character, ascension, game_mode, started_at, observed_duration_seconds, combat_save_load,
           final_deck, final_relics, selected_events, display_name, player_id, created_at
    FROM clears
    WHERE run_id = ?1
  `).bind(clear.runId).first();
  if (!row) return json({ error: 'server_error' }, 500, request);
  const created = Number(inserted?.meta?.changes || 0) > 0;
  return json(mapClear(row), created ? 201 : 200, request);
}

function leaderboardQuery(url) {
  const character = url.searchParams.get('character');
  const gameMode = url.searchParams.get('gameMode');
  const ascensionText = url.searchParams.get('ascension');
  if (!validToken(character, 64) || !validToken(gameMode, 64) || !/^(0|[1-9]\d*)$/.test(ascensionText || '')) {
    return null;
  }
  const ascension = Number(ascensionText);
  if (!Number.isInteger(ascension) || ascension > 10000) return null;
  return { character, ascension, gameMode };
}

async function leaderboardEnabled(env) {
  const row = await env.CLEARS_DB.prepare('SELECT enabled FROM leaderboard_config WHERE id = 1').first();
  return Number(row?.enabled) === 1;
}

async function listLeaderboard(request, env) {
  const query = leaderboardQuery(new URL(request.url));
  if (!query) return json({ error: 'character, ascension and gameMode are required' }, 400, request);
  if (!await leaderboardEnabled(env)) return json({ enabled: false, items: [] }, 200, request);
  const result = await env.CLEARS_DB.prepare(`
    SELECT run_id, character, ascension, game_mode, started_at, observed_duration_seconds, combat_save_load,
           final_deck, final_relics, selected_events, display_name, player_id, created_at
    FROM clears
    WHERE character = ?1 AND ascension = ?2 AND game_mode = ?3
    ORDER BY observed_duration_seconds ASC, created_at ASC, run_id ASC
  `).bind(query.character, query.ascension, query.gameMode).all();
  const items = (result.results || []).map(mapClear);
  return json({ enabled: true, items }, 200, request);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({}, 204, request);
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true }, 200, request);
    if (url.pathname.startsWith('/v1/danmaku/') && request.method === 'POST' && url.pathname.endsWith('/report')) {
      const id = url.pathname.slice('/v1/danmaku/'.length, -'/report'.length);
      return await reportMessage(request, env, id);
    }
    if (url.pathname === '/v1/clears' || url.pathname === '/v1/leaderboard') {
      try {
        if (url.pathname === '/v1/clears' && request.method === 'POST') return await createClear(request, env);
        if (url.pathname === '/v1/leaderboard' && request.method === 'GET') return await listLeaderboard(request, env);
        return json({ error: 'method_not_allowed' }, 405, request);
      } catch (error) {
        console.error(error);
        return json({ error: 'server_error' }, 500, request);
      }
    }
    if (url.pathname !== '/v1/danmaku') return json({ error: 'not_found' }, 404, request);
    try {
      if (request.method === 'GET') return await listMessages(request, env);
      if (request.method === 'POST') return await createMessage(request, env);
      return json({ error: 'method_not_allowed' }, 405, request);
    } catch (error) {
      console.error(error);
      return json({ error: 'server_error' }, 500, request);
    }
  }
};
