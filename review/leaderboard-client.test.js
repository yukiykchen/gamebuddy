const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLeaderboardClient, projectLeaderboardRequest } = require('./leaderboard-client');

function jsonResponse(status, body) {
  return {
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

(async () => {
  const calls = [];
  const client = createLeaderboardClient({
    baseUrl: 'https://board.test/',
    clientId: 'lb-test',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, {
        items: [{ runId: 'run-1', displayName: '阿达', playerId: 'secret-player' }],
        next: 'ignored'
      });
    }
  });

  const listed = await client.list({
    character: ' silent ',
    ascension: 10,
    gameMode: 'Daily',
    url: 'https://evil.example/steal',
    method: 'POST',
    headers: { authorization: 'secret' },
    baseUrl: 'https://evil.example'
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.items[0].displayName, '阿达');
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, 'https://board.test');
  assert.equal(url.pathname, '/v1/leaderboard');
  assert.equal(url.searchParams.get('character'), 'silent');
  assert.equal(url.searchParams.get('ascension'), '10');
  assert.equal(url.searchParams.get('gameMode'), 'Daily');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(calls[0].init.headers, {
    accept: 'application/json',
    'x-gamebuddy-client': 'lb-test'
  });
  assert.equal(calls[0].init.headers.authorization, undefined);

  const encodedCalls = [];
  const encodedClient = createLeaderboardClient({
    baseUrl: 'https://board.test',
    clientId: 'lb-test',
    fetchImpl: async (requestUrl, init) => {
      encodedCalls.push({ url: requestUrl, init });
      return jsonResponse(200, { items: [] });
    }
  });
  const empty = await encodedClient.list({ character: 'a&b', ascension: 0, gameMode: 'Custom' });
  assert.deepEqual(empty, { ok: true, enabled: true, items: [] });
  assert.match(encodedCalls[0].url, /character=a%26b/);
  assert.equal(new URL(encodedCalls[0].url).searchParams.get('character'), 'a&b');
  assert.equal(new URL(encodedCalls[0].url).searchParams.get('gameMode'), 'Custom');

  assert.deepEqual(projectLeaderboardRequest({
    character: 'ironclad',
    ascension: 0,
    gameMode: 'Standard',
    url: 'https://evil.example',
    method: 'DELETE',
    headers: { cookie: 'nope' }
  }), { character: 'ironclad', ascension: 0, gameMode: 'Standard' });

  const projectedCalls = [];
  const projectedClient = createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async (requestUrl, init) => {
      projectedCalls.push({ url: requestUrl, init });
      return jsonResponse(200, { items: [] });
    }
  });
  async function handleListLeaderboard(_event, input) {
    return projectedClient.list(projectLeaderboardRequest(input));
  }
  const bridge = {
    listLeaderboard: filters => handleListLeaderboard({}, projectLeaderboardRequest(filters))
  };
  const bridged = await bridge.listLeaderboard({
    character: 'defect',
    ascension: 2,
    gameMode: 'Custom',
    url: 'https://evil.example/v1/leaderboard',
    method: 'POST',
    headers: { authorization: 'nope' }
  });
  assert.equal(bridged.ok, true);
  assert.equal(new URL(projectedCalls[0].url).origin, 'https://board.test');
  assert.equal(projectedCalls[0].init.method, 'GET');
  assert.equal(projectedCalls[0].init.headers.authorization, undefined);
  assert.equal(new URL(projectedCalls[0].url).searchParams.get('character'), 'defect');

  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const preloadBridge = preload.match(/listLeaderboard:\s*filters\s*=>\s*ipcRenderer\.invoke\(\s*'review:listLeaderboard',\s*\{([^}]*)\}\s*\)/);
  assert.ok(preloadBridge, 'preload must project leaderboard filters inline');
  assert.match(preloadBridge[1], /character:\s*filters\?\.character/);
  assert.match(preloadBridge[1], /ascension:\s*filters\?\.ascension/);
  assert.match(preloadBridge[1], /gameMode:\s*filters\?\.gameMode/);
  assert.doesNotMatch(preloadBridge[1], /url|method|headers|baseUrl|filters\s*\}/);
  assert.doesNotMatch(preload, /require\('\.\/review\/leaderboard-client'\)/);
  assert.match(main, /ipcMain\.handle\(\s*'review:listLeaderboard',\s*\(_event,\s*input\)\s*=>\s*\(\s*leaderboardClient\.list\(projectLeaderboardRequest\(input\)\)\s*\)\s*\)/);

  const limits = createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => {
      throw new Error('should not fetch');
    }
  });
  assert.deepEqual(await limits.list({ character: '', ascension: 0, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: '   ', ascension: 0, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'x'.repeat(65), ascension: 0, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'ironclad', ascension: -1, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'ironclad', ascension: 10001, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'ironclad', ascension: 1.5, gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'ironclad', ascension: '10', gameMode: 'Standard' }), { ok: false, reason: 'invalid_query' });
  assert.deepEqual(await limits.list({ character: 'ironclad', ascension: 0, gameMode: 'standard' }), { ok: false, reason: 'invalid_query' });

  const capped = createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => jsonResponse(200, { items: [] })
  });
  assert.equal((await capped.list({ character: 'x'.repeat(64), ascension: 10000, gameMode: 'Standard' })).ok, true);

  assert.deepEqual(await createLeaderboardClient({ baseUrl: '' }).list({
    character: 'ironclad',
    ascension: 0,
    gameMode: 'Standard'
  }), { ok: false, reason: 'shared_service_not_configured' });

  const rejected = await createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => jsonResponse(503, { error: 'nope' })
  }).list({ character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 503);
  assert.equal(rejected.reason, 'rejected');

  const offline = await createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => { throw new Error('offline'); }
  }).list({ character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.deepEqual(offline, { ok: false, reason: 'network_error' });

  const badJson = await createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => jsonResponse(200, new Error('bad json'))
  }).list({ character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.equal(badJson.reason, 'invalid_response');

  const badShape = await createLeaderboardClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => jsonResponse(200, { items: { runId: 'nope' } })
  }).list({ character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.equal(badShape.ok, false);
  assert.equal(badShape.reason, 'invalid_response');

  const timed = await createLeaderboardClient({
    baseUrl: 'https://board.test',
    timeoutMs: 1000,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })
  }).list({ character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.deepEqual(timed, { ok: false, reason: 'timeout' });

  console.log('Leaderboard client tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
