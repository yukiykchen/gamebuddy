#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');
const { loadProjectEnv } = require('../agent/llm/load-env');

loadProjectEnv();

const root = path.join(__dirname, '..');
const home = path.join(root, '.codex-cli');
const bin = path.join(root, 'node_modules', '.bin', 'codex');
const child = spawn(bin, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CODEX_HOME: home,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.GAMEBUDDY_LLM_API_KEY || ''
  }
});

child.on('error', error => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', code => process.exit(code || 0));
