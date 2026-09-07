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
  return env;
}

module.exports = { loadProjectEnv };
