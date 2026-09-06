const path = require('node:path');
const fs = require('node:fs');

const CODEX_DIR = path.join(__dirname, 'data', 'codex');
const STRIP_TAGS = /\[[^\]]*\]/g;

function loadCodexFile(name) {
  return JSON.parse(fs.readFileSync(path.join(CODEX_DIR, `${name}.json`), 'utf8'));
}

function normalizeName(value) {
  return String(value ?? '')
    .replace(/\s* Lv\.?\s*\d+\s*$/i, '')
    .replace(/^[+-]?\d+\s*/, '')
    .trim();
}

function stripMarkup(value) {
  return String(value ?? '')
    .replace(STRIP_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function indexBy(rows, key) {
  const index = new Map();
  for (const row of rows) index.set(String(row[key] ?? '').toUpperCase(), row);
  return index;
}

const codex = {
  cards: loadCodexFile('cards'),
  monsters: loadCodexFile('monsters'),
  encounters: loadCodexFile('encounters'),
  events: loadCodexFile('events'),
  relics: loadCodexFile('relics'),
  potions: loadCodexFile('potions'),
  powers: loadCodexFile('powers'),
  intents: loadCodexFile('intents')
};

const indexes = {
  card: indexBy(codex.cards, 'id'),
  monster: indexBy(codex.monsters, 'id'),
  encounter: indexBy(codex.encounters, 'id'),
  event: indexBy(codex.events, 'id'),
  relic: indexBy(codex.relics, 'id'),
  potion: indexBy(codex.potions, 'id'),
  power: indexBy(codex.powers, 'id'),
  cardByName: new Map(),
  monsterByName: new Map(),
  relicByName: new Map(),
  potionByName: new Map()
};

for (const card of codex.cards) indexes.cardByName.set(normalizeName(card.name), card);
for (const monster of codex.monsters) indexes.monsterByName.set(normalizeName(monster.name), monster);
for (const relic of codex.relics) indexes.relicByName.set(normalizeName(relic.name), relic);
for (const potion of codex.potions) indexes.potionByName.set(normalizeName(potion.name), potion);

function lookupCard(input) {
  return indexes.card.get(String(input ?? '').toUpperCase())
    || indexes.cardByName.get(normalizeName(input))
    || codex.cards.find(card => card.name === normalizeName(input)) || null;
}

function lookupMonster(input) {
  return indexes.monster.get(String(input ?? '').toUpperCase())
    || indexes.monsterByName.get(normalizeName(input))
    || codex.monsters.find(monster => monster.name === normalizeName(input)) || null;
}

function lookupEncounter(input) {
  return indexes.encounter.get(String(input ?? '').toUpperCase()) || null;
}

function lookupEvent(input) {
  return indexes.event.get(String(input ?? '').toUpperCase()) || null;
}

function lookupRelic(input) {
  return indexes.relic.get(String(input ?? '').toUpperCase())
    || indexes.relicByName.get(normalizeName(input)) || null;
}

function lookupPotion(input) {
  return indexes.potion.get(String(input ?? '').toUpperCase())
    || indexes.potionByName.get(normalizeName(input)) || null;
}

function monsterMoves(monster) {
  const moves = Array.isArray(monster?.moves) ? monster.moves : [];
  return moves.map(move => {
    const damage = move.damage || move.damage_values || null;
    const normalDamage = Number.isFinite(damage?.normal) ? damage.normal : null;
    const ascensionDamage = Number.isFinite(damage?.ascension) ? damage.ascension : null;
    return {
      id: move.id,
      name: move.name,
      intent: move.intent || 'Unknown',
      damage: normalDamage,
      ascensionDamage,
      hitCount: Number.isFinite(damage?.hit_count) ? damage.hit_count : Number.isFinite(move.hit_count) ? move.hit_count : null,
      block: Number.isFinite(move.block) ? move.block : null,
      description: stripMarkup(move.description)
    };
  });
}

module.exports = {
  codex,
  indexes,
  stripMarkup,
  normalizeName,
  lookupCard,
  lookupMonster,
  lookupEncounter,
  lookupEvent,
  lookupRelic,
  lookupPotion,
  monsterMoves
};
