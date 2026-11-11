const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDashboard, createReviewService, loadHistory } = require('./service');

function state(runId, character = 'ironclad', floor = 1, enemyHp = null, turn = 1) {
  return {
    timestamp: Date.now(),
    run: { runId, character, act: 1, floor, totalFloor: floor, nextBossId: 'THE_GUARDIAN', nextBoss: '守护者' },
    player: { hp: 70, maxHp: 80, gold: 99, cards: Array(12).fill({ id: 'STRIKE' }), relics: [], potions: [] },
    combat: enemyHp === null ? null : { turn, enemies: [{ hp: enemyHp }] }
  };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-review-'));
const filePath = path.join(directory, 'history.json');
const service = createReviewService({ filePath, checkpointMs: 0 });

service.ingestState(state('run-1', 'ironclad', 1, 40, 1));
service.ingestEvent({ name: 'combat.started', data: { roomType: 'Elite' } });
service.ingestState(state('run-1', 'ironclad', 1, 24, 1));
service.ingestEvent({ name: 'card.played', data: { cardType: 'Attack' } });
service.ingestEvent({ name: 'card.reward.opened', data: {} });
service.ingestEvent({ name: 'card.reward.closed', data: { outcome: 'skipped' } });
service.ingestEvent({ name: 'rest.opened', data: {} });
service.ingestEvent({ name: 'rest.closed', data: { action: 'SMITH' } });
service.ingestEvent({ name: 'run.ended', data: { runId: 'run-1', result: 'win', floor: 55, bossName: '守护者' } });

let dashboard = service.getDashboard();
assert.equal(dashboard.window.wins, 1);
assert.equal(dashboard.mainCharacter, 'ironclad');
assert.equal(dashboard.recentRuns[0].maxTurnDamage, 16);
assert.equal(dashboard.recentRuns[0].bossName, '守护者');
assert.equal(dashboard.recentRuns[0].deck.length, 12);
assert.deepEqual(dashboard.recentRuns[0].deck[0], { id: 'STRIKE', name: 'STRIKE', upgraded: false });
assert.deepEqual(dashboard.recentRuns[0].relics, []);
assert.equal(dashboard.axes.find(axis => axis.id === 'depth').value, 100);
assert.equal(dashboard.axes.find(axis => axis.id === 'elite').value, 100);
assert.equal(dashboard.axes.find(axis => axis.id === 'investment').value, 50);
assert.equal(dashboard.stats.find(stat => stat.id === 'maxWinStreak').value, 1);
assert.deepEqual(dashboard.stats.map(s=>s.id),['winRate','progress','eliteRun','maxWinStreak']);

service.ingestState(state('run-2', 'silent', 3));
service.ingestState(state('run-3', 'ironclad', 1));
assert.equal(service.getHistory().runs.find(run => run.runId === 'run-2').result, 'abandoned');
service.ingestEvent({ name: 'run.ended', data: { runId: 'run-3', result: 'loss', floor: 1 } });

service.ingestState(state('same-id', 'silent', 2));
service.ingestEvent({ name: 'run.ended', data: { result: 'loss' } });
service.ingestState(state('same-id', 'silent', 2));
service.ingestEvent({ name: 'run.ended', data: { result: 'win' } });
assert.equal(service.getHistory().runs.filter(run => run.runId === 'same-id').length, 1);
assert.equal(service.getHistory().runs.find(run => run.runId === 'same-id').result, 'win');

for (let index = 0; index < 105; index += 1) {
  service.ingestState(state(`bulk-${index}`, 'defect', index % 55));
  service.ingestEvent({ name: 'run.ended', data: { result: 'loss' } });
}
assert.equal(service.getHistory().runs.length, 100);

service.flush();
fs.copyFileSync(filePath, `${filePath}.bak`);
fs.writeFileSync(filePath, '{bad json', 'utf8');
const recovered = loadHistory(filePath);
assert.match(recovered.recoveryWarning, /备份恢复/);
assert.equal(recovered.runs.length, 100);

service.clear();
dashboard = service.getDashboard();
assert.equal(dashboard.window.total, 0);
assert.equal(dashboard.axes.every(axis => axis.value === null), true);

const baseCounters = {
  combats: 1, normalCombats: 0, eliteEntries: 1, eliteWins: 1, bossEntries: 0,
  typedCardsPlayed: 1, attacksPlayed: 1,
  cardRewards: 1, cardsTaken: 0, rewardSkips: 1, unknownRewards: 0,
  shopsVisited: 1, knownGoldSpent: 100, unknownShopClosures: 0,
  restSites: 1, smiths: 1, heals: 0, otherKnownRestActions: 0, unknownRestActions: 0
};
const aggregate = buildDashboard({
  schema: 'gamebuddy.review-history.v1',
  runs: [
    { runId: 'recent-silent', character: 'silent', result: 'abandoned', initialDeckSize: 10, finalFloor: 10, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'iron-win', character: 'ironclad', result: 'win', initialDeckSize: 10, finalFloor: 55, finalAct: 3, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'silent-loss', character: 'silent', result: 'loss', initialDeckSize: 10, finalFloor: 20, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'iron-loss', character: 'ironclad', result: 'loss', initialDeckSize: 10, finalFloor: 20, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters }
  ]
});
assert.equal(aggregate.mainCharacter, 'silent', 'Usage ties must prefer the most recently used character.');
assert.equal(aggregate.stats.find(stat => stat.id === 'winRate').denominator, 3, 'All characters count; abandoned runs must not enter the win-rate denominator.');
assert.equal(aggregate.sampleSize,4);
assert.equal(aggregate.mainCharacterSampleSize,2);
assert.equal(aggregate.axes.find(axis => axis.id === 'depth').value, 50);
assert.equal(aggregate.axes.find(axis => axis.id === 'elite').value, 100);
assert.equal(aggregate.axes.find(axis => axis.id === 'investment').value, 100);

const universal=buildDashboard({runs:[
  {character:'IRONCLAD',endedAt:1,result:'loss',counters:{...baseCounters,typedCardsPlayed:20,attacksPlayed:10}},
  {character:'ironclad',endedAt:2,result:'abandoned',counters:{...baseCounters,typedCardsPlayed:0,attacksPlayed:0}},
  {character:'SILENT',endedAt:3,result:'win',counters:{...baseCounters,typedCardsPlayed:10,attacksPlayed:0}}
]});
assert.equal(universal.sampleSize,3);assert.equal(universal.mainCharacter,'ironclad');assert.equal(universal.mainCharacterSampleSize,2);
assert.equal(universal.axes.find(a=>a.id==='elite').value,100,'Style axes must include every character in the recent window.');
assert.equal(universal.stats.find(a=>a.id==='winRate').value,50);
const fifty=Array.from({length:50},(_,i)=>({runId:'recent-'+i,endedAt:100+i,character:i%2?'SILENT':'IRONCLAD',result:'loss',counters:baseCounters}));
const recentWindow=buildDashboard({runs:[{runId:'older',endedAt:1,character:'regent',result:'win',counters:baseCounters},...fifty]});
assert.equal(recentWindow.sampleSize,50);assert.equal(recentWindow.mainCharacter,'silent');assert.equal(recentWindow.mainCharacterSampleSize,25);
const styled = buildDashboard({ runs: [{
  runId: 'styled', character: 'ironclad', result: 'loss', finalFloor: 25,
  finalState: {
    gold: 0,
    deck: [
      { id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, { id: 'PERFECTED_STRIKE' },
      { id: 'TWIN_STRIKE' }, { id: 'STRIKE_IRONCLAD' }
    ],
    relics: []
  },
  counters: { ...baseCounters, eliteEntries: 1, normalCombats: 3, bossEntries: 0, knownGoldSpent: 50, smiths: 1, heals: 1, playerBlocked: 6, playerHpLoss: 4 }
}]});
assert.deepEqual(styled.axes.map(axis => axis.label), ['深入', '精英', '体系', '投入', '护身']);
assert.equal(styled.axes.find(axis => axis.id === 'depth').value, 50);
assert.equal(styled.axes.find(axis => axis.id === 'elite').value, 25);
assert.equal(styled.axes.find(axis => axis.id === 'guard').value, 60);
assert.equal(styled.axes.find(axis => axis.id === 'investment').value, 75);
assert.ok(styled.axes.find(axis => axis.id === 'system').value > 0);
assert.equal(recentWindow.recentRuns[0].runId,'recent-49');assert.ok(!recentWindow.recentRuns.some(r=>r.runId==='older'));
function streakOf(results){return buildDashboard({runs:results.map((result,i)=>({runId:'streak-'+i,endedAt:i+1,result,character:'ironclad',counters:baseCounters}))}).stats.find(s=>s.id==='maxWinStreak');}
assert.equal(streakOf(['win','win','abandoned','win']).value,2);
assert.equal(streakOf(['win','loss','win','win','win']).value,3);
assert.equal(streakOf(['win','unknown','win']).value,1);
assert.equal(streakOf([]).value,0);
assert.equal(streakOf(Array(55).fill('win')).value,50,'Streak must respect the same last-50 window.');
assert.equal(streakOf(['win']).kind,'count');

const builds = buildDashboard({
  schema: 'gamebuddy.review-history.v1',
  runs: [
    {
      runId: 'alpha',
      character: 'ironclad',
      result: 'win',
      finalState: {
        deck: [
          { id: 'STRIKE', name: '打击', upgraded: false },
          { id: 'STRIKE', name: '打击', IsUpgraded: true },
          { id: 'DEFEND', Name: '防御', Upgraded: true }
        ],
        relics: ['BURNING_BLOOD', { id: 'ANCHOR', name: '锚', description: '开局获得格挡' }]
      }
    },
    {
      runId: 'empty-build',
      character: 'silent',
      result: 'loss',
      finalState: { deck: [], relics: [] }
    },
    {
      runId: 'legacy',
      character: 'defect',
      result: 'abandoned'
    },
    {
      runId: 'partial',
      character: 'ironclad',
      result: 'loss',
      finalState: { gold: 12 }
    },
    {
      runId: 'not-object',
      character: 'ironclad',
      result: 'loss',
      finalState: 'missing'
    }
  ]
});
const [alpha, emptyBuild, legacy, partial, notObject] = builds.recentRuns;
assert.deepEqual(alpha.deck, [
  { id: 'STRIKE', name: '打击', upgraded: false },
  { id: 'STRIKE', name: '打击', upgraded: true },
  { id: 'DEFEND', name: '防御', upgraded: true }
]);
assert.deepEqual(alpha.relics, [
  { id: 'BURNING_BLOOD', name: 'BURNING_BLOOD' },
  { id: 'ANCHOR', name: '锚' }
]);
assert.equal('description' in alpha.relics[1], false);
assert.deepEqual(emptyBuild.deck, []);
assert.deepEqual(emptyBuild.relics, []);
for (const run of [legacy, partial, notObject]) {
  assert.equal(run.deck, null);
  assert.equal(run.relics, null);
}
assert.deepEqual(builds.recentRuns.map(run => run.runId), ['alpha', 'empty-build', 'legacy', 'partial', 'not-object']);
assert.notDeepEqual(alpha.deck, emptyBuild.deck);
assert.notDeepEqual(alpha.relics, legacy.relics);

fs.rmSync(directory, { recursive: true, force: true });
console.log('Review service tests passed.');
