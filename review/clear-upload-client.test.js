const assert = require('node:assert/strict');
const { CLEAR_FIELDS, createClearUploadClient } = require('./clear-upload-client');

const record = {
  runId: 'run-clear',
  character: 'IRONCLAD',
  ascension: 10,
  gameMode: 'Standard',
  startedAt: 1_700_000_000_000,
  observedDurationSeconds: 321,
  combatSaveLoad: false,
  finalDeck: [{ id: 'STRIKE', upgraded: true }],
  finalRelics: [{ id: 'BURNING_BLOOD' }],
  selectedEvents: [{ eventId: 'FISH', pageId: 'INITIAL', optionId: 'BANANA' }],
  displayName: '阿达',
  playerId: '11111111-1111-4111-8111-111111111111',
  seed: 'secret-seed',
  playerName: 'Ada',
  account: 'acct',
  hp: 12,
  potions: [{ id: 'POT' }]
};

(async () => {
  let posted;
  const client = createClearUploadClient({
    baseUrl: 'https://board.test/',
    fetchImpl: async (url, init) => {
      posted = { url, init };
      return { status: 201 };
    }
  });
  const created = await client.submit(record);
  assert.equal(created.ok, true);
  assert.equal(created.status, 201);
  assert.equal(posted.url, 'https://board.test/v1/clears');
  assert.equal(posted.init.method, 'POST');
  const body = JSON.parse(posted.init.body);
  assert.deepEqual(Object.keys(body), CLEAR_FIELDS);
  assert.equal(body.runId, 'run-clear');
  assert.equal(body.seed, undefined);
  assert.equal(body.playerName, undefined);
  assert.equal(body.displayName, '阿达');
  assert.equal(body.playerId, '11111111-1111-4111-8111-111111111111');
  assert.equal(body.account, undefined);
  assert.equal(body.hp, undefined);
  assert.equal(body.potions, undefined);
  assert.deepEqual(body.finalDeck, [{ id: 'STRIKE', upgraded: true }]);
  assert.deepEqual(body.finalRelics, [{ id: 'BURNING_BLOOD' }]);

  const duplicate = createClearUploadClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => ({ status: 200 })
  });
  assert.deepEqual(await duplicate.submit(record), { ok: true, status: 200 });

  const rejected = createClearUploadClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => ({ status: 400 })
  });
  const rejection = await rejected.submit(record);
  assert.equal(rejection.ok, false);
  assert.equal(rejection.status, 400);

  const offline = createClearUploadClient({
    baseUrl: 'https://board.test',
    fetchImpl: async () => { throw new Error('offline'); }
  });
  const failure = await offline.submit(record);
  assert.equal(failure.ok, false);
  assert.equal(failure.reason, 'network_error');
  console.log('Clear upload client tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
