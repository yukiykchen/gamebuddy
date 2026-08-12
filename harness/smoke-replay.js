const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');
const { validateState } = require('./protocol');

const port = 27183;
const args = process.argv.slice(2);
const fixtureIndex = args.indexOf('--fixture');
const eventsIndex = args.indexOf('--events');
const fixturePath = fixtureIndex >= 0 ? args[fixtureIndex + 1] : null;
const expectedEvents = eventsIndex >= 0 ? (args[eventsIndex + 1] || '').split(',').filter(Boolean) : [];
const bridgeArgs = [path.join(__dirname, 'replay-bridge.js')];
if (fixturePath) bridgeArgs.push(fixturePath);
const bridge = spawn(process.execPath, bridgeArgs, {
  env: { ...process.env, RUNMATE_BRIDGE_PORT: String(port), RUNMATE_REPLAY_INTERVAL: '100' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
const receivedEvents = new Set();
let stateReceived = false;
let finished = false;
let activeSocket;
bridge.stdout.on('data', chunk => { output += chunk.toString(); });
bridge.stderr.on('data', chunk => { output += chunk.toString(); });

function finish(code, message) {
  if (finished) return;
  finished = true;
  activeSocket?.removeAllListeners();
  activeSocket?.close();
  bridge.kill('SIGTERM');
  if (code === 0) console.log(message);
  else {
    console.error(message);
    if (output) console.error(output);
  }
  process.exit(code);
}

const deadline = Date.now() + 5000;
function connect() {
  if (finished) return;
  if (Date.now() > deadline) return finish(1, 'Replay smoke test timed out while starting bridge');
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  activeSocket = socket;
  socket.once('open', () => socket.send(JSON.stringify({ type: 'request_snapshot' })));
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'event') {
        receivedEvents.add(message.name);
        if (stateReceived && expectedEvents.every(name => receivedEvents.has(name))) {
          socket.close();
          return finish(0, `Replay smoke test passed: events=${[...receivedEvents].join(',')}`);
        }
        return;
      }
      if (message.type !== 'state') return finish(1, 'Replay smoke test received an unknown first message');
      const result = validateState(message.data);
      if (!result.ok) return finish(1, `Replay smoke test received invalid state: ${result.reason}`);
      stateReceived = true;
      if (expectedEvents.length === 0) {
        socket.close();
        return finish(0, `Replay smoke test passed: ${message.data.schema}, turn=${message.data.combat?.turn ?? 'none'}`);
      }
      if (expectedEvents.every(name => receivedEvents.has(name))) {
        socket.close();
        return finish(0, `Replay smoke test passed: events=${[...receivedEvents].join(',')}`);
      }
    } catch (error) {
      finish(1, `Replay smoke test parse failed: ${error.message}`);
    }
  });
  socket.once('error', () => {
    socket.close();
    if (!finished) setTimeout(connect, 100);
  });
}

setTimeout(connect, 100);
setTimeout(() => {
  if (!finished && expectedEvents.length > 0) {
    finish(1, `Replay smoke test did not receive events: ${expectedEvents.filter(name => !receivedEvents.has(name)).join(',')}`);
  }
}, 5000);
