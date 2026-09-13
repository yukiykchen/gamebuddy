function isRestSnapshot(snapshot) {
  if (!snapshot || snapshot.combat) return false;
  const room = String(snapshot.run?.room || '');
  const node = String(snapshot.run?.currentNode || '');
  if (/rest|camp/i.test(room)) return true;
  if (/map/i.test(room)) return false;
  return /rest/i.test(node);
}

function newlyUpgradedCard(previous, next) {
  const before = new Set(
    (previous?.player?.cards || [])
      .filter(card => card?.upgraded)
      .map(card => `${card.id || ''}\0${card.name || ''}`)
  );
  for (const card of next?.player?.cards || []) {
    if (!card?.upgraded) continue;
    const key = `${card.id || ''}\0${card.name || ''}`;
    if (!before.has(key)) {
      return { cardId: card.id || null, cardName: card.name || null };
    }
  }
  return null;
}

function inferRestClosed(previous, next) {
  if (!isRestSnapshot(previous) || !next) return null;
  const hpBefore = Number(previous.player?.hp);
  const hpAfter = Number(next.player?.hp);
  if (Number.isFinite(hpBefore) && Number.isFinite(hpAfter) && hpAfter > hpBefore) {
    return { action: 'HEAL', hpBefore, hpAfter };
  }
  const smith = newlyUpgradedCard(previous, next);
  if (smith) return { action: 'SMITH', ...smith };
  if (!isRestSnapshot(next) && !next.combat) return { action: null };
  return null;
}

function hasRestClosedSinceOpen(events) {
  const list = Array.isArray(events) ? events : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const name = list[index]?.name;
    if (name === 'rest.closed') return true;
    if (name === 'rest.opened') return false;
  }
  return false;
}

module.exports = { isRestSnapshot, inferRestClosed, hasRestClosedSinceOpen };
