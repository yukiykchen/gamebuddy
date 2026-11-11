const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement() {
  const listeners = {};
  return {
    listeners,
    dataset: {},
    style: {},
    hidden: false,
    disabled: false,
    textContent: '',
    title: '',
    innerHTML: '',
    className: '',
    captured: false,
    released: false,
    classList: {
      names: new Set(),
      add(...values) { values.forEach(value => this.names.add(value)); },
      remove(...values) { values.forEach(value => this.names.delete(value)); },
      toggle(value, force) {
        const enabled = force === undefined ? !this.names.has(value) : Boolean(force);
        if (enabled) this.names.add(value);
        else this.names.delete(value);
        return enabled;
      },
      contains(value) { return this.names.has(value); }
    },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setPointerCapture() { this.captured = true; },
    hasPointerCapture() { return this.captured; },
    releasePointerCapture() { this.captured = false; this.released = true; },
    querySelector() { return createElement(); },
    focus() {}
  };
}

const elements = {};
const handlers = {};
const calls = [];
const windowControls = {
  openMain: () => calls.push('openMain'),
  startPetDrag: point => calls.push(['startPetDrag', point]),
  movePet: point => calls.push(['movePet', point]),
  endPetDrag: () => calls.push('endPetDrag'),
  showPetMenu: point => calls.push(['showPetMenu', point]),
  setCardExpanded: expanded => calls.push(['setCardExpanded', expanded]),
  dismissEncounterGuide: () => calls.push('dismissEncounterGuide'),
  reopenEncounterGuide: async () => {
    calls.push('reopenEncounterGuide');
    return null;
  },
  toggleLlmThinking: () => calls.push('toggleLlmThinking')
};
const windowScope = {
  windowControls,
  GameBuddyPetSprite: { createPetSprite: () => ({ setPose() {}, setPack() {} }) },
  gamebuddyBridge: {
    onStatus: fn => { handlers.status = fn; },
    onState: fn => { handlers.state = fn; },
    onRecommendation: fn => { handlers.recommendation = fn; },
    onEncounterGuide: fn => { handlers.guide = fn; },
    onEncounterGuideState: fn => { handlers.guideState = fn; },
    onCardRecommendation: fn => { handlers.card = fn; },
    onArchetypeMilestone: fn => { handlers.milestone = fn; },
    onAgentThinking: fn => { handlers.thinking = fn; },
    onLlmMode: fn => { handlers.llm = fn; },
    onPetSkin: fn => { handlers.skin = fn; }
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
windowScope.window = windowScope;
const documentStub = {
  querySelector(selector) {
    if (!elements[selector]) elements[selector] = createElement();
    return elements[selector];
  }
};

vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'pet.js'), 'utf8'),
  { window: windowScope, document: documentStub, console }
);

async function main() {
const speech = elements['#speech'];
const petButton = elements['#pet-button'];

async function clickSpeech() {
  return speech.listeners.click[0]();
}

function recorded() {
  return JSON.parse(JSON.stringify(calls));
}

function pointer(type, event) {
  petButton.listeners[type][0](event);
}

assert.equal(typeof speech.listeners.click[0], 'function');
assert.equal(typeof petButton.listeners.pointerup[0], 'function');
assert.equal(typeof petButton.listeners.contextmenu[0], 'function');

calls.length = 0;
await clickSpeech();
assert.deepEqual(recorded(), [], 'A speech bubble without a contextual action must not open Personal Data.');

calls.length = 0;
const beforeNormal=elements['#speech-text'].textContent;
handlers.guideState({ available: true, visible: false, kind:'normal', title:'小怪' });
assert.equal(elements['#speech-text'].textContent,beforeNormal,'Cached normal guide must not replace the current speech.');
assert.equal(elements['#encounter-guide'].classList.contains('visible'),false);
handlers.guideState({ available: true, visible: false, title: '守卫' });
let releaseGuide;
windowControls.reopenEncounterGuide = () => {
  calls.push('reopenEncounterGuide');
  return new Promise(resolve => { releaseGuide = resolve; });
};
const firstGuideClick = clickSpeech();
const secondGuideClick = clickSpeech();
await Promise.resolve();
assert.deepEqual(recorded(), ['reopenEncounterGuide']);
releaseGuide(null);
await firstGuideClick;
await secondGuideClick;
assert.deepEqual(recorded(), ['reopenEncounterGuide']);
assert.equal(calls.includes('openMain'), false);

calls.length = 0;
windowControls.reopenEncounterGuide = async () => {
  calls.push('reopenEncounterGuide');
  return { kind: 'elite', title: '精英', monsters: [], source: 'bridge' };
};
handlers.guideState({ available: true, visible: false, title: '精英' });
await clickSpeech();
assert.equal(calls.includes('reopenEncounterGuide'), true);
assert.equal(calls.includes('openMain'), false);
assert.equal(elements['#encounter-guide'].classList.contains('visible'), true);

calls.length = 0;
handlers.card({
  task: 'map_route',
  primary: { label: '商店', displayLabel: '商店' },
  confidence: 0.8,
  reason: '去商店',
  routeProfiles: { healthBand: 'healthy', active: 'balanced' }
});
assert.deepEqual(calls.filter(call => call !== 'openMain').some(call => Array.isArray(call) && call[0] === 'setCardExpanded'), true);
calls.length = 0;
await clickSpeech();
assert.deepEqual(recorded(), [['setCardExpanded', true]]);
await clickSpeech();
assert.deepEqual(recorded(), [['setCardExpanded', true]], 'An expanded suggestion must not fall through to Personal Data.');

calls.length = 0;
pointer('pointerdown', { button: 0, pointerId: 7, screenX: 10, screenY: 20 });
pointer('pointerup', { pointerId: 7 });
assert.deepEqual(recorded(), [['startPetDrag', { x: 10, y: 20 }], 'endPetDrag']);
assert.equal(petButton.released, true);
assert.equal(calls.includes('openMain'), false);

calls.length = 0;
petButton.released = false;
pointer('pointerdown', { button: 0, pointerId: 8, screenX: 0, screenY: 0 });
pointer('pointermove', { pointerId: 8, screenX: 12, screenY: 3 });
pointer('pointerup', { pointerId: 8 });
assert.deepEqual(recorded(), [
  ['startPetDrag', { x: 0, y: 0 }],
  ['movePet', { x: 12, y: 3 }],
  'endPetDrag'
]);
assert.equal(petButton.released, true);
assert.equal(calls.includes('openMain'), false);

calls.length = 0;
pointer('pointerdown', { button: 0, pointerId: 9, screenX: 1, screenY: 1 });
pointer('pointercancel', { pointerId: 9 });
assert.equal(calls.includes('endPetDrag'), true);
assert.equal(calls.includes('openMain'), false);

calls.length = 0;
let prevented = false;
pointer('contextmenu', {
  clientX: 30,
  clientY: 40,
  preventDefault() { prevented = true; }
});
assert.equal(prevented, true);
assert.deepEqual(recorded(), [['showPetMenu', { x: 30, y: 40 }]]);

console.log('Pet interaction tests passed.');
}

main();
