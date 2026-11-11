'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { builds, cards, cardGuidance, decorateCardGuidance, profile, guidanceSignature } = require('../knowledge/card-guidance');
const { groups } = require('../knowledge/build-mechanics');
const { CardGuidanceService, applyAiChoices, rewardGuidanceFromState } = require('../knowledge/card-guidance-service');
const { evaluateCardAlerts, evaluateShopAlerts } = require('../knowledge/card-guidance-alerts');
const ui = require('../../src/archetype-ui');
const input = (overrides = {}) => ({ runId: 'run-1', character: 'ironclad', deck: ['HELLRAISER','POMMEL_STRIKE','TWIN_STRIKE','PERFECTED_STRIKE',...Array(16).fill('DEFEND_IRONCLAD')], relics: [], context: 'reward', signature: 'reward-1', candidates: [{id:'POMMEL_STRIKE'}, {id:'POMMEL_STRIKE',upgraded:true}], ...overrides });
const aiResponse = message => ({cards: message.cards.map(c => ({key:c.key,systems:c.systems.map(s => ({systemId:s.systemId,diagnosisId:s.options[0].id,shortfall:s.options[0].shortfall,advice:s.options[0].advice}))}))});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('选牌页面重连仅靠奖励快照恢复三行，关闭即清理并兼容旧Mod事件',()=>{
  const reward={signature:'0:POMMEL_STRIKE:False',cards:[{id:'POMMEL_STRIKE',upgraded:false}],canSkip:true};
  const recovered=rewardGuidanceFromState({reward,combat:null});
  assert.equal(recovered.signature,reward.signature);
  const service=new CardGuidanceService();
  const result=service.update(input(recovered));
  assert.equal(result.cards[0].systems[0].systemId,'ironclad:auto-strike');
  assert.equal(rewardGuidanceFromState({reward:null},recovered),null);
  assert.equal(rewardGuidanceFromState({combat:{}},recovered),null);
  assert.equal(rewardGuidanceFromState({shop:{}},recovered),null);
  assert.equal(rewardGuidanceFromState({},recovered),recovered);
});

test('五职业25攻略全部可追溯，核心辅助遗物无未匹配；26个体系均有功能组', () => {
  const data = require('../knowledge/build-guides.json'); assert.equal(data.builds.length,25); assert.deepEqual(data.unresolved,[]);
  assert.equal(builds.length,26);
  for(const character of ['ironclad','silent','defect','regent','necrobinder']) assert.equal(data.builds.filter(b=>b.character===character).length,5);
  for(const b of builds){assert.ok(groups[b.id.split(':')[1]]);assert.ok(b.core.length);assert.match(b.source,/^https:\/\//);for(const c of [...b.core,...b.support])assert.ok(cards.has(c.id),c.id);}
});
test('打击牌及数量增伤统一属于自动打击，奖励商店与AI输入均无独立打击成长',()=>{
  const owned=['HELLRAISER','POMMEL_STRIKE','PERFECTED_STRIKE'];
  const candidates=['PERFECTED_STRIKE','POMMEL_STRIKE','TWIN_STRIKE','ASHEN_STRIKE','SETUP_STRIKE','STRIKE_IRONCLAD'].map(id=>({id}));
  const decorated=decorateCardGuidance('ironclad',owned,[],candidates);
  for(const card of decorated){
    assert.equal(card.buildGuidance.systems.filter(s=>s.systemId==='ironclad:auto-strike').length,1);
    assert.ok(!card.buildGuidance.systems.some(s=>s.systemId==='ironclad:strike-growth'||s.systemName==='打击成长'));
  }
  const perfected=decorated[0].buildGuidance.systems.find(s=>s.systemId==='ironclad:auto-strike');
  assert.match(perfected.role,/数量增伤/);assert.match(perfected.advice,/增加打击可强化完美打击/);
  const service=new CardGuidanceService();
  for(const context of ['reward','shop']){
    const m=service.update(input({context,deck:owned,candidates}));
    assert.doesNotMatch(JSON.stringify(m),/strike-growth|打击成长/);
  }
});
test('五职业有关联的牌有三行定位，无关联不伪造流派，多体系保留且不评分', () => {
  for(const card of cards.values()){
    const g=cardGuidance(card.color,[],[],card); assert.ok(Array.isArray(g.systems));
    assert.ok(!g.systems.some(s=>s.systemId==='generic'||s.systemName==='通用'));
    for(const s of g.systems)for(const field of ['role','shortfall','advice'])assert.ok(s[field]);
    assert.equal(g.score,undefined);
  }
  const g=cardGuidance('ironclad',[],[],{id:'ASHEN_STRIKE'});
  assert.ok(g.systems.some(s=>s.systemId==='ironclad:exhaust-engine'));assert.ok(g.systems.some(s=>s.systemId==='ironclad:auto-strike'));
});
test('无归属和未知牌无提示，无关牌不请求AI，混合批次不能被模型补回通用体系',async()=>{
  for(const id of ['GIANT_ROCK','DEFEND_IRONCLAD','NEW_CARD']){
    const g=cardGuidance('ironclad',[],[],{id});assert.deepEqual(g.systems,[]);assert.equal(ui.renderGuidance(g),'');
  }
  const payloads=[];
  const service=new CardGuidanceService({llm:{enabled:true,completeBuildGuidance:async p=>{payloads.push(p);return aiResponse(p);}}});
  service.update(input({candidates:[{id:'GIANT_ROCK'}]}));await flush();assert.equal(payloads.length,0);
  const mixed=service.update(input({signature:'mixed',candidates:[{id:'GIANT_ROCK'},{id:'POMMEL_STRIKE'}]}));await flush();
  assert.equal(payloads.length,1);assert.deepEqual(payloads[0].cards.map(c=>c.cardId),['POMMEL_STRIKE']);
  assert.equal(service.current.source,'ai');assert.equal(service.current.cards.length,2);assert.deepEqual(service.current.cards[0].systems,[]);
  const injected=aiResponse(mixed);assert.equal(applyAiChoices(mixed,injected),null);
  const cleared=service.update(input({signature:'empty-after-related',candidates:[{id:'GIANT_ROCK'}]}));assert.deepEqual(cleared.cards[0].systems,[]);
});
test('3/20打击、剑柄1张不会说够，候选不提前加入；未启动还显示数量', () => {
  const x=input(),g=cardGuidance(x.character,x.deck,[],x.candidates[0]);const s=g.systems.find(s=>s.systemId==='ironclad:auto-strike');
  assert.match(s.shortfall,/打击3\/20张/);assert.match(s.shortfall,/剑柄打击1张/);assert.doesNotMatch(s.shortfall+s.advice,/足够|已成型|稳定|无限/);
  const missing=cardGuidance('ironclad',['POMMEL_STRIKE','STRIKE_IRONCLAD'],[],{id:'POMMEL_STRIKE'}).systems.find(s=>s.systemId==='ironclad:auto-strike');
  assert.match(missing.shortfall,/缺少地狱狂徒/);assert.match(missing.shortfall,/打击2\/2张/);
});
test('明确缺失按功能分支判断，格挡输出不强制壁垒，消耗不强制双收益', () => {
  const g=cardGuidance('ironclad',['SHRUG_IT_OFF','BODY_SLAM'],[],{id:'BARRICADE'}).systems.find(s=>s.systemId==='ironclad:block-barricade');
  assert.ok(g.options.some(o=>o.id==='inventory'));assert.match(g.shortfall,/尚无跨回合格挡/);
  const e=cardGuidance('ironclad',['TRUE_GRIT','FEEL_NO_PAIN'],[],{id:'DARK_EMBRACE'}).systems.find(s=>s.systemId==='ironclad:exhaust-engine');
  assert.equal(e.diagnosisId,'inventory');assert.doesNotMatch(e.shortfall,/缺少黑暗之拥/);
  const conditional=profile('ironclad',['FEEL_NO_PAIN','FIEND_FIRE','BODY_SLAM'],[]).find(p=>p.build.id==='ironclad:block-barricade');
  assert.ok(conditional.functions.find(g=>g.id==='generation').present);
  const strength=profile('ironclad',['RUPTURE','BLOODLETTING'],[]).find(p=>p.build.id==='ironclad:strength-scaling');
  assert.ok(strength.functions.find(g=>g.id==='source').present);
});
test('冲突需要当前路线证据，不把未列入攻略或跨体系判成冲突', () => {
  const active=cardGuidance('ironclad',['HELLRAISER','POMMEL_STRIKE'],[],{id:'BATTLE_TRANCE'});
  assert.match(active.systems.find(s=>s.conflict).shortfall,/不能继续抽牌/);
  assert.ok(!cardGuidance('ironclad',[],[],{id:'BATTLE_TRANCE'}).systems.some(s=>s.conflict));
  assert.ok(!cardGuidance('ironclad',['HELLRAISER'],[],{id:'SHRUG_IT_OFF'}).systems.some(s=>s.conflict));
});
test('通用抽牌、基础防御不认定为路线；未知卡不猜机制',()=>{
  assert.ok(!profile('silent',['BACKFLIP','ACROBATICS','PREPARED'],[]).some(p=>p.active));
  const unknown=cardGuidance('ironclad',[{id:'NEW_CARD'}],[],{id:'POMMEL_STRIKE'});
  assert.match(unknown.systems[0].shortfall,/未核实/);
});
test('装饰不改变原推荐分数、顺序和输入，移除旧流派评分字段',()=>{
  const raw=[{id:'POMMEL_STRIKE',score:5,archetypeScores:[1]},{id:'SHRUG_IT_OFF',score:80}];const before=JSON.stringify(raw);
  const result=decorateCardGuidance('ironclad',[],[],raw);assert.deepEqual(result.map(c=>c.score),[5,80]);assert.equal(JSON.stringify(raw),before);assert.equal(result[0].archetypeScores,undefined);
});
test('AI可选择合法配对，虚构数量、假成型、混合建议、缺失体系均拒绝',()=>{
  const service=new CardGuidanceService();const m=service.update(input());const valid=aiResponse(m);assert.ok(applyAiChoices(m,valid));
  for(const text of ['打击足够，已经稳定成型。','已有20张打击。','缺少已经持有的地狱狂徒。']){const bad=structuredClone(valid);bad.cards[0].systems[0].shortfall=text;assert.equal(applyAiChoices(m,bad),null);}
  const missing=structuredClone(valid);missing.cards[0].systems.pop();assert.equal(applyAiChoices(m,missing),null);
});
test('异步先规则后AI，换场景迟到作废，升级候选分离、有限缓存',async()=>{
  const pending=[],updates=[];const service=new CardGuidanceService({llm:{enabled:true,completeBuildGuidance:p=>new Promise(r=>pending.push({p,r}))},onUpdate:m=>updates.push(m),maxCache:1});
  const first=service.update(input());assert.equal(first.source,'rules');assert.equal(first.cards.length,2);assert.notEqual(first.cards[0].key,first.cards[1].key);
  const second=service.update(input({signature:'reward-2'}));pending[0].r(aiResponse(first));await flush();assert.equal(updates.at(-1).signature,'reward-2');
  pending[1].r(aiResponse(second));await flush();assert.equal(updates.at(-1).source,'ai');assert.equal(service.cache.size,1);
  service.clear();assert.equal(updates.at(-1),null);assert.equal(service.update(input({signature:'reward-2'})).source,'ai');
});
test('没有模型或失败始终可看规则；同名库存去重、变牌组不复用旧结果',async()=>{
  const service=new CardGuidanceService({llm:{enabled:true,completeBuildGuidance:async()=>{throw Error('offline');}}});
  const m=service.update(input({candidates:[{id:'POMMEL_STRIKE'},{id:'POMMEL_STRIKE'}]}));assert.equal(m.cards.length,1);await flush();assert.equal(service.current.source,'rules');
  assert.notEqual(guidanceSignature(input()),guidanceSignature(input({deck:['HELLRAISER']})));
});
test('三行HTML转义，所有体系保留且不显示构筑分数',()=>{
  const g=cardGuidance('ironclad',[],[],{id:'ASHEN_STRIKE'});g.systems[0].shortfall='<script>x</script>';
  const html=ui.renderGuidance(g);assert.match(html,/&lt;script&gt;/);assert.equal((html.match(/<section /g)||[]).length,g.systems.length);assert.equal((html.match(/<p>/g)||[]).length,g.systems.length*2);assert.doesNotMatch(html,/契合度|beforeScore/);
});
test('五职业核心通知与遗物通知无评分，商店金币不足独立说明',()=>{
  for(const character of ['ironclad','silent','defect','regent','necrobinder']){const b=builds.find(b=>b.character===character);const alerts=evaluateCardAlerts({character,deck:[],cards:b.core});assert.ok(alerts.length);assert.ok(alerts.every(a=>a.delta===undefined));}
  const alert=evaluateShopAlerts({character:'ironclad',deck:['POMMEL_STRIKE','STRIKE_IRONCLAD'],gold:10,items:[{itemType:'relic',id:'STRIKE_DUMMY',price:100,stocked:true}]});assert.match(alert.text,/金币不足/);
});
test('辅助牌按体系合并，同体系核心与辅助一条，多体系牌分别提醒',()=>{
  const alerts=evaluateCardAlerts({character:'silent',cards:[{id:'PREDATOR'},{id:'EXPOSE'},{id:'PIERCING_WAIL'},{id:'ABRASIVE'}]});
  assert.equal(new Set(alerts.map(a=>a.systemId)).size,alerts.length);
  const defense=alerts.find(a=>a.systemId==='silent:dexterity-block');assert.match(defense.text,/尖啸/);assert.match(defense.text,/磨蚀/);assert.match(defense.text,/辅助/);
  assert.ok(alerts.find(a=>a.systemId==='silent:sly-discard').alerts.some(a=>a.offer.id==='ABRASIVE'));
  assert.match(alerts.find(a=>a.systemId==='silent:shiv').text,/暴露/);
  assert.match(alerts.find(a=>a.systemId==='silent:draw-tempo').text,/猎杀者/);
  assert.notEqual(defense.text.split('，')[0],alerts.find(a=>a.systemId==='silent:shiv').text.split('，')[0]);
  const mixed=evaluateCardAlerts({character:'ironclad',cards:[{id:'FEEL_NO_PAIN'},{id:'OFFERING'}]});
  const exhaust=mixed.find(a=>a.systemId==='ironclad:exhaust-engine');assert.match(exhaust.text,/核心/);assert.match(exhaust.text,/辅助/);
});
test('同体系商店卡牌遗物合并，预算不丢失，已播体系不吞另一体系',()=>{
  const shop=evaluateShopAlerts({character:'ironclad',deck:['POMMEL_STRIKE','STRIKE_IRONCLAD'],gold:150,items:[
    {itemType:'card',id:'HELLRAISER',stockKey:'card:0',price:80},{itemType:'relic',id:'STRIKE_DUMMY',stockKey:'relic:0',price:100}
  ]});assert.equal(shop.groups.length,1);assert.match(shop.groups[0].text,/地狱狂徒/);assert.match(shop.groups[0].text,/打击木偶/);assert.match(shop.groups[0].text,/不够同时/);
  const multi=evaluateCardAlerts({character:'silent',cards:[{id:'ABRASIVE'}],isUnseen:(systemId)=>systemId!=='silent:dexterity-block'});
  assert.equal(multi.some(a=>a.systemId==='silent:dexterity-block'),false);assert.ok(multi.some(a=>a.systemId==='silent:sly-discard'));
});
