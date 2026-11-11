function fromObservedState(state, snapshotId) {
  const runId = state?.run?.runId;
  if (typeof runId !== 'string' || !runId || !state.player) return null;
  const card = row => ({ cardModelId: row?.id || null, name: row?.name || null,
    upgraded: row?.upgraded ?? null, cost: Number.isFinite(row?.cost) ? row.cost : null,
    combatCardInstanceId: row?.combatCardInstanceId || null, originDeckCardInstanceId: row?.deckCardInstanceId || null });
  return {
    schema: 'gamebuddy.recap-snapshot.v1', snapshotId, runId,
    capturedAt: state.timestamp || Date.now(), capturePoint: 'state_observation',
    combatId: state.combat?.combatId || null, attemptGeneration: state.combat?.attemptGeneration ?? null,
    timing: { turn: state.combat?.turn ?? null, side: state.combat?.side || null, settlementStatus: 'unknown' },
    player: { hp: state.player.hp ?? null, maxHp: state.player.maxHp ?? null,
      block: state.player.block ?? null, energy: state.player.energy ?? null,
      maxEnergy: state.player.maxEnergy ?? null, gold: state.player.gold ?? null },
    hand: (state.combat?.hand || []).map(card),
    cardZones: {
      draw: { count: state.combat?.drawPile?.length ?? null, members: null },
      discard: (state.combat?.discardPile || []).map(card),
      exhaust: (state.combat?.exhaustPile || []).map(card)
    },
    enemies: (state.combat?.enemies || []).map(row => ({
      entityInstanceId: row.entityInstanceId || null, modelId: row.id || null, name: row.name || null,
      hp: row.hp ?? null, maxHp: row.maxHp ?? null, block: row.block ?? null,
      visibleIntent: row.intent || null, alive: row.alive ?? null
    })),
    visibility: { hand: true, drawPileOrder: false, enemyIntent: true },
    quality: { observationMethod: 'snapshot', unknownFields: [
      ...(!state.combat?.combatId ? ['combatId'] : []), 'actionBoundary', 'drawPileOrder'
    ] }
  };
}

module.exports = { fromObservedState };
