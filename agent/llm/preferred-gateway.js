const fs = require('node:fs');
const path = require('node:path');
const { normalizeApiRoot, redactSecrets } = require('./openai');

const DEFAULT_GATEWAY_URL = 'https://copilot.tencent.com/v2';
const DEFAULT_COMPANY_MODEL = 'deepseek-v4.1-flash';
const KEYS_PAGE_URL = 'https://tencent.sso.codebuddy.cn/profile/keys';
const COMPANY_GATEWAY_NAME = '公司个人 token 网关';
const LLM_METHODS = [
  'completeRecapTurn',
  'completeBuildGuidance',
  'completeRoute',
  'completeRest',
  'completeEvent',
  'completeShop',
  'completeCardReward',
  'completeDanmaku'
];

function normalizeGateway(value) {
  let trimmed = String(value || '').trim();
  if (!trimmed) trimmed = DEFAULT_GATEWAY_URL;
  trimmed = trimmed.replace(/\/+$/, '').replace(/\/(?:chat\/completions|responses)$/i, '');
  return normalizeApiRoot(trimmed);
}

function isCompanyGateway(baseURL) {
  try {
    return new URL(normalizeGateway(baseURL)).host === 'copilot.tencent.com';
  } catch {
    return false;
  }
}

function readGatewayPreference(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const apiKey = String(parsed?.apiKey || '').trim();
    if (!apiKey) return null;
    return { apiKey, baseURL: normalizeGateway(parsed?.baseURL) };
  } catch {
    return null;
  }
}

function writeGatewayPreference(file, input) {
  const apiKey = String(input?.apiKey || '').trim();
  if (!apiKey) return { ok: false, message: '请填写 API Key' };
  const preference = { apiKey, baseURL: normalizeGateway(input?.baseURL) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(preference, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows 上权限位可能无效。 */ }
  return { ok: true, preference };
}

function buildPreferredConfig(baseConfig, preference) {
  const baseURL = normalizeGateway(preference?.baseURL);
  const company = isCompanyGateway(baseURL);
  return {
    ...baseConfig,
    enabled: true,
    apiKey: String(preference?.apiKey || '').trim(),
    baseURL,
    model: company ? DEFAULT_COMPANY_MODEL : baseConfig?.model,
    stream: company ? true : baseConfig?.stream,
    wireApi: company ? 'chat' : (baseConfig?.wireApi || 'responses'),
    authScheme: company ? 'x-api-key' : 'bearer',
    source: 'preferred-gateway'
  };
}

function callerAborted(args) {
  return args.some(arg => arg && typeof arg === 'object' && arg.signal?.aborted);
}

function createFallbackLlm(preferred, original, { onFallback, redactKey = '' } = {}) {
  if (!preferred?.enabled) return original || null;
  const client = { enabled: true, preferred: true, model: preferred.model, cacheKey: require('node:crypto').createHash('sha256').update(`${preferred.cacheKey || ''}:${original?.cacheKey || ''}`).digest('hex') };
  for (const name of LLM_METHODS) {
    if (typeof preferred[name] !== 'function') continue;
    client[name] = async (...args) => {
      let failure = '';
      try {
        const result = await preferred[name](...args);
        if (result != null) return result;
        if (callerAborted(args)) return null;
        failure = 'empty result';
      } catch (error) {
        if (callerAborted(args)) throw error;
        failure = error?.message || 'request failed';
      }
      if (!original?.enabled || typeof original[name] !== 'function') {
        if (failure === 'empty result') return null;
        throw new Error(failure);
      }
      onFallback?.(redactSecrets(failure, redactKey));
      return original[name](...args);
    };
  }
  return client;
}

function preferenceFile(userDataDir) {
  return path.join(userDataDir, 'llm-gateway.json');
}

module.exports = {
  DEFAULT_GATEWAY_URL,
  DEFAULT_COMPANY_MODEL,
  KEYS_PAGE_URL,
  COMPANY_GATEWAY_NAME,
  normalizeGateway,
  isCompanyGateway,
  readGatewayPreference,
  writeGatewayPreference,
  buildPreferredConfig,
  createFallbackLlm,
  preferenceFile
};
