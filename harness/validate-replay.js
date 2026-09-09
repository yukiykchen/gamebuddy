const fs = require('node:fs');
const path = require('node:path');
const { validateState } = require('./protocol');

const fixturePath = process.argv[2] || path.join(__dirname, 'fixtures', 'combat-run.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!Array.isArray(fixture) || fixture.length === 0) throw new Error('Replay fixture must be a non-empty array');
fixture.forEach((state, index) => {
  const result = validateState(state);
  if (!result.ok) throw new Error(`Snapshot ${index} is invalid: ${result.reason}`);
  for (const [label, cards] of [['hand', state.combat?.hand], ['drawPile', state.combat?.drawPile], ['discardPile', state.combat?.discardPile], ['exhaustPile', state.combat?.exhaustPile]]) {
    for (const card of cards || []) {
      for (const field of ['id', 'name', 'type', 'upgraded']) {
        if (!(field in card)) throw new Error(`Snapshot ${index} ${label} card missing ${field}`);
      }
      if (card.cost !== null && card.cost !== undefined && !Number.isFinite(card.cost)) throw new Error(`Snapshot ${index} ${label} card cost is invalid`);
    }
  }
  for (const enemy of state.combat?.enemies || []) {
    for (const field of ['name', 'hp', 'maxHp', 'block', 'intent', 'alive']) {
      if (!(field in enemy)) throw new Error(`Snapshot ${index} enemy missing ${field}`);
    }
  }
});

console.log(`Replay valid: ${fixturePath}`);
console.log(`Snapshots: ${fixture.length}`);
