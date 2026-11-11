import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.js';

function createDb({ enabled = 1 } = {}) {
  const clears = [];
  return {
    prepare(sql) {
      const text = sql.replace(/\s+/g, ' ').trim();
      return {
        async first() {
          if (text.includes('leaderboard_config')) return { enabled };
          throw new Error(text);
        },
        bind(...params) {
          return {
            async run() {
              if (!text.includes('INSERT OR IGNORE INTO clears')) throw new Error(text);
              const [runId, character, ascension, gameMode, startedAt, duration, saveLoad, deck, relics, events, displayName, playerId, createdAt] = params;
              if (clears.some(row => row.run_id === runId)) return { meta: { changes: 0 } };
              clears.push({
                run_id: runId,
                character,
                ascension,
                game_mode: gameMode,
                started_at: startedAt,
                observed_duration_seconds: duration,
                combat_save_load: saveLoad,
                final_deck: deck,
                final_relics: relics,
                selected_events: events,
                display_name: displayName,
                player_id: playerId,
                created_at: createdAt
              });
              return { meta: { changes: 1 } };
            },
            async first() {
              if (text.includes('leaderboard_config')) return { enabled };
              if (!text.includes('WHERE run_id = ?1')) throw new Error(text);
              return clears.find(row => row.run_id === params[0]) || null;
            },
            async all() {
              if (!text.includes('ORDER BY observed_duration_seconds ASC, created_at ASC, run_id ASC')) {
                throw new Error(text);
              }
              if (text.includes('shared_danmaku')) throw new Error(text);
              const [character, ascension, gameMode] = params;
              const results = clears
                .filter(row => row.character === character && row.ascension === ascension && row.game_mode === gameMode)
                .sort((left, right) => left.observed_duration_seconds - right.observed_duration_seconds
                  || left.created_at - right.created_at
                  || left.run_id.localeCompare(right.run_id));
              return { results };
            }
          };
        }
      };
    }
  };
}

function record(runId, duration, createdAt) {
  return {
    runId,
    character: 'IRONCLAD',
    ascension: 10,
    gameMode: 'Standard',
    startedAt: 1_700_000_000_000,
    observedDurationSeconds: duration,
    combatSaveLoad: false,
    finalDeck: [{ id: 'STRIKE', upgraded: true }],
    finalRelics: [{ id: 'BURNING_BLOOD' }],
    selectedEvents: [{ eventId: 'FISH', pageId: 'INITIAL', optionId: 'BANANA' }],
    displayName: '阿达',
    playerId: '11111111-1111-4111-8111-111111111111',
    createdAt
  };
}

async function post(env, body) {
  return worker.fetch(new Request('https://board.test/v1/clears', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), env);
}

test('clears insert, ignore duplicates, and rank by duration', async () => {
  let time = 1_000;
  const env = { DB: createDb(), CLEARS_DB: createDb(), now: () => time };
  const first = await post(env, record('run-b', 30));
  assert.equal(first.status, 201);
  const created = await first.json();
  assert.equal(created.runId, 'run-b');
  assert.equal(created.createdAt, 1_000);
  assert.equal(created.combatSaveLoad, false);
  assert.equal(created.displayName, '阿达');
  assert.equal(created.playerId, '11111111-1111-4111-8111-111111111111');
  const anonymous = await post(env, { ...record('run-anon', 12), character: 'SILENT', displayName: '   ' });
  assert.equal(anonymous.status, 201);
  assert.equal((await anonymous.json()).displayName, '匿名人士');

  time = 1_000;
  const duplicate = await post(env, { ...record('run-b', 1), character: 'SILENT', observedDurationSeconds: 1 });
  assert.equal(duplicate.status, 200);
  const existing = await duplicate.json();
  assert.equal(existing.character, 'IRONCLAD');
  assert.equal(existing.observedDurationSeconds, 30);
  assert.equal(existing.createdAt, 1_000);

  time = 3_000;
  assert.equal((await post(env, record('run-a', 10))).status, 201);
  time = 2_000;
  assert.equal((await post(env, record('run-c', 10))).status, 201);
  time = 4_000;
  assert.equal((await post(env, { ...record('run-other', 1), character: 'SILENT', gameMode: 'Daily', ascension: 0 })).status, 201);
  time = 5_000;
  assert.equal((await post(env, { ...record('run-tie-b', 5), ascension: 3 })).status, 201);
  assert.equal((await post(env, { ...record('run-tie-a', 5), ascension: 3 })).status, 201);

  const ranked = await worker.fetch(new Request(
    'https://board.test/v1/leaderboard?character=IRONCLAD&ascension=10&gameMode=Standard'
  ), env);
  assert.equal(ranked.status, 200);
  const body = await ranked.json();
  assert.deepEqual(body.items.map(item => item.runId), ['run-c', 'run-a', 'run-b']);
  assert.deepEqual(body.items.map(item => item.observedDurationSeconds), [10, 10, 30]);

  const ties = await worker.fetch(new Request(
    'https://board.test/v1/leaderboard?character=IRONCLAD&ascension=3&gameMode=Standard'
  ), env);
  assert.deepEqual((await ties.json()).items.map(item => item.runId), ['run-tie-a', 'run-tie-b']);

  const missing = await worker.fetch(new Request('https://board.test/v1/leaderboard?character=IRONCLAD'), env);
  assert.equal(missing.status, 400);
  const invalid = await post(env, { runId: 'x', seed: 'nope' });
  assert.equal(invalid.status, 400);
});

test('leaderboard stays empty until the config switch is on', async () => {
  const env = { DB: createDb(), CLEARS_DB: createDb({ enabled: 0 }), now: () => 1 };
  assert.equal((await post(env, record('run-hidden', 10))).status, 201);
  const hidden = await worker.fetch(new Request(
    'https://board.test/v1/leaderboard?character=IRONCLAD&ascension=10&gameMode=Standard'
  ), env);
  assert.equal(hidden.status, 200);
  assert.deepEqual(await hidden.json(), { enabled: false, items: [] });
});

test('danmaku routes stay on their existing responses', async () => {
  const env = { DB: createDb(), CLEARS_DB: createDb() };
  const list = await worker.fetch(new Request('https://board.test/v1/danmaku'), env);
  assert.equal(list.status, 400);
  const created = await worker.fetch(new Request('https://board.test/v1/danmaku', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hi' })
  }), env);
  assert.equal(created.status, 400);
  const absent = await worker.fetch(new Request('https://board.test/v1/other'), env);
  assert.equal(absent.status, 404);
  const wrongMethod = await worker.fetch(new Request('https://board.test/v1/clears'), env);
  assert.equal(wrongMethod.status, 405);
});
