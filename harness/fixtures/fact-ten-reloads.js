const quality = { observationMethod: 'direct_hook', unknownFields: [], unknownReasons: {} };
const facts = [];
let sequence = 1;

function add(eventType, payload, generation = null, actionId = null) {
  facts.push({
    schema: 'gamebuddy.fact-event.v1',
    eventVersion: 1,
    eventId: `fixture-reloads:${sequence}`,
    eventType,
    runId: 'run-reloads',
    combatId: generation === null ? null : 'combat-same-room',
    actionId,
    sourceSessionId: 'fixture-reloads',
    sourceSeq: sequence,
    occurredAt: 2_000 + sequence,
    attemptGeneration: generation,
    quality,
    payload
  });
  sequence += 1;
}

add('run.started', { character: 'IRONCLAD' });
add('combat.started', { encounterId: 'CULTIST' }, 0);
add('card.played', { cardId: 'ATTEMPT_0', cardType: 'Attack', playMode: 'manual' }, 0, 'play-0');
for (let generation = 1; generation <= 10; generation += 1) {
  add('combat.attempt_replaced', { replacedGeneration: generation - 1 }, generation);
  add('card.played', {
    cardId: `ATTEMPT_${generation}`,
    cardType: 'Attack',
    playMode: 'manual'
  }, generation, `play-${generation}`);
}
add('combat.ended', { victory: true }, 10);
add('run.ended', { cleared: false, endReason: 'death_after_room' });

module.exports = facts;
