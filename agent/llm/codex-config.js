const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function parseTomlValue(raw) {
  const value = String(raw || '').trim();
  if (!value || value.startsWith('[')) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function parseSimpleToml(text) {
  const tables = { '': {} };
  let current = '';
  for (const original of String(text || '').split(/\r?\n/)) {
    const line = original.replace(/#.*$/, '').trim();
    if (!line) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      current = table[1].trim();
      if (!tables[current]) tables[current] = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const parsed = parseTomlValue(line.slice(eq + 1));
    if (key && parsed !== undefined) tables[current][key] = parsed;
  }
  return tables;
}

function readText(file, readFileSync) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function normalizeApiRoot(baseURL) {
  const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function providerTable(tables, name) {
  if (!name) return null;
  return tables[`model_providers.${name}`] || tables[`model_providers.${String(name).toLowerCase()}`] || null;
}

function pickProviderName(root, tables, env = {}) {
  const requested = String(env.GAMEBUDDY_LLM_PROVIDER || '').trim();
  if (requested && providerTable(tables, requested)) return requested;
  if (providerTable(tables, 'OpenAI')) return 'OpenAI';
  const active = String(root.model_provider || '').trim();
  if (active && providerTable(tables, active)) return active;
  return requested || active || '';
}

function loadCodexLlmConfig({
  env = process.env,
  homedir = os.homedir(),
  readFileSync = fs.readFileSync
} = {}) {
  const codexHome = String(env.GAMEBUDDY_CODEX_HOME || path.join(homedir, '.codex')).trim();
  const tables = parseSimpleToml(readText(path.join(codexHome, 'config.toml'), readFileSync));
  const root = tables[''] || {};
  let auth = {};
  try {
    auth = JSON.parse(readText(path.join(codexHome, 'auth.json'), readFileSync) || '{}');
  } catch {
    auth = {};
  }
  const providerName = pickProviderName(root, tables, env);
  const provider = providerTable(tables, providerName) || {};
  const token = String(provider.experimental_bearer_token || '').trim();
  const apiKey = String(auth.OPENAI_API_KEY || auth.api_key || '').trim();
  const usableToken = token && token !== 'PROXY_MANAGED' ? token : apiKey;
  const wireApi = String(provider.wire_api || env.GAMEBUDDY_LLM_WIRE_API || 'chat').trim().toLowerCase();
  return {
    source: usableToken ? 'codex' : '',
    providerName,
    apiKey: usableToken,
    baseURL: normalizeApiRoot(provider.base_url || ''),
    model: String(root.model || '').trim(),
    wireApi: wireApi === 'responses' || wireApi === 'response' ? 'responses' : 'chat',
    reasoningEffort: String(root.model_reasoning_effort || '').trim(),
    store: root.disable_response_storage === true ? false : undefined,
    requiresAuth: provider.requires_openai_auth !== false
  };
}

module.exports = {
  parseSimpleToml,
  normalizeApiRoot,
  loadCodexLlmConfig
};
