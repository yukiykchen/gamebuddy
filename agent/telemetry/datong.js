const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const DATONG_APP_KEY = '0WIN0779K4XY57ZI';
const UPLOAD_URL = 'https://otheve.beacon.qq.com/analytics/v2_upload';

function deviceIdPath(userDataDir) {
  return path.join(userDataDir || process.cwd(), 'datong-device-id');
}

function hasDeviceId(userDataDir) {
  try {
    return Boolean(fs.readFileSync(deviceIdPath(userDataDir), 'utf8').trim());
  } catch {
    return false;
  }
}

function readDeviceId(file) {
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // 首次启动再生成设备标识。
  }
  const created = randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${created}\n`, { mode: 0o600 });
  return created;
}

function buildUploadBody({ appKey = DATONG_APP_KEY, deviceId, eventCode, mapValue = {}, now = Date.now(), appVersion = '0.1.1' } = {}) {
  const values = {};
  for (const [key, value] of Object.entries(mapValue)) values[key] = String(value ?? '');
  return {
    appVersion,
    sdkId: 'js',
    sdkVersion: '4.7.6-api',
    platformId: 3,
    mainAppKey: appKey,
    common: { A2: String(deviceId || '') },
    events: [{
      eventCode: String(eventCode || ''),
      eventTime: String(now),
      mapValue: values
    }]
  };
}

async function reportDatongEvent({
  eventCode,
  mapValue,
  userDataDir,
  fetchImpl = globalThis.fetch,
  appKey = DATONG_APP_KEY,
  now
} = {}) {
  if (!appKey || typeof fetchImpl !== 'function') return { ok: false };
  const deviceId = readDeviceId(deviceIdPath(userDataDir));
  const body = buildUploadBody({ appKey, deviceId, eventCode, mapValue, now });
  const response = await fetchImpl(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(body)
  });
  return { ok: Boolean(response?.ok), body };
}

function reportAppStart(options = {}) {
  return reportDatongEvent({ ...options, eventCode: 'app_start', mapValue: { surface: 'desktop' } })
    .catch(() => ({ ok: false }));
}

function reportTracked(eventCode, mapValue, options = {}) {
  return reportDatongEvent({ ...options, eventCode, mapValue }).catch(() => ({ ok: false }));
}

function reportFirstOpen(options = {}) {
  return reportTracked('first_open', { surface: 'desktop', dt_pgid: 'desktop' }, options);
}

function reportAppOut({ stayDuration, ...options } = {}) {
  return reportTracked('dt_appout', { dt_pgid: 'desktop', stay_duration: stayDuration }, options);
}

function reportPageIn({ pageId, ...options } = {}) {
  return reportTracked('dt_pgin', { dt_pgid: pageId }, options);
}

function reportPageOut({ pageId, stayDuration, ...options } = {}) {
  return reportTracked('dt_pgout', { dt_pgid: pageId, stay_duration: stayDuration }, options);
}

function reportBridgeConnectResult({ result, ...options } = {}) {
  return reportTracked('bridge_connect_result', { result }, options);
}

function reportSuggestionImpression({ elementId, featureName, source, ...options } = {}) {
  return reportTracked('dt_imp', {
    dt_pgid: 'pet',
    dt_eid: elementId,
    feature_name: featureName,
    source: source || ''
  }, options);
}

function reportLlmReview({ featureName, result, ...options } = {}) {
  return reportTracked('llm_review_result', { feature_name: featureName, result }, options);
}

module.exports = {
  DATONG_APP_KEY,
  UPLOAD_URL,
  deviceIdPath,
  hasDeviceId,
  readDeviceId,
  buildUploadBody,
  reportDatongEvent,
  reportAppStart,
  reportFirstOpen,
  reportAppOut,
  reportPageIn,
  reportPageOut,
  reportBridgeConnectResult,
  reportSuggestionImpression,
  reportLlmReview
};
