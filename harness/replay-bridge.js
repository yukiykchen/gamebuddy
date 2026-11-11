const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { validateState } = require('./protocol');
const { validateFactEvent } = require('./fact-protocol');
const { isRestSnapshot, inferRestClosed } = require('./rest-lifecycle');

const port = Number(process.env.GAMEBUDDY_BRIDGE_PORT || 27182);
const intervalMs = Number(process.env.GAMEBUDDY_REPLAY_INTERVAL || 1400);
const fixturePath = process.argv[2] || path.join(__dirname, 'fixtures', 'combat-run.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!Array.isArray(fixture) || fixture.length === 0) throw new Error('Replay fixture must be a non-empty array.');
const factMode = fixture[0]?.schema === 'gamebuddy.fact-event.v1';
const snapshots = factMode ? [] : fixture;
const facts = factMode ? fixture : [];
for (const [index, item] of fixture.entries()) {
  const result = factMode ? validateFactEvent(item) : validateState(item);
  if (!result.ok) throw new Error(`Invalid ${factMode ? 'fact' : 'snapshot'} ${index}: ${result.reason}`);
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
  const restNow = isRestSnapshot(snapshot);
  const restBefore = isRestSnapshot(previousSnapshot);
  if (restNow && !restBefore) sendEvent(socket, 'rest.opened');
  const closed = inferRestClosed(previousSnapshot, snapshot);
  if (closed) sendEvent(socket, 'rest.closed', closed);
  const previousShop = previousSnapshot?.shop || null;
  const currentShop = snapshot.shop || null;
  if (currentShop && !previousShop) sendEvent(socket, 'shop.opened', currentShop);
  else if (currentShop && previousShop && JSON.stringify(currentShop) !== JSON.stringify(previousShop)) sendEvent(socket, 'shop.updated', currentShop);
  else if (!currentShop && previousShop) sendEvent(socket, 'shop.closed');
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

function sendFact(socket, fact) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'fact', data: fact, replay: true }));
}

function nextFact() {
  const fact = facts[cursor % facts.length];
  cursor += 1;
  for (const client of server.clients) sendFact(client, fact);
}

server.on('listening', () => {
  console.log(`GameBuddy Replay Bridge listening on ws://127.0.0.1:${port}`);
  console.log(`Fixture: ${fixturePath}`);
  timer = setInterval(factMode ? nextFact : nextSnapshot, intervalMs);
});

server.on('connection', socket => {
  if (factMode) sendFact(socket, facts[0]);
  else sendSnapshotAndTransitions(socket, snapshots[0]);
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (!factMode && message.type === 'request_snapshot') {
        sendSnapshot(socket, snapshots[Math.max(0, cursor - 1)] || snapshots[0]);
      }
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
