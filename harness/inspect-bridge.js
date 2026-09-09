const WebSocket = require('ws');
const { validateState } = require('./protocol');

const sourceUrl = process.env.GAMEBUDDY_SOURCE_URL || 'ws://127.0.0.1:27182';
const once = process.argv.includes('--once');
const durationArg = process.argv.find(value => value.startsWith('--duration='));
const durationMs = durationArg ? Number(durationArg.slice('--duration='.length)) : 0;
let socket;
let retryTimer;
let stopTimer;
let finished = false;
let stateCount = 0;
let eventCount = 0;

function line(message) {
  process.stdout.write(`[GameBuddy Inspect] ${message}\n`);
}

function finish(code = 0) {
  if (finished) return;
  finished = true;
  clearTimeout(retryTimer);
  clearTimeout(stopTimer);
  socket?.close();
  line(`summary states=${stateCount} events=${eventCount}`);
  process.exit(code);
}

function inspectState(state) {
  const result = validateState(state);
  if (!result.ok) {
    line(`INVALID state: ${result.reason}`);
    return;
  }
  stateCount += 1;
  const combat = state.combat;
  const combatSummary = combat === null
    ? 'room=non-combat'
    : `turn=${combat.turn} hand=${combat.hand.length} draw=${combat.drawPile.length} discard=${combat.discardPile.length} enemies=${combat.enemies.length}`;
  line(`STATE #${stateCount} source=${state.source} run=act${state.run.act}/floor${state.run.floor}/${state.run.room} character=${state.run.character}`);
  line(`  player hp=${state.player.hp}/${state.player.maxHp} block=${state.player.block} energy=${state.player.energy}/${state.player.maxEnergy} gold=${state.player.gold}`);
  line(`  ${combatSummary}`);
  for (const enemy of combat?.enemies || []) {
    line(`  enemy ${enemy.name} hp=${enemy.hp}/${enemy.maxHp} block=${enemy.block} intent=${enemy.intent} alive=${enemy.alive}`);
  }
  if (once) finish(0);
}

function connect() {
  if (finished) return;
  line(`connecting ${sourceUrl}`);
  socket = new WebSocket(sourceUrl);
  socket.once('open', () => {
    line('connected');
    socket.send(JSON.stringify({ type: 'request_snapshot' }));
  });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'state') inspectState(message.data);
      else if (message.type === 'event') {
        eventCount += 1;
        line(`EVENT #${eventCount} ${message.name}${message.data ? ` ${JSON.stringify(message.data)}` : ''}`);
      } else {
        line(`message type=${message.type || 'unknown'}`);
      }
    } catch (error) {
      line(`INVALID message: ${error.message}`);
    }
  });
  socket.once('close', () => {
    if (!finished) {
      line('disconnected; retrying in 1s');
      retryTimer = setTimeout(connect, 1000);
    }
  });
  socket.once('error', error => line(`connection error: ${error.message}`));
}

process.once('SIGINT', () => finish(0));
process.once('SIGTERM', () => finish(0));
if (durationMs > 0) stopTimer = setTimeout(() => finish(0), durationMs);
connect();
