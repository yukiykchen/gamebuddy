'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSharedScene, characterKey, sceneObjectKey } = require('../danmaku/shared-scene');
const { SharedDanmakuClient } = require('../danmaku/shared-client');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');

function observation(sequence, enemy = { id: 'NIBBIT', name: '小啃兽', intent: 'attack', alive: true }) {
  return {
    schema: 'gamebuddy.observation.v1',
    sequence,
    fresh: true,
    state: {
      run: { character: 'ironclad', room: 'combat', act: 1, floor: 1 },
      player: { hp: 60, maxHp: 80 },
      combat: { turn: sequence, enemies: [enemy] }
    }
  };
}

test('shared scene is grouped by character and enemy composition only', () => {
  const state = {
    run: { character: '战士' },
    combat: { enemies: [{ id: 'Jaw_Worm', name: '小啃兽', alive: true, hp: 10 }] },
    player: { hp: 12, maxHp: 80 }
  };
  const scene = buildSharedScene(state, 'combat');
  assert.equal(characterKey('战士'), 'ironclad');
  assert.equal(sceneObjectKey(state), 'jaw_worm');
  assert.equal(scene.sceneKey, 'sts2-v1:ironclad:combat:jaw_worm');
  assert.equal(scene.phase, 'combat');
  assert.equal(buildSharedScene({ ...state, player: { hp: 80, maxHp: 80 } }, 'combat').sceneKey, scene.sceneKey);
  assert.equal(buildSharedScene(state, 'death').phase, 'death');
});

test('shared client is a no-op until the Worker endpoint is configured', async () => {
  const client = new SharedDanmakuClient({ baseUrl: '' });
  assert.equal(client.enabled, false);
  assert.deepEqual(await client.list({ sceneKey: 'x', phase: 'combat' }), []);
  assert.equal((await client.submit({ sceneKey: 'x', text: 'test' })).accepted, false);
});

test('shared client fetches every active message on every scene entry without a limit', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `item-${index}`, text: `弹幕${index}` }));
  global.fetch = async url => {
    requests.push(String(url));
    return { ok: true, json: async () => ({ items }) };
  };
  try {
    const client = new SharedDanmakuClient({ baseUrl: 'https://shared.example' });
    assert.equal((await client.list({ sceneKey: 'scene', phase: 'combat' })).length, 12);
    assert.equal((await client.list({ sceneKey: 'scene', phase: 'combat' })).length, 12);
    assert.equal(requests.length, 2);
    assert.equal(requests.every(url => !new URL(url).searchParams.has('limit')), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('accepted player text is echoed after three seconds in the same scene', async () => {
  const scheduled = [];
  const adapter = new DanmakuBridgeAdapter({
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
    sharedClient: {
      enabled: true,
      list: async () => [],
      submit: async ({ text }) => ({ accepted: true, item: { id: 'message-1', text } })
    }
  });
  await adapter.ingestObservation(observation(1), { runId: 'run' });
  adapter.director.queue = [];
  const result = await adapter.submitShared('这场要稳住');
  assert.equal(result.accepted, true);
  assert.equal(adapter.director.queue.length, 0);
  assert.equal(scheduled[0].delay, 3000);
  scheduled[0].callback();
  assert.equal(adapter.director.queue[0].text, '这场要稳住');
  assert.equal(adapter.director.queue[0].source, 'shared');
});

test('delayed player echo is cancelled after the scene changes', async () => {
  const scheduled = [];
  const adapter = new DanmakuBridgeAdapter({
    schedule: callback => scheduled.push(callback),
    sharedClient: {
      enabled: true,
      list: async () => [],
      submit: async ({ text }) => ({ accepted: true, item: { id: 'message-2', text } })
    }
  });
  await adapter.ingestObservation(observation(1), { runId: 'run' });
  await adapter.submitShared('旧场景留言');
  const next = observation(2, {
    id: 'FUZZY_WURM_CRAWLER',
    name: '毛绒伏地虫',
    intent: 'attack',
    alive: true
  });
  next.state.run.floor = 2;
  await adapter.ingestObservation(next, { runId: 'run' });
  adapter.director.queue = [];
  scheduled[0]();
  assert.equal(adapter.director.queue.length, 0);
});
