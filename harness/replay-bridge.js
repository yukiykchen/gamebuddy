const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { validateState } = require('./protocol');

const port = Number(process.env.GAMEBUDDY_BRIDGE_PORT || 27182);
const intervalMs = Number(process.env.GAMEBUDDY_REPLAY_INTERVAL || 1400);
const fixturePath = process.argv[2] || path.join(__dirname, 'fixtures', 'combat-run.json');
const snapshots = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
for (const [index, snapshot] of snapshots.entries()) {
  const result = validateState(snapshot);
  if (!result.ok) throw new Error(`Invalid snapshot ${index}: ${result.reason}`);
}
const server = new WebSocketServer({ port, host: '127.0.0.1' });
let cursor = 0;
let timer;
const previousSnapshots = new WeakMap();

function sendSnapshot(socket, snapshot) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'state', data: snapshot }));
}

function sendEvent(socket, name, data = {}) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: 'event',
      name,
      timestamp: Date.now(),
      data
    }));
  }
}

function emitTransitions(socket, snapshot) {
  const previousSnapshot = previousSnapshots.get(socket);
  const previousCombat = previousSnapshot?.combat !== null && previousSnapshot?.combat !== undefined;
  const currentCombat = snapshot.combat !== null && snapshot.combat !== undefined;
  if (currentCombat && !previousCombat) sendEvent(socket, 'combat.started');
  if (!currentCombat && previousCombat) sendEvent(socket, 'combat.ended');
  if (currentCombat && snapshot.combat.turn !== previousSnapshot?.combat?.turn) {
    sendEvent(socket, 'turn.started', { turn: snapshot.combat.turn });
  }
  if (snapshot.run?.room === 'map' && previousSnapshot?.run?.room !== 'map') sendEvent(socket, 'map.opened');
  previousSnapshots.set(socket, snapshot);
}

function sendSnapshotAndTransitions(socket, snapshot) {
  sendSnapshot(socket, snapshot);
  emitTransitions(socket, snapshot);
}

function nextSnapshot() {
  const snapshot = snapshots[cursor % snapshots.length];
  cursor += 1;
  for (const client of server.clients) sendSnapshotAndTransitions(client, snapshot);
}

server.on('listening', () => {
  console.log(`GameBuddy Replay Bridge listening on ws://127.0.0.1:${port}`);
  console.log(`Fixture: ${fixturePath}`);
  timer = setInterval(nextSnapshot, intervalMs);
});

server.on('connection', socket => {
  sendSnapshotAndTransitions(socket, snapshots[0]);
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'request_snapshot') sendSnapshot(socket, snapshots[Math.max(0, cursor - 1)] || snapshots[0]);
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid bridge command' }));
    }
  });
});

function shutdown() {
  clearInterval(timer);
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
