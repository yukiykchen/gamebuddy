const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function decode(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readAttr(source, name) {
  const match = source.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decode(match[1]) : null;
}

function createNode(className) {
  const node = {
    className,
    parent: null,
    children: [],
    listeners: {},
    attrs: {},
    focused: false,
    classList: {
      add() {},
      remove() {}
    },
    getAttribute(name) {
      return node.attrs[name] ?? null;
    },
    setAttribute(name, value) {
      node.attrs[name] = value;
    },
    addEventListener(type, fn) {
      (node.listeners[type] ||= []).push(fn);
    },
    focus() {
      node.focused = true;
    },
    matches(selector) {
      return selector === `.${className}` || selector.split('.').filter(Boolean).every(part => className.split(/\s+/).includes(part));
    },
    closest(selector) {
      let current = node;
      while (current) {
        if (current.matches?.(selector)) return current;
        current = current.parent;
      }
      return null;
    },
    contains(target) {
      let current = target;
      while (current) {
        if (current === node) return true;
        current = current.parent;
      }
      return false;
    },
    querySelector(selector) {
      return walk(node, item => item.matches?.(selector))[0] || null;
    },
    querySelectorAll(selector) {
      return walk(node, item => item.matches?.(selector));
    }
  };
  return node;
}

function walk(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) walk(child, predicate, found);
  return found;
}

function append(parent, child) {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

function dispatch(target, type, init = {}) {
  const event = {
    target,
    type,
    key: init.key,
    repeat: Boolean(init.repeat),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  let current = target;
  while (current) {
    event.currentTarget = current;
    for (const listener of current.listeners[type] || []) listener(event);
    current = current.parent;
  }
  return event;
}

function selectedValue(html, id) {
  const block = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[\\s\\S]*?</select>`));
  if (!block) return '';
  const options = [...block[0].matchAll(/<option\b([^>]*)>/g)];
  const selected = options.find(option => /\bselected\b/.test(option[1])) || options[0];
  return selected ? (readAttr(selected[1], 'value') || '') : '';
}

function mountHtml(root, html) {
  root.innerHTMLValue = html;
  root.children = [];
  const byId = {};
  function register(id, node) {
    node.attrs.id = id;
    byId[id] = node;
    return node;
  }
  function mountButton(id) {
    const match = html.match(new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>`));
    if (!match) return null;
    const node = register(id, append(root, createNode('')));
    node.disabled = /\bdisabled\b/.test(match[0]);
    return node;
  }
  function mountInput(id) {
    const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`));
    if (!match) return null;
    const node = register(id, append(root, createNode('')));
    node.value = readAttr(match[0], 'value') || '';
    return node;
  }
  function mountSelect(id) {
    if (!html.includes(`id="${id}"`)) return null;
    const node = register(id, append(root, createNode('')));
    node.value = selectedValue(html, id);
    return node;
  }
  function mountId(id) {
    if (!html.includes(`id="${id}"`)) return null;
    return register(id, append(root, createNode('')));
  }
  mountButton('review-export');
  mountButton('review-clear');
  mountButton('review-open-leaderboard');
  mountButton('review-back-personal');
  mountButton('leaderboard-submit');
  mountButton('leaderboard-retry');
  mountInput('leaderboard-ascension');
  mountInput('review-display-name');
  mountSelect('leaderboard-character');
  mountSelect('leaderboard-mode');
  mountId('leaderboard-form');
  mountId('review-name-form');
  const list = append(root, createNode('review-run-list'));
  const cardPattern = /<div class="(review-run-card[^"]*)"([^>]*)>/g;
  let cardMatch;
  while ((cardMatch = cardPattern.exec(html))) {
    const entry = append(list, createNode('review-run-entry'));
    const card = append(entry, createNode(cardMatch[1]));
    card.attrs['data-run-id'] = readAttr(cardMatch[2], 'data-run-id');
    card.attrs['aria-expanded'] = readAttr(cardMatch[2], 'aria-expanded');
    card.attrs['aria-controls'] = readAttr(cardMatch[2], 'aria-controls');
  }
  const board = append(root, createNode('leaderboard-list'));
  const rowPattern = /<div class="(leaderboard-row[^"]*)"([^>]*)>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html))) {
    const entry = append(board, createNode('leaderboard-entry'));
    const row = append(entry, createNode(rowMatch[1]));
    row.attrs['data-run-id'] = readAttr(rowMatch[2], 'data-run-id');
    row.attrs['aria-expanded'] = readAttr(rowMatch[2], 'aria-expanded');
    row.attrs['aria-controls'] = readAttr(rowMatch[2], 'aria-controls');
  }
  root.querySelector = selector => {
    if (selector.startsWith('#')) return byId[selector.slice(1)] || null;
    if (selector === '.review-run-list') return html.includes('review-run-list') ? list : null;
    if (selector === '.leaderboard-list') return html.includes('leaderboard-list') ? board : null;
    if (selector === '.review-run-card') return list.querySelector('.review-run-card');
    if (selector === '.leaderboard-row') return board.querySelector('.leaderboard-row');
    return null;
  };
  root.querySelectorAll = selector => {
    if (selector === '.review-run-card') return list.querySelectorAll('.review-run-card');
    if (selector === '.leaderboard-row') return board.querySelectorAll('.leaderboard-row');
    return [];
  };
  return { list, board };
}

function createRoot() {
  const root = createNode('root');
  let html = '';
  Object.defineProperty(root, 'innerHTML', {
    get() {
      return html;
    },
    set(value) {
      html = value;
      mountHtml(root, value);
    }
  });
  return root;
}

const windowScope = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'run-details-ui.js'), 'utf8'), { window: windowScope });
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-ui.js'), 'utf8'),
  { window: windowScope }
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-renderer.js'), 'utf8'),
  { window: windowScope }
);

const runs = [
  {
    runId: 'alpha',
    character: 'ironclad',
    result: 'win',
    bossName: '守护者',
    floor: 55,
    maxTurnDamage: 80,
    deck: [
      { id: 'STRIKE', name: '打击', upgraded: true },
      { id: 'STRIKE', name: '打击', upgraded: false }
    ],
    relics: [{ id: 'BURNING_BLOOD', name: '燃烧之血' }]
  },
  {
    runId: 'beta',
    character: 'silent',
    result: 'loss',
    bossName: '史莱姆',
    floor: 12,
    maxTurnDamage: 20,
    deck: [{ id: 'DAGGER', name: '匕首雨', upgraded: false }],
    relics: [{ id: 'RING', name: '蛇戒' }]
  }
];

const root = createRoot();
const controller = windowScope.GameBuddyReviewRenderer.createReviewController({
  root,
  toast: { textContent: '', classList: { add() {}, remove() {} } },
  ui: windowScope.GameBuddyReviewUi,
  bridge: {},
  confirm: () => false
});

controller.setDashboard({ recentRuns: runs });
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);

const [alpha, beta] = root.querySelectorAll('.review-run-card');
dispatch(alpha, 'click');
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
assert.match(root.innerHTML, /打击/);
assert.doesNotMatch(root.innerHTML, /匕首雨/);
assert.doesNotMatch(root.innerHTML, /蛇戒/);
assert.equal(root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'alpha').focused, true);

const betaAfter = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'beta');
dispatch(betaAfter, 'click');
assert.equal(controller.getExpandedRunId(), 'beta');
assert.match(root.innerHTML, /匕首雨/);
assert.match(root.innerHTML, /蛇戒/);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);

const betaAgain = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'beta');
const space = dispatch(betaAgain, 'keydown', { key: ' ' });
assert.equal(space.defaultPrevented, true);
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /匕首雨/);
assert.doesNotMatch(root.innerHTML, /终局牌组/);

const alphaAgain = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'alpha');
dispatch(alphaAgain, 'keydown', { key: 'Enter' });
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
dispatch(alphaAgain, 'keydown', { key: 'Enter', repeat: true });
assert.equal(controller.getExpandedRunId(), 'alpha', 'Key repeat must not collapse the open run.');

controller.setDashboard({
  recentRuns: runs.map(run => ({ ...run, floor: run.floor + 1 }))
});
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
assert.doesNotMatch(root.innerHTML, /蛇戒/);

controller.setDashboard({ recentRuns: [runs[1]] });
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);
assert.doesNotMatch(root.innerHTML, /aria-expanded="true"/);

console.log('Review renderer interaction tests passed.');

const test = require('node:test');
function setup() {
  const pending = [], renders = [], listeners = {}, list = { addEventListener() {} }, region = { outerHTML: '' };
  const root = { innerHTML: '', querySelector: selector => selector === '.review-run-details' ? region : selector === '.review-run-list' ? list
    : selector === '#review-clear' ? { addEventListener: (type, fn) => { listeners.clear = fn; } } : null };
  const window = { GameBuddyRunDetailsUi: { render: d => `detail:${d?.runId || d?.status}` }, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync('src/review-renderer.js', 'utf8'), { window });
  const bridge = { getRunDetails: runId => new Promise(resolve => pending.push({ runId, resolve })),
    getRunRecap: async () => null, requestReviewClear: async () => 'token', clearReview: async () => ({ ok: true, dashboard: { recentRuns: [] } }) };
  const controller = window.GameBuddyReviewRenderer.createReviewController({ root, bridge, confirm: () => true,
    ui: { render: (dashboard, expanded, profile, recaps, details) => { renders.push(details[expanded]); return ''; } } });
  controller.setDashboard({ recentRuns: [{ runId: 'a' }, { runId: 'b' }] });
  return { controller, pending, region, renders, listeners };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('independent detail cache is reused and switching runs ignores stale UI updates', async () => {
  const f = setup(); f.controller.activateRun('a'); await settle(); assert.equal(f.pending.length, 1);
  f.controller.activateRun('b'); await settle(); f.pending[0].resolve({ runId: 'a', status: 'ready' }); await settle();
  assert.equal(f.region.outerHTML, '');
  f.pending[1].resolve({ runId: 'b', status: 'ready' }); await settle(); assert.equal(f.region.outerHTML, 'detail:b');
  f.controller.activateRun('a'); await settle(); assert.equal(f.pending.length, 2); assert.equal(f.renders.at(-1).runId, 'a');
});
test('dashboard invalidation ignores late responses from previous generation', async () => {
  const f = setup(); f.controller.activateRun('a'); await settle();
  f.controller.setDashboard({ recentRuns: [{ runId: 'a' }] }); await settle();
  f.pending[0].resolve({ runId: 'old', status: 'ready' }); await settle(); assert.equal(f.region.outerHTML, '');
  f.pending[1].resolve({ runId: 'a', status: 'ready' }); await settle(); assert.equal(f.region.outerHTML, 'detail:a');
});
test('clearing history invalidates in-flight detail request and leaves the run closed', async () => {
  const f = setup(); f.controller.activateRun('a'); await settle(); await f.listeners.clear();
  f.pending[0].resolve({ runId: 'a', status: 'ready' }); await settle();
  assert.equal(f.region.outerHTML, ''); assert.equal(f.controller.getExpandedRunId(), null);
});
test('unavailable detail can retry when reopened', async () => {
  const f = setup(); f.controller.activateRun('a'); await settle(); f.pending[0].resolve(null); await settle();
  assert.equal(f.region.outerHTML, 'detail:unavailable');
  f.controller.activateRun('a'); f.controller.activateRun('a'); await settle(); assert.equal(f.pending.length, 2);
  f.pending[1].resolve({ runId: 'a', status: 'ready' }); await settle(); assert.equal(f.region.outerHTML, 'detail:a');
});
