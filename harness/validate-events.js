const fs = require('node:fs');
const path = require('node:path');
const { validateMessage } = require('./protocol');

const fixturePath = process.argv[2] || path.join(__dirname, 'fixtures', 'recorded-smoke.events.json');
const events = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!Array.isArray(events)) throw new Error('Event fixture must be an array');
events.forEach((event, index) => {
  const result = validateMessage(event);
  if (!result.ok) throw new Error(`Event ${index} is invalid: ${result.reason}`);
});
console.log(`Events valid: ${fixturePath}`);
console.log(`Events: ${events.length}`);
