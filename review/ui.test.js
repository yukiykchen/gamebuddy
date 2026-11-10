const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'run-details-ui.js'), 'utf8'), { window: window });
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-ui.js'), 'utf8'),
  { window }
);

const dashboard = {
  mainCharacter: 'ironclad',
  sampleSize: 4,
  window: { total: 4, wins: 2, losses: 1, abandoned: 1 },
  axes: [
    { label: '进攻出牌', value: 60 },
    { label: '拿牌克制', value: 70 },
    { label: '精英挑战', value: 80 },
    { label: '商店消费', value: 50 },
    { label: '火堆升级', value: 90 }
  ],
  stats: [{ id: 'winRate', label: '通关率', value: 66.7, numerator: 2, denominator: 3 }],
  recentRuns: [
    { character: 'ironclad', result: 'win', bossName: '守护者', floor: 55, maxTurnDamage: 128 },
    { character: 'silent', result: 'loss', bossName: null, floor: null, maxTurnDamage: null }
  ]
};

const html = window.GameBuddyReviewUi.render(dashboard);
assert.match(html, /主角色/);
assert.match(html, /玩法五星图/);
assert.match(html, /角色 · 通关状态 · BOSS · 楼层 · 单回合伤害/);
assert.match(html, /守护者/);
assert.match(html, /关底 BOSS/);
const killerHtml = window.GameBuddyReviewUi.render({
  ...dashboard,
  recentRuns: [{ character: 'ironclad', result: 'loss', encounterKind: 'killer', bossName: '猫头鹰法官', floor: 39, maxTurnDamage: 10 }]
});
assert.match(killerHtml, /死于/);
assert.match(killerHtml, /猫头鹰法官/);
assert.match(killerHtml, /39 层/);
assert.doesNotMatch(killerHtml, /关底 BOSS/);
assert.match(html, /最高单回合伤害/);
assert.match(html, /128/);
assert.match(html, /未知/);
assert.doesNotMatch(html, /副角色/);
assert.doesNotMatch(html, /数据链路/);
assert.equal((html.match(/review-radar-data/g) || []).length, 1);

const insufficient = window.GameBuddyReviewUi.render({ ...dashboard, sampleSize: 2 });
assert.match(insufficient, /再完成 1 局即可生成五星图/);
assert.equal((insufficient.match(/review-radar-data/g) || []).length, 0);

const unknownAxis = window.GameBuddyReviewUi.render({
  ...dashboard,
  axes: dashboard.axes.map((axis, index) => index === 2 ? { ...axis, value: null } : axis)
});
assert.equal((unknownAxis.match(/review-radar-data/g) || []).length, 0);
assert.match(unknownAxis,/等待精英挑战数据/);assert.doesNotMatch(unknownAxis,/再完成 0 局/);
const universalHtml=window.GameBuddyReviewUi.render({...dashboard,sampleSize:3,mainCharacterSampleSize:2});
assert.match(universalHtml,/全角色 · 最近 3 局/);assert.match(universalHtml,/2<small>局使用/);
assert.equal((universalHtml.match(/review-radar-data/g)||[]).length,1);
const abandonedHtml=window.GameBuddyReviewUi.render({...dashboard,window:{wins:1,losses:1,abandoned:1},recentRuns:[{result:'abandoned',character:'ironclad',runId:'quit'}]});
assert.match(abandonedHtml,/review-result abandoned">放弃/);assert.match(abandonedHtml,/放弃 1 局/);assert.doesNotMatch(abandonedHtml,/review-result loss/);
const countHtml=window.GameBuddyReviewUi.render({...dashboard,stats:[{id:'maxWinStreak',kind:'count',label:'最多连胜',value:3,sampleSize:50}]});
assert.match(countHtml,/最多连胜/);assert.match(countHtml,/3<small> 连胜/);assert.doesNotMatch(countHtml,/3%|width:3%/);

const hostileName = '打击<script>"&';
const buildDashboard = {
  ...dashboard,
  recentRuns: [
    {
      runId: 'alpha"run',
      character: 'ironclad',
      result: 'win',
      bossName: '守护者',
      floor: 55,
      maxTurnDamage: 128,
      deck: [
        { id: 'STRIKE', name: hostileName, upgraded: false },
        { id: 'STRIKE', name: hostileName, upgraded: true },
        { id: 'DEFEND', name: '防御', upgraded: false }
      ],
      relics: [{ id: 'ANCHOR', name: '锚<img>' }]
    },
    {
      runId: 'beta',
      character: 'silent',
      result: 'loss',
      bossName: '史莱姆',
      floor: 17,
      maxTurnDamage: 40,
      deck: [{ id: 'DAGGER', name: '匕首雨', upgraded: true }],
      relics: [{ id: 'RING', name: '蛇戒' }]
    },
    {
      runId: 'empty-build',
      character: 'defect',
      result: 'loss',
      bossName: '守卫',
      floor: 3,
      maxTurnDamage: 0,
      deck: [],
      relics: []
    },
    {
      runId: 'legacy',
      character: 'ironclad',
      result: 'abandoned',
      bossName: '未知首领',
      floor: 1,
      maxTurnDamage: null,
      deck: null,
      relics: null
    }
  ]
};

const collapsed = window.GameBuddyReviewUi.render(buildDashboard, null);
assert.match(collapsed, /role="button"/);
assert.match(collapsed, /data-run-id="alpha&quot;run"/);
assert.match(collapsed, /aria-expanded="false"/);
assert.match(collapsed, /aria-controls="review-run-build-0"/);
assert.match(collapsed, /aria-controls="review-run-build-1"/);
assert.doesNotMatch(collapsed, /review-run-build"/);
assert.doesNotMatch(collapsed, /终局牌组/);
assert.doesNotMatch(collapsed, /匕首雨/);

const alphaHtml = window.GameBuddyReviewUi.render(buildDashboard, 'alpha"run');
assert.match(alphaHtml, /data-run-id="alpha&quot;run"[^>]*aria-expanded="true"[^>]*aria-controls="review-run-build-0"/);
assert.match(alphaHtml, /id="review-run-build-0"/);
assert.match(alphaHtml, /data-run-id="beta"[^>]*aria-expanded="false"/);
assert.match(alphaHtml, /终局牌组/);
assert.match(alphaHtml, /终局遗物/);
assert.match(alphaHtml, /3 张/);
assert.match(alphaHtml, /1 件/);
assert.equal((alphaHtml.match(/review-card-chip/g) || []).length, 3);
assert.equal((alphaHtml.match(/review-card-upgrade/g) || []).length, 1);
assert.match(alphaHtml, /打击&lt;script&gt;&quot;&amp;/);
assert.match(alphaHtml, /锚&lt;img&gt;/);
assert.doesNotMatch(alphaHtml, /打击<script>/);
assert.doesNotMatch(alphaHtml, /匕首雨/);
assert.doesNotMatch(alphaHtml, /蛇戒/);
assert.doesNotMatch(alphaHtml, /本局没有记录到遗物/);
assert.doesNotMatch(alphaHtml, /旧记录未包含此数据/);

const betaHtml = window.GameBuddyReviewUi.render(buildDashboard, 'beta');
assert.match(betaHtml, /匕首雨/);
assert.match(betaHtml, /蛇戒/);
assert.match(betaHtml, /aria-label="已升级">\+<\/span>/);
assert.doesNotMatch(betaHtml, /打击&lt;script&gt;/);
assert.doesNotMatch(betaHtml, /锚&lt;img&gt;/);
assert.match(betaHtml, /data-run-id="beta"[^>]*aria-expanded="true"[^>]*aria-controls="review-run-build-1"/);
assert.match(betaHtml, /id="review-run-build-1"[^>]*data-run-id="beta"/);

const emptyHtml = window.GameBuddyReviewUi.render(buildDashboard, 'empty-build');
assert.match(emptyHtml, /本局没有记录到牌组/);
assert.match(emptyHtml, /本局没有记录到遗物/);
assert.match(emptyHtml, /0 张/);
assert.match(emptyHtml, /0 件/);
assert.doesNotMatch(emptyHtml, /旧记录未包含此数据/);

const legacyHtml = window.GameBuddyReviewUi.render(buildDashboard, 'legacy');
assert.equal((legacyHtml.match(/旧记录未包含此数据/g) || []).length, 2);
assert.doesNotMatch(legacyHtml, /本局没有记录到牌组/);
assert.doesNotMatch(legacyHtml, /本局没有记录到遗物/);

const idFallback = window.GameBuddyReviewUi.render({
  ...buildDashboard,
  recentRuns: [{
    runId: 'ids-only',
    character: 'ironclad',
    result: 'win',
    bossName: '守护者',
    floor: 2,
    maxTurnDamage: 1,
    deck: [{ id: 'STRIKE_R', name: '', upgraded: false }],
    relics: [{ id: 'BURNING_BLOOD', name: '' }]
  }]
}, 'ids-only');
assert.match(idFallback, /STRIKE_R/);
assert.match(idFallback, /BURNING_BLOOD/);

assert.match(html, /id="review-display-name"/);
assert.match(html, /榜上名称/);
assert.doesNotMatch(html, /排行榜|review-open-leaderboard/);

const recapHtml = window.GameBuddyReviewUi.renderRecap({
  status: 'local_only', portrait: '惜命<script>不惜债',
  runSummary: { character: 'IRONCLAD', ascension: 2, totalFloor: 39, act: 3, floor: 6,
    result: 'loss', durationLabel: '记录覆盖', durationDisplay: '40分42秒' },
  battleMetrics: [{ label: '累计输出', value: 0, display: '0' }],
  choiceStats: [{ label: '火堆回血', display: '6次' }],
  cards: [{ title: '瓶中精灵，留对了', body: '三层后它来捞人。' }], closing: '这局，命是真硬。'
});
assert.match(recapHtml, /累计输出/); assert.match(recapHtml, /实际恢复/);
assert.equal((recapHtml.match(/class="is-unknown"/g) || []).length, 3);
assert.match(recapHtml, /<strong>0<\/strong>/);
assert.match(recapHtml, /40分42秒/); assert.match(recapHtml, /到达第 39 层/);
assert.match(recapHtml, /惜命&lt;script&gt;不惜债/);
assert.doesNotMatch(recapHtml, /惜命<script>|evidenceIds|factsRevision/);
assert.match(recapHtml, /已记录选择/);

const emptyRecapHtml = window.GameBuddyReviewUi.renderRecap({
  status: 'ready', portrait: '', cards: [], closing: '',
  coverageNote: '本局没有找到值得单独讲的片段',
  runSummary: { character: 'IRONCLAD', result: 'loss' },
  battleMetrics: []
});
assert.match(emptyRecapHtml, /本局没有找到值得单独讲的片段/);
assert.doesNotMatch(emptyRecapHtml, /review-recap-card-index|review-recap-closing|review-recap-portrait/);

console.log('Review UI tests passed.');
