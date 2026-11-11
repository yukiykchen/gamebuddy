const FACT_SCHEMA = 'gamebuddy.fact-event.v1';
const FACT_EVENT_TYPES = new Set([
  'context.snapshot', 'capture.started', 'capture.capability_reported', 'capture.gap_detected', 'capture.recovered', 'capture.stopped',
  'run.observed', 'run.started', 'run.resumed', 'run.suspended', 'run.ended', 'run.reload_observed',
  'room.entered', 'room.exited',
  'reward.offered', 'reward.updated', 'reward.resolved',
  'route.offered', 'route.selected', 'map.observed',
  'shop.opened', 'shop.inventory_updated', 'shop.transaction_completed', 'shop.closed',
  'rest.options_offered', 'rest.action_completed',
  'event.options_offered', 'event.option_selected', 'event.option_resolved', 'event.selected',
  'deck.card_added', 'deck.card_removed', 'deck.card_upgraded', 'deck.card_transformed', 'deck.card_modified',
  'relic.gained', 'relic.lost', 'relic.changed',
  'potion.gained', 'potion.used', 'potion.discarded', 'potion.replaced',
  'combat.started', 'combat.attempt_replaced', 'combat.ended',
  'turn.started', 'turn.ending', 'turn.ended', 'entity.spawned', 'entity.exited',
  'card.played', 'card.drawn', 'card.discarded', 'card.exhausted', 'card.generated', 'card.moved',
  'damage.resolved', 'block.changed', 'heal.resolved', 'resource.changed', 'power.changed',
  'gold.changed', 'health.changed', 'max_health.changed', 'capacity.changed'
]);
const OBSERVATION_METHODS = new Set(['direct_hook', 'state_diff', 'snapshot', 'replay', 'unknown']);
const UNKNOWN_REASONS = new Set(['not_applicable', 'unsupported', 'not_observed', 'gap', 'invalid']);
const CAPABILITY_STATES = new Set(['available', 'unavailable', 'partial']);

function nonEmptyString(value, maximum = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function validateQuality(quality) {
  if (!quality || typeof quality !== 'object' || Array.isArray(quality)) {
    return { ok: false, reason: 'fact quality must be an object' };
  }
  if (!OBSERVATION_METHODS.has(quality.observationMethod)) {
    return { ok: false, reason: 'fact quality has unsupported observationMethod' };
  }
  if (!Array.isArray(quality.unknownFields)
    || quality.unknownFields.some(field => !nonEmptyString(field, 128))
    || new Set(quality.unknownFields).size !== quality.unknownFields.length) {
    return { ok: false, reason: 'fact quality.unknownFields must contain unique field names' };
  }
  const reasons = quality.unknownReasons;
  if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) {
    return { ok: false, reason: 'fact quality.unknownReasons must be an object' };
  }
  for (const field of quality.unknownFields) {
    if (!UNKNOWN_REASONS.has(reasons[field])) {
      return { ok: false, reason: `fact quality missing a supported reason for ${field}` };
    }
  }
  return { ok: true };
}

function validateCapabilities(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !payload.capabilities || typeof payload.capabilities !== 'object'
    || Array.isArray(payload.capabilities)) {
    return { ok: false, reason: 'capability report needs capabilities' };
  }
  for (const [family, capability] of Object.entries(payload.capabilities)) {
    if (!nonEmptyString(family, 128) || !capability || typeof capability !== 'object') {
      return { ok: false, reason: 'capability report entry is invalid' };
    }
    if (!CAPABILITY_STATES.has(capability.state)) {
      return { ok: false, reason: `capability ${family} has unsupported state` };
    }
    if (capability.reason !== undefined && !nonEmptyString(capability.reason, 512)) {
      return { ok: false, reason: `capability ${family} reason is invalid` };
    }
  }
  return { ok: true };
}

function validateFactEvent(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return { ok: false, reason: 'fact must be an object' };
  }
  if (fact.schema !== FACT_SCHEMA) return { ok: false, reason: `unsupported fact schema ${fact.schema || 'missing'}` };
  if (!Number.isInteger(fact.eventVersion) || fact.eventVersion < 1) {
    return { ok: false, reason: 'fact eventVersion must be a positive integer' };
  }
  if (!nonEmptyString(fact.eventId, 512)) return { ok: false, reason: 'fact eventId must be non-empty' };
  if (!FACT_EVENT_TYPES.has(fact.eventType)) return { ok: false, reason: `unsupported fact eventType ${fact.eventType || 'missing'}` };
  if (!nonEmptyString(fact.runId, 256)) return { ok: false, reason: 'fact runId must be non-empty' };
  if (!nonEmptyString(fact.sourceSessionId, 256)) return { ok: false, reason: 'fact sourceSessionId must be non-empty' };
  if (!Number.isInteger(fact.sourceSeq) || fact.sourceSeq < 1) {
    return { ok: false, reason: 'fact sourceSeq must be a positive integer' };
  }
  if (!Number.isFinite(fact.occurredAt)) return { ok: false, reason: 'fact occurredAt must be a number' };
  if (fact.sourceElapsedMs !== undefined && fact.sourceElapsedMs !== null
    && (!Number.isFinite(fact.sourceElapsedMs) || fact.sourceElapsedMs < 0)) {
    return { ok: false, reason: 'fact sourceElapsedMs must be non-negative' };
  }
  if (fact.receivedAt !== undefined && fact.receivedAt !== null && !Number.isFinite(fact.receivedAt)) {
    return { ok: false, reason: 'fact receivedAt must be a number' };
  }
  for (const field of ['segmentId', 'combatId', 'decisionId', 'actionId', 'parentActionId', 'contextSnapshotId', 'beforeSnapshotId', 'afterSnapshotId']) {
    if (fact[field] !== undefined && fact[field] !== null && !nonEmptyString(fact[field], 256)) {
      return { ok: false, reason: `fact ${field} must be a non-empty string or null` };
    }
  }
  if (fact.attemptGeneration !== undefined && fact.attemptGeneration !== null
    && (!Number.isInteger(fact.attemptGeneration) || fact.attemptGeneration < 0)) {
    return { ok: false, reason: 'fact attemptGeneration must be a non-negative integer' };
  }
  if (fact.combatId && !Number.isInteger(fact.attemptGeneration)) {
    return { ok: false, reason: 'combat facts need attemptGeneration' };
  }
  if (!fact.payload || typeof fact.payload !== 'object' || Array.isArray(fact.payload)) {
    return { ok: false, reason: 'fact payload must be an object' };
  }
  const quality = validateQuality(fact.quality);
  if (!quality.ok) return quality;
  if (fact.eventType === 'capture.capability_reported') return validateCapabilities(fact.payload);
  if (fact.eventType === 'combat.attempt_replaced') {
    if (!fact.combatId || !Number.isInteger(fact.payload.replacedGeneration)
      || fact.payload.replacedGeneration >= fact.attemptGeneration) {
      return { ok: false, reason: 'combat.attempt_replaced needs an older replacedGeneration' };
    }
  }
  if (fact.eventType === 'run.ended' && typeof fact.payload.cleared !== 'boolean') {
    return { ok: false, reason: 'run.ended payload.cleared must be a boolean' };
  }
  return { ok: true };
}

function validateFactMessage(message) {
  if (!message || typeof message !== 'object' || message.type !== 'fact') {
    return { ok: false, reason: 'message must be a fact object' };
  }
  return validateFactEvent(message.data);
}

function validateFactAck(message) {
  if (!message || typeof message !== 'object' || message.type !== 'fact_ack') {
    return { ok: false, reason: 'message must be a fact_ack object' };
  }
  if (!nonEmptyString(message.sourceSessionId, 256)
    || !Number.isInteger(message.ackSourceSeq) || message.ackSourceSeq < 0) {
    return { ok: false, reason: 'fact_ack needs sourceSessionId and non-negative ackSourceSeq' };
  }
  return { ok: true };
}

module.exports = {
  CAPABILITY_STATES,
  FACT_EVENT_TYPES,
  FACT_SCHEMA,
  OBSERVATION_METHODS,
  UNKNOWN_REASONS,
  validateFactAck,
  validateFactEvent,
  validateFactMessage
};
