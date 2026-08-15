const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const port = 27182;
const bridge = spawn(process.execPath, [path.join(__dirname, 'replay-bridge.js')], {
  cwd: root,
  env: { ...process.env, GAMEBUDDY_BRIDGE_PORT: String(port) },
  stdio: 'inherit'
});

const log = message => process.stderr.write(`[GameBuddy Demo] ${message}\n`);

let app;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  bridge.kill();
  if (app && !app.killed) app.kill();
  process.exitCode = code;
}

bridge.once('error', error => {
  console.error(`Could not start Replay Bridge: ${error.message}`);
  stop(1);
});

bridge.once('spawn', () => {
  let electronBinary;
  try {
    electronBinary = require('electron');
  } catch (error) {
    log(`Electron is not installed correctly: ${error.message}`);
    return stop(1);
  }
  log(`Starting Electron with bridge ${port}`);
  app = spawn(electronBinary, ['.'], {
    cwd: root,
    env: { ...process.env, GAMEBUDDY_BRIDGE_URL: `ws://127.0.0.1:${port}`, GAMEBUDDY_BRIDGE_MODE: 'replay' },
    stdio: 'inherit'
  });
  app.once('error', error => {
    console.error(`Could not start Electron: ${error.message}`);
    stop(1);
  });
  app.once('exit', code => stop(code || 0));
});

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
