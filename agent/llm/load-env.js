const fs = require('node:fs');
const path = require('node:path');

let loaded = false;

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function applyEnvFile(file, env) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const original of text.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1));
    if (!key || env[key]) continue;
    env[key] = value;
  }
}

function loadProjectEnv(env = process.env, root = path.join(__dirname, '..', '..')) {
  if (env !== process.env) return env;
  if (loaded) return env;
  loaded = true;
  applyEnvFile(path.join(root, '.env'), env);
  // 公司内部网关沿用根目录本地 .secrets；不复制 token 到仓库文件。
  applyEnvFile(path.join(root, '.secrets'), env);
  if (!env.GAMEBUDDY_LLM_API_KEY && env.TENCENT_TOKEN) env.GAMEBUDDY_LLM_API_KEY = env.TENCENT_TOKEN;
  if (!env.GAMEBUDDY_LLM_BASE_URL && env.TENCENT_COPILOT_BASE_URL) env.GAMEBUDDY_LLM_BASE_URL = env.TENCENT_COPILOT_BASE_URL;
  if (!env.GAMEBUDDY_LLM_MODEL && env.TENCENT_COPILOT_MODEL) env.GAMEBUDDY_LLM_MODEL = env.TENCENT_COPILOT_MODEL;
  if (!env.GAMEBUDDY_LLM_PROVIDER && env.TENCENT_TOKEN) env.GAMEBUDDY_LLM_PROVIDER = 'Tencent Copilot';
  return env;
}

module.exports = { loadProjectEnv };
