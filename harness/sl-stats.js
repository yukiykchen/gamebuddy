const fs = require('node:fs');

const STATS_SCHEMA = 'gamebuddy.sl-stats.v1';

function isAtRunStart(state) {
  if (!state?.run || Number(state.run.act) !== 1) return false;
  const start = state.map?.start;
  const current = state.map?.current;
  const visited = Array.isArray(state.map?.visited) ? state.map.visited : [];
  if (start && current === start) return true;
  if (start && visited.length === 1 && visited[0] === start) return true;
  const floor = Number(state.run.totalFloor ?? state.run.floor);
  return Number.isFinite(floor) && floor <= 1 && visited.length <= 1 && !current;
}

function speechForThisRun(count) {
  const n = Number(count) || 0;
  if (n <= 2) return '又读档进来了？这局才刚走没多久';
  if (n <= 9) return `这局已经读档 ${n} 次了`;
  return `这局读档 ${n} 次了，认真点打吧`;
}

function applyRunEntry(prev, { hasLiveRun, state } = {}) {
  const inSession = Boolean(prev?.inSession);
  const thisRun = Number.isInteger(prev?.thisRun) && prev.thisRun >= 0 ? prev.thisRun : 0;
  if (!hasLiveRun) {
    return { inSession: false, thisRun, incremented: false };
  }
  // A new run can begin without the Bridge disconnecting. Reset before the
  // in-session fast path so the previous run's reload count cannot leak into it.
  if (isAtRunStart(state)) {
    return { inSession: true, thisRun: 0, incremented: false };
  }
  if (inSession) {
    return { inSession: true, thisRun, incremented: false };
  }
  return { inSession: true, thisRun: thisRun + 1, incremented: true };
}

function loadSlStats(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (raw?.schema !== STATS_SCHEMA) return { thisRun: 0 };
    const thisRun = Number(raw.thisRun);
    return { thisRun: Number.isInteger(thisRun) && thisRun >= 0 ? thisRun : 0 };
  } catch {
    return { thisRun: 0 };
  }
}

function saveSlStats(filePath, stats) {
  const thisRun = Number.isInteger(stats?.thisRun) && stats.thisRun >= 0 ? stats.thisRun : 0;
  fs.writeFileSync(filePath, `${JSON.stringify({ schema: STATS_SCHEMA, thisRun }, null, 2)}\n`);
}

function createSlTracker({ persistPath = null } = {}) {
  const persist = Boolean(persistPath);
  let inSession = false;
  let thisRun = persist ? loadSlStats(persistPath).thisRun : 0;

  function persistIfChanged(nextRun) {
    if (!persist || nextRun === thisRun) return;
    saveSlStats(persistPath, { thisRun: nextRun });
  }

  function observe({ hasLiveRun, state } = {}) {
    const result = applyRunEntry({ inSession, thisRun }, { hasLiveRun, state });
    persistIfChanged(result.thisRun);
    inSession = result.inSession;
    thisRun = result.thisRun;
    return {
      thisRun,
      incremented: result.incremented,
      speech: result.incremented ? speechForThisRun(thisRun) : null
    };
  }

  function snapshot() {
    return { thisRun, incremented: false, speech: null };
  }

  return { observe, snapshot };
}

module.exports = {
  STATS_SCHEMA,
  isAtRunStart,
  speechForThisRun,
  applyRunEntry,
  loadSlStats,
  saveSlStats,
  createSlTracker
};
