const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalFactStore } = require('../facts/local-fact-store');
const reloadFacts = require('../harness/fixtures/fact-ten-reloads');
const { createFactReviewService, summarize } = require('./fact-service');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-fact-review-'));
const store = createLocalFactStore({ rootDir: path.join(directory, 'facts') });
for (const fact of reloadFacts) assert.equal(store.ingest(fact).durable, true);
const effective = store.getEffectiveFacts('run-reloads');
const coverage = store.getCoverage('run-reloads');
const reloadSummary = summarize('run-reloads', effective, coverage);
assert.equal(reloadSummary.result, 'loss');
assert.equal(reloadSummary.counters.typedCardsPlayed, 1, 'Superseded card plays entered the summary.');
assert.equal(reloadSummary.counters.attacksPlayed, 1, 'Only the latest combat attempt should count.');

const architectFacts = [
  {
    eventType: 'run.observed',
    occurredAt: 1,
    payload: { character: 'ironclad', act: 3, floor: 55, deck: [], relics: [], potions: [] }
  },
  {
    eventType: 'combat.started',
    eventId: 'boss-start',
    combatId: 'architect-boss',
    attemptGeneration: 0,
    occurredAt: 2,
    payload: { roomType: 'Boss', bossId: 'THE_ARCHITECT', bossName: '建筑师' }
  },
  {
    eventType: 'combat.ended',
    eventId: 'boss-end',
    combatId: 'architect-boss',
    attemptGeneration: 0,
    occurredAt: 3,
    payload: { victory: true }
  },
  { eventType: 'run.ended', occurredAt: 4, payload: { cleared: true, reason: 'game_ended_victory' } }
];
const architect = summarize('architect-run', architectFacts, {
  families: { card_play: { state: 'unavailable' }, combat_resolution: { state: 'unavailable' } }
});
assert.equal(architect.result, 'win');
assert.equal(architect.finalBossName, '建筑师');
assert.equal(architect.finalEncounterKind, 'boss');
assert.equal(architect.finalFloor, 55);
assert.equal(architect.maxTurnDamage, null);
assert.equal(summarize('active-run', architectFacts.slice(0, -1), {}), null);

const service = createFactReviewService({ filePath: path.join(directory, 'review-history.v2.json') });
service.ingestRun('architect-run', architectFacts, { families: {} });
assert.equal(service.getDashboard().recentRuns[0].result, 'win');
assert.equal(service.getDashboard().window.abandoned, 0);
assert.equal(service.getHistory().runs.length, 1);

function observed(act, floor, at) {
  return { eventType: 'run.observed', occurredAt: at, payload: { character: 'ironclad', act, floor, deck: [], relics: [], potions: [] } };
}
const deathFacts = [
  observed(1, 17, 1),
  observed(1, 18, 2),
  observed(2, 0, 3),
  observed(2, 16, 4),
  observed(2, 17, 5),
  observed(3, 6, 6),
  {
    eventType: 'combat.started', combatId: 'crusher', attemptGeneration: 0, occurredAt: 4,
    payload: { roomType: 'Boss', boss: true, bossId: 'CRUSHER', bossName: '碾碎爪' }
  },
  { eventType: 'combat.ended', combatId: 'crusher', attemptGeneration: 0, occurredAt: 5, payload: { victory: true } },
  {
    eventType: 'combat.started', combatId: 'quit', attemptGeneration: 0, occurredAt: 7,
    payload: { roomType: 'Monster', enemies: [{ id: 'HUNTER_KILLER', name: '猎人杀手' }] }
  },
  { eventType: 'combat.attempt_replaced', combatId: 'quit', attemptGeneration: 1, occurredAt: 8, payload: {} },
  {
    eventType: 'combat.started', combatId: 'owl', attemptGeneration: 0, occurredAt: 9,
    payload: { roomType: 'Monster', boss: false, enemies: [{ id: 'OWL_MAGISTRATE', name: '猫头鹰法官' }] }
  },
  { eventType: 'run.ended', occurredAt: 10, payload: { cleared: false, reason: 'game_ended_not_cleared' } }
];
const death = summarize('death-run', deathFacts, { families: {} });
assert.equal(death.finalFloor, 39);
assert.equal(death.finalBossName, '猫头鹰法官');
assert.equal(death.finalBossId, 'OWL_MAGISTRATE');
assert.equal(death.finalEncounterKind, 'killer');
const groupDeath = summarize('group-death', deathFacts.map(fact => fact.combatId === 'owl' ? {
  ...fact, payload: { ...fact.payload, enemies: [
    { id: 'EEL', name: '花园幽灵鳗' }, { id: 'OWL_MAGISTRATE', name: '猫头鹰法官' }, { id: 'EEL', name: '花园幽灵鳗' }
  ] }
} : fact), { families: {} });
assert.equal(groupDeath.finalBossName, '花园幽灵鳗 ×2、猫头鹰法官');
const legacyGroupDeath = { ...groupDeath, finalBossName: '花园幽灵鳗、猫头鹰法官、花园幽灵鳗' };
assert.equal(require('./service').buildDashboard({ runs: [legacyGroupDeath] }).recentRuns[0].bossName, groupDeath.finalBossName);

assert.equal(summarize('explicit-floor', [
  observed(3, 6, 1),
  { eventType: 'run.observed', occurredAt: 2, payload: { act: 3, floor: 6, totalFloor: 40 } },
  { eventType: 'run.ended', occurredAt: 3, payload: { cleared: false, reason: 'game_ended_not_cleared' } }
], {}).finalFloor, 40);

const abandoned = summarize('abandoned-run', [
  ...deathFacts.slice(0, -1),
  { eventType: 'run.ended', occurredAt: 10, payload: { cleared: false, reason: 'abandoned' } }
], { families: {} });
assert.equal(abandoned.finalBossName, '碾碎爪');
assert.equal(abandoned.finalEncounterKind, 'boss');
assert.equal(abandoned.result,'abandoned');assert.equal(abandoned.endReason,'abandoned');
service.ingestRun('abandoned-run',[...deathFacts.slice(0,-1),{eventType:'run.ended',occurredAt:10,payload:{cleared:false,reason:'abandoned'}}],{families:{}});
assert.equal(service.getDashboard().window.abandoned,1);assert.equal(service.getDashboard().window.losses,0);
assert.equal(service.getDashboard().stats.find(s=>s.id==='winRate').denominator,1);
const migrationPath=path.join(directory,'migration.json');
fs.writeFileSync(migrationPath,JSON.stringify({schema:'gamebuddy.review-history.v2',runs:[{...abandoned,result:'loss',endReason:null},{runId:'legacy-no-facts',result:'loss',character:'silent'}]}));
const migrated=createFactReviewService({filePath:migrationPath});
const recovery={getEffectiveFacts:id=>id==='abandoned-run'?[...deathFacts.slice(0,-1),{eventType:'run.ended',occurredAt:10,payload:{cleared:false,reason:'abandoned'}}]:[],getCoverage:()=>({families:{}})};
assert.equal(migrated.refreshFromFacts(recovery),1);
assert.equal(migrated.getHistory().runs[0].result,'abandoned');assert.equal(migrated.getHistory().runs[1].result,'loss');
assert.equal(migrated.refreshFromFacts(recovery),0,'History recovery must be idempotent.');
assert.ok(fs.existsSync(migrationPath+'.bak'));

const guarded = summarize('guarded-run', [
  observed(1, 10, 1),
  { eventType: 'heal.resolved', combatId: 'fight', occurredAt: 2, payload: { targetEntityId: '0', amount: 6 } },
  { eventType: 'damage.resolved', combatId: 'fight', occurredAt: 3, payload: { targetEntityId: '0', hpLoss: 4, blocked: 6 } },
  { eventType: 'damage.resolved', combatId: 'fight', occurredAt: 4, payload: { targetEntityId: '1', hpLoss: 20, blocked: 0 } },
  { eventType: 'run.ended', occurredAt: 5, payload: { cleared: false, reason: 'game_ended_not_cleared' } }
], { families: { combat_resolution: { state: 'available' } } });
assert.equal(guarded.counters.playerHpLoss, 4);
assert.equal(guarded.counters.playerBlocked, 6);

assert.equal(architect.gameMode, null);
assert.equal(architect.observedDurationSeconds, null);
assert.equal(architect.combatSaveLoad, false);
assert.deepEqual(architect.finalDeck, []);
assert.deepEqual(architect.finalRelics, []);
assert.deepEqual(architect.selectedEvents, []);
assert.equal(architect.finalBossName, '建筑师');
assert.equal(death.combatSaveLoad, true);
assert.equal(death.result, 'loss');

const cleared = summarize('clear-run', [
  { eventType: 'run.started', occurredAt: 1_000, payload: { gameMode: 'Standard' } },
  { eventType: 'run.resumed', occurredAt: 1_500, payload: { gameMode: 'Daily' } },
  {
    eventType: 'run.observed', occurredAt: 1_200,
    payload: {
      character: 'silent', ascension: 0,
      deck: [{ id: 'STRIKE', name: 'Strike', upgraded: false, description: 'Deal 6' }],
      relics: [{ id: 'OLD', name: 'Old relic' }],
      potions: [{ id: 'EARLY' }],
      hp: 70
    }
  },
  {
    eventType: 'run.observed', occurredAt: 4_000,
    payload: {
      character: 'silent', ascension: 1,
      deck: [
        { id: 'STRIKE', name: 'Strike+', upgraded: true, description: 'Deal 9' },
        { name: 'missing-id', upgraded: true },
        { id: 'BASH', Name: 'Bash', Upgraded: false }
      ],
      relics: [{ id: 'RING', name: 'Ring', counter: 2 }],
      potions: [{ id: 'POT', name: 'Potion' }],
      hp: 3, maxHp: 80, gold: 12
    }
  },
  { eventType: 'event.option_selected', occurredAt: 2_000, payload: { optionId: 'SKIP', label: 'Skip' } },
  { eventType: 'event.selected', occurredAt: 2_100, payload: { eventId: 'FISH', pageId: 'PAGE', optionId: 'EAT' } },
  { eventType: 'combat.attempt_replaced', occurredAt: 3_000, payload: { replacedGeneration: 0 } },
  { eventType: 'run.ended', occurredAt: 4_600, payload: { cleared: true, reason: 'game_ended_victory' } }
], {});
assert.equal(cleared.result, 'win');
assert.equal(cleared.gameMode, 'Standard');
assert.equal(cleared.startedAt, 1_000);
assert.equal(cleared.observedDurationSeconds, 3);
assert.equal(cleared.combatSaveLoad, true);
assert.equal(cleared.ascension, 1);
assert.equal(cleared.finalState.hp, 3);
assert.equal(cleared.finalState.deck[0].name, 'Strike+');
assert.equal(cleared.finalState.deck[0].description, 'Deal 9');
assert.deepEqual(cleared.finalState.potions, [{ id: 'POT', name: 'Potion' }]);
assert.deepEqual(cleared.finalDeck, [
  { id: 'STRIKE', upgraded: true },
  { id: 'BASH', upgraded: false }
]);
assert.deepEqual(cleared.finalRelics, [{ id: 'RING' }]);
assert.deepEqual(cleared.selectedEvents, [{ eventId: 'FISH', pageId: 'PAGE', optionId: 'EAT' }]);

const resumedOnly = summarize('resumed-clear', [
  { eventType: 'run.resumed', occurredAt: 5_000, payload: { gameMode: 'Daily' } },
  { eventType: 'run.observed', occurredAt: 5_100, payload: { character: 'ironclad', ascension: 0, deck: [], relics: [] } },
  { eventType: 'run.ended', occurredAt: 5_999, payload: { cleared: true, reason: 'game_ended_victory' } }
], {});
assert.equal(resumedOnly.gameMode, 'Daily');
assert.equal(resumedOnly.observedDurationSeconds, 0);
assert.equal(resumedOnly.combatSaveLoad, false);

const rewound = summarize('rewound-clear', [
  { eventType: 'run.started', occurredAt: 2_000, payload: { gameMode: 'Standard' } },
  { eventType: 'run.ended', occurredAt: 1_000, payload: { cleared: true, reason: 'game_ended_victory' } }
], {});
assert.equal(rewound.observedDurationSeconds, 0);

fs.rmSync(directory, { recursive: true, force: true });
console.log('Fact review service tests passed.');
