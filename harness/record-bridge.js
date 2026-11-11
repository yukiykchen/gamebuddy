const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { validateMessage, validateState, stateSignature } = require('./protocol');

const sourceUrl = process.env.GAMEBUDDY_SOURCE_URL || 'ws://127.0.0.1:27182';
const outputPath = process.env.GAMEBUDDY_RECORD_OUTPUT || path.join(__dirname, 'fixtures', 'recorded-run.json');
const eventOutputPath = process.env.GAMEBUDDY_RECORD_EVENTS_OUTPUT || outputPath.replace(/\.json$/i, '.events.json');
const factOutputPath = process.env.GAMEBUDDY_RECORD_FACTS_OUTPUT || outputPath.replace(/\.json$/i, '.facts.json');
const maxMs = Number(process.env.GAMEBUDDY_RECORD_MS || 0);
const snapshots = [];
const events = [];
const facts = [];
const factIds = new Set();
let socket;
let finished = false;
let retryTimer;
let stopTimer;
let lastSignature = '';

function writeOutput() {
  if (snapshots.length === 0 && facts.length === 0) {
    console.error('No valid state snapshots or facts were recorded.');
    return false;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshots, null, 2)}\n`);
  fs.writeFileSync(eventOutputPath, `${JSON.stringify(events, null, 2)}\n`);
  fs.writeFileSync(factOutputPath, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`Recorded ${snapshots.length} snapshots to ${outputPath}`);
  console.log(`Recorded ${events.length} events to ${eventOutputPath}`);
  console.log(`Recorded ${facts.length} facts to ${factOutputPath}`);
  return true;
}

function finish(code = 0) {
  if (finished) return;
  finished = true;
  clearTimeout(retryTimer);
  clearTimeout(stopTimer);
  socket?.close();
  process.exit(writeOutput() ? code : 1);
}

function connect() {
  if (finished) return;
  socket = new WebSocket(sourceUrl);
  socket.once('open', () => {
    console.log(`Recording GameBuddy state from ${sourceUrl}`);
    socket.send(JSON.stringify({ type: 'request_snapshot' }));
  });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      const messageResult = validateMessage(message);
      if (!messageResult.ok) {
        console.error(`Skipped invalid bridge message: ${messageResult.reason}`);
        return;
      }
      if (message.type === 'fact') {
        if (factIds.has(message.data.eventId)) return;
        factIds.add(message.data.eventId);
        facts.push(message.data);
        console.log(`fact ${facts.length}: ${message.data.eventType} ${message.data.eventId}`);
        return;
      }
      if (message.type === 'event') {
        events.push(message);
        console.log(`event ${events.length}: ${message.name}`);
        return;
      }
      const result = validateState(message.data);
      if (!result.ok) {
        console.error(`Skipped invalid state: ${result.reason}`);
        return;
      }
      const signature = stateSignature(message.data);
      if (signature === lastSignature) return;
      lastSignature = signature;
      snapshots.push(message.data);
      console.log(`snapshot ${snapshots.length}: ${message.data.schema} @ ${message.data.timestamp}`);
    } catch (error) {
      console.error(`Skipped malformed bridge message: ${error.message}`);
    }
  });
  socket.once('close', () => {
    if (!finished) retryTimer = setTimeout(connect, 500);
  });
  socket.once('error', () => socket.close());
}

process.once('SIGINT', () => finish(0));
process.once('SIGTERM', () => finish(0));
if (maxMs > 0) stopTimer = setTimeout(() => finish(0), maxMs);
connect();
