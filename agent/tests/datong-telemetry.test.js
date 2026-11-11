const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildUploadBody,
  hasDeviceId,
  reportAppStart,
  reportFirstOpen,
  reportLlmReview,
  reportSuggestionImpression,
  UPLOAD_URL
} = require('../telemetry/datong');

test('app start payload uses string fields and does not include the api key', () => {
  const body = buildUploadBody({
    appKey: '0WIN0779K4XY57ZI',
    deviceId: 'device-1',
    eventCode: 'app_start',
    mapValue: { surface: 'desktop', count: 1 },
    now: 123
  });
  assert.equal(body.mainAppKey, '0WIN0779K4XY57ZI');
  assert.equal(body.common.A2, 'device-1');
  assert.equal(body.events[0].eventCode, 'app_start');
  assert.equal(body.events[0].eventTime, '123');
  assert.equal(body.events[0].mapValue.count, '1');
  assert.equal(JSON.stringify(body).includes('GAMEBUDDY_LLM_API_KEY'), false);
});

test('reportAppStart posts once and reuses the device id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-datong-'));
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true };
  };
  const first = await reportAppStart({ userDataDir: dir, fetchImpl });
  const second = await reportAppStart({ userDataDir: dir, fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(requests[0].url, UPLOAD_URL);
  assert.equal(requests[0].body.events[0].eventCode, 'app_start');
  assert.equal(requests[0].body.common.A2, requests[1].body.common.A2);
  assert.equal(hasDeviceId(dir), true);
});

test('suggestion and review events keep private params as strings', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true };
  };
  const impression = await reportSuggestionImpression({
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-datong-')),
    fetchImpl,
    elementId: 'suggestion_card',
    featureName: 'map_route',
    source: 'rules'
  });
  const review = await reportLlmReview({
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-datong-')),
    fetchImpl,
    featureName: 'map_route',
    result: 'fallback'
  });
  const first = await reportFirstOpen({
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-datong-')),
    fetchImpl
  });
  assert.equal(impression.ok, true);
  assert.equal(review.ok, true);
  assert.equal(first.ok, true);
  assert.equal(requests[0].events[0].eventCode, 'dt_imp');
  assert.equal(requests[0].events[0].mapValue.dt_eid, 'suggestion_card');
  assert.equal(requests[0].events[0].mapValue.feature_name, 'map_route');
  assert.equal(requests[1].events[0].eventCode, 'llm_review_result');
  assert.equal(requests[1].events[0].mapValue.result, 'fallback');
  assert.equal(requests[2].events[0].eventCode, 'first_open');
  assert.equal(requests[2].events[0].mapValue.dt_pgid, 'desktop');
});
