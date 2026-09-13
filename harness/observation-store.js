const { validateMessage, stateSignature } = require('./protocol');
const { inferRestClosed, hasRestClosedSinceOpen } = require('./rest-lifecycle');

function createObservationStore({ historyLimit = 100, staleAfterMs = 5000 } = {}) {
  let state;
  let stateSignatureValue = '';
  let receivedAt = 0;
  let sequence = 0;
  const events = [];

  function ingest(message, now = Date.now()) {
    const validation = validateMessage(message);
    if (!validation.ok) return { accepted: false, kind: 'invalid', reason: validation.reason };

    if (message.type === 'state') {
      const signature = stateSignature(message.data);
      if (signature === stateSignatureValue) {
        receivedAt = now;
        return { accepted: false, kind: 'duplicate', state };
      }
      const previous = state;
      state = message.data;
      stateSignatureValue = signature;
      receivedAt = now;
      sequence += 1;
      const derivedEvents = [];
      const closed = !hasRestClosedSinceOpen(events) && inferRestClosed(previous, state);
      if (closed) {
        const event = {
          type: 'event',
          name: 'rest.closed',
          timestamp: now,
          data: closed,
          sequence: sequence + events.length + 1,
          receivedAt: now
        };
        events.push(event);
        derivedEvents.push(event);
        while (events.length > historyLimit) events.shift();
      }
      return { accepted: true, kind: 'state', state, sequence, receivedAt, derivedEvents };
    }

    const event = { ...message, sequence: sequence + events.length + 1, receivedAt: now };
    events.push(event);
    while (events.length > historyLimit) events.shift();
    return { accepted: true, kind: 'event', event };
  }

  function getObservation(now = Date.now()) {
    return {
      schema: 'gamebuddy.observation.v1',
      sequence,
      receivedAt,
      ageMs: receivedAt ? Math.max(0, now - receivedAt) : null,
      fresh: Boolean(state && receivedAt && (
        now - receivedAt <= staleAfterMs
        || (!state.combat && (
          (Array.isArray(state.map?.nodes) && state.map.nodes.length > 0)
          || (Array.isArray(state.map?.routes) && state.map.routes.length > 0)
          || (Array.isArray(state.event?.options) && state.event.options.length > 0)
          || (Array.isArray(state.cardReward?.options) && state.cardReward.options.length > 0)
        ))
      )),
      state: state || null,
      recentEvents: events.slice()
    };
  }

  return {
    ingest,
    getObservation,
    getState: () => state || null,
    getEvents: () => events.slice(),
    clear: () => {
      state = undefined;
      stateSignatureValue = '';
      receivedAt = 0;
      sequence = 0;
      events.length = 0;
    }
  };
}

module.exports = { createObservationStore };
