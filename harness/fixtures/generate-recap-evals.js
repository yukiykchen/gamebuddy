// Synthetic STS2 shaped records. Names and IDs follow the repository codex; these are not real plays.
const fs = require('node:fs');
const path = require('node:path');
const { validateFactEvent } = require('../fact-protocol');

const directory = path.join(__dirname, 'recap-evals');
fs.mkdirSync(directory, { recursive: true });
const cases = [
  { id: 'upgrade-never-drawn', elite: 'death', drawUpgrade: false, gap: false },
  { id: 'upgrade-drawn-no-energy', elite: 'death', drawUpgrade: true, gap: false },
  { id: 'overkill-confirmed', elite: 'win', drawUpgrade: true, gap: false },
  { id: 'capture-gap', elite: 'death', drawUpgrade: false, gap: true },
  { id: 'same-name-instance', elite: 'death', sameName: true },
  { id: 'automatic-upgrade-play', elite: 'death', autoPlay: true },
  { id: 'reload-two-observations', elite: 'death', reloads: true },
  { id: 'block-gain-vs-absorb', elite: 'death', gainBlock: true },
  { id: 'requested-not-resolved', elite: 'win', requestedOnly: true },
  { id: 'overkill-with-reload', elite: 'win', reloads: true }
];
const report = [];

for (const setting of cases) {
  const runId = `synthetic-sts2-${setting.id}`;
  const sourceSessionId = `fixture-${setting.id}`;
  const facts = [];
  let seq = 0;
  const event = (eventType, payload = {}, combatId = null, extras = {}) => {
    seq++;
    const row = {
      schema: 'gamebuddy.fact-event.v1', eventVersion: 1,
      eventId: `${sourceSessionId}:${seq}`, eventType, runId, sourceSessionId,
      sourceSeq: seq, occurredAt: 100000 + seq * 1000,
      quality: { observationMethod: 'direct_hook', unknownFields: [], unknownReasons: {} },
      payload, synthetic: true, ...extras
    };
    if (combatId) { row.combatId = combatId; row.attemptGeneration = 0; }
    facts.push(row);
    return row;
  };
  event('capture.capability_reported', { capabilities: {
    lifecycle: { state: 'available' }, reload_observation: { state: 'available' }, card_play: { state: 'available' },
    card_movement: { state: 'available' }, combat_resolution: { state: 'available' }
  } });
  event('run.started', { character: 'IRONCLAD', ascension: 0, game: 'Slay the Spire 2' });
  const cards = ['STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'DEFEND_IRONCLAD'];
  for (let fight = 1; fight <= 4; fight++) {
    const combat = `normal-${fight}`;
    event('combat.started', { roomType: 'Normal', encounterId: 'BOWLBUGS_NORMAL',
      deckInstanceIds: ['deck-bash', 'deck-strike-1', 'deck-strike-2', 'deck-defend'] }, combat);
    for (let turn = 1; turn <= 3; turn++) {
      event('turn.started', { turn, side: 'player' }, combat);
      for (let card = 0; card < 3; card++) {
        event('card.drawn', { cardId: cards[card], cardInstanceId: `deck-${['strike-1', 'strike-2', 'defend'][card]}` }, combat);
        if (card < 2) {
          event('card.played', { cardId: cards[card], cardInstanceId: `deck-${['strike-1', 'strike-2'][card]}`, executed: true }, combat);
          event('damage.resolved', { sourceSide: 'player', targetSide: 'enemy',
            targetEntityId: `bowlbug-${fight}`, turn, side: 'player', hpLoss: 6,
            resolvedDamageBeforeHpCap: 6, targetHpBefore: 36 - (turn - 1) * 12 - card * 6,
            fatal: turn === 3 && card === 1 }, combat);
        }
      }
      if (turn === 3) {
        if (setting.gainBlock && fight === 4) event('block.changed', { entityId: 'ironclad', gained: 100, current: 100 }, combat);
        event('turn.ended', { turn, side: 'player' }, combat);
        continue;
      }
      event('turn.started', { turn, side: 'enemy' }, combat);
      event('damage.resolved', { sourceSide: 'enemy', targetSide: 'player',
        targetEntityId: 'ironclad', hpLoss: 5, blocked: 2, fatal: false }, combat);
      event('turn.ended', { turn, side: 'enemy' }, combat);
    }
    event('combat.ended', { victory: true }, combat);
    event('reward.offered', { cards: ['POMMEL_STRIKE', 'SHRUG_IT_OFF'] }, null, { decisionId: `reward-${fight}` });
    event('reward.resolved', { result: fight === 1 ? 'selected' : 'skipped',
      cardId: fight === 1 ? 'POMMEL_STRIKE' : null }, null, { decisionId: `reward-${fight}` });
    if (fight === 1) event('deck.card_added', { cardId: 'POMMEL_STRIKE', cardInstanceId: 'deck-pommel' });
  }
  event('event.options_offered', { eventId: 'ACT1_RISK_EVENT', options: ['take_damage_for_reward'] });
  event('event.option_resolved', { eventId: 'ACT1_RISK_EVENT', hpLoss: 16, hpAfter: 24 });
  if (setting.sameName) event('deck.card_added', { cardId: 'BASH', cardInstanceId: 'deck-bash-copy' });
  if (setting.reloads) {
    event('run.reload_observed', { observationId: `${runId}:1`, observedCount: 1 });
    event('run.reload_observed', { observationId: `${runId}:2`, observedCount: 2 });
  }
  const smith = event('rest.action_completed', { action: 'smith', cardId: 'BASH',
    cardName: '痛击', cardInstanceId: 'deck-bash', upgraded: true });
  const elite = 'elite-bygone-effigy';
  event('combat.started', { roomType: 'Elite', encounterId: 'BYGONE_EFFIGY_ELITE',
    deckInstanceIds: ['deck-bash', 'deck-strike-1', 'deck-strike-2', 'deck-defend', 'deck-pommel',
      ...(setting.sameName ? ['deck-bash-copy'] : [])] }, elite);
  event('turn.started', { turn: 1, side: 'player' }, elite);
  if (setting.drawUpgrade) {
    event('card.played', { cardId: 'POMMEL_STRIKE', cardInstanceId: 'deck-pommel',
      actualEnergyPaid: 1, executed: true }, elite);
    event('resource.changed', { resource: 'energy', before: 1, after: 0 }, elite);
    event('card.drawn', { cardId: 'BASH', cardInstanceId: 'deck-bash',
      cost: 2, energyAtDraw: 0, playable: false, unavailableReason: 'insufficient_energy' }, elite);
  } else {
    event('card.drawn', { cardId: 'DEFEND_IRONCLAD', cardInstanceId: 'deck-defend' }, elite);
    event('card.played', { cardId: 'STRIKE_IRONCLAD', cardInstanceId: 'deck-strike-1', executed: true }, elite);
  }
  if (setting.sameName) event('card.played', { cardId: 'BASH', cardInstanceId: 'deck-bash-copy', executed: true }, elite);
  if (setting.autoPlay) event('card.played', { cardId: 'BASH', cardInstanceId: 'deck-bash', autoPlay: true, executed: true }, elite);
  if (setting.elite === 'win') {
    event('power.changed', { entityId: 'ironclad', powerId: 'STRENGTH', amount: 4 }, elite);
    for (let turn = 2; turn <= 10; turn++) {
      event('turn.started', { turn, side: 'player' }, elite);
      event('card.drawn', { cardId: 'POMMEL_STRIKE', cardInstanceId: 'deck-pommel' }, elite);
      event('card.played', { cardId: 'POMMEL_STRIKE', cardInstanceId: 'deck-pommel', executed: true }, elite);
      event('damage.resolved', { sourceSide: 'player', targetSide: 'enemy', turn, side: 'player',
        targetEntityId: 'effigy-1', hpLoss: 13,
        resolvedDamageBeforeHpCap: 13, targetHpBefore: 127 - (turn - 2) * 13, fatal: false }, elite);
      if (turn < 10) {
        event('turn.started', { turn, side: 'enemy' }, elite);
        event('block.changed', { entityId: 'ironclad', gained: 13, current: 13 }, elite);
        event('damage.resolved', { sourceSide: 'enemy', targetSide: 'player',
          targetEntityId: 'ironclad', hpLoss: 0, blocked: 13, fatal: false }, elite);
      }
    }
    event('power.changed', { entityId: 'ironclad', powerId: 'STRENGTH', amount: 18 }, elite);
    const hit = event('damage.resolved', { sourceSide: 'player', targetSide: 'enemy', turn: 10,
      side: 'player', targetEntityId: 'effigy-1', hpLoss: 10, targetHpBefore: 10,
      resolvedDamageBeforeHpCap: setting.requestedOnly ? null : 24,
      requested: setting.requestedOnly ? 99 : 24, fatal: true }, elite);
    event('combat.ended', { victory: true }, elite);
    event('run.ended', { cleared: true, reason: 'synthetic_fixture' });
    setting.expectedEventId = hit.eventId;
  } else {
    event('turn.started', { turn: 1, side: 'enemy' }, elite);
    event('damage.resolved', { sourceSide: 'enemy', targetSide: 'player',
      targetEntityId: 'ironclad', hpLoss: 13, blocked: 0, fatal: false }, elite);
    event('turn.started', { turn: 2, side: 'player' }, elite);
    event('turn.started', { turn: 2, side: 'enemy' }, elite);
    event('damage.resolved', { sourceSide: 'enemy', targetSide: 'player',
      targetEntityId: 'ironclad', hpLoss: 11, blocked: 0, fatal: true }, elite);
    event('combat.ended', { victory: false }, elite);
    event('run.ended', { cleared: false, reason: 'death' });
    setting.expectedEventId = smith.eventId;
  }
  if (setting.gap) {
    const removed = facts.splice(70, 1)[0];
    event('capture.gap_detected', { fromSourceSeq: removed.sourceSeq,
      toSourceSeq: removed.sourceSeq, reason: 'queue_overflow' });
  }
  for (const row of facts) {
    const check = validateFactEvent(row);
    if (!check.ok) throw new Error(`${setting.id}: ${row.eventId}: ${check.reason}`);
  }
  if (facts.length <= 100) throw new Error(`${setting.id}: only ${facts.length} events`);
  const output = { synthetic: true, game: 'Slay the Spire 2', runId,
    provenance: 'hand-authored deterministic fixture; not captured from game',
    facts, coverage: { families: {
      lifecycle: { state: 'available' }, reload_observation: { state: 'available' }, card_play: { state: 'available' },
      card_movement: { state: 'available' }, combat_resolution: { state: 'available' }
    }, gaps: setting.gap ? [{ sourceSessionId, from: 71, to: 71, reason: 'queue_overflow' }] : [] },
    expected: { candidate: { pattern: setting.elite === 'win' ? 'overkill'
      : setting.drawUpgrade ? 'upgrade_no_energy' : 'upgrade_not_used',
      eventId: setting.expectedEventId },
      allowed: !setting.gap && !setting.autoPlay && !setting.requestedOnly,
      forbidden: ['如果回血一定能赢', '玩家操作失误'] } };
  fs.writeFileSync(path.join(directory, `${setting.id}.json`), `${JSON.stringify(output, null, 2)}\n`);
  report.push({ id: setting.id, eventCount: facts.length, synthetic: true });
}
fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify({ cases: report }, null, 2)}\n`);
