'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {strategies}=require('../knowledge/build-strategies');
const {effectsOf}=require('../knowledge/build-strategy-policy');
const {builds,cards,evaluateBuildPolicy,cardGuidance,buildStrategyContext}=require('../knowledge/card-guidance');
const {CardGuidanceService,applyAiChoices}=require('../knowledge/card-guidance-service');
const {recommendCardReward}=require('../tasks/card-reward');
const {recommendShop,removeTarget}=require('../tasks/shop');
const {evaluateCardAlerts,evaluateShopAlerts}=require('../knowledge/card-guidance-alerts');
const {createOpenAiClient}=require('../llm/openai');
const {validateRecommendation}=require('../recommendation');
const card=value=>({...cards.get(typeof value==='string'?value:value.id),...(typeof value==='string'?{}:value),descriptionSource:'catalog',energyCostSource:'catalog',starCostSource:'catalog'});
const codex={loadDraftContext:async(state,reward)=>({source:'fixture',cards:reward.cards.map(card),deckCards:state.player.cards.map(card),relics:state.player.relics,potions:[],threats:{}})};
const auto=['HELLRAISER','POMMEL_STRIKE','PERFECTED_STRIKE','STRIKE_IRONCLAD','DEFEND_IRONCLAD'];
const state=(character='ironclad',deck=auto)=>({run:{character,act:2,floor:22},player:{hp:70,maxHp:80,maxEnergy:3,gold:250,cards:deck.map(card),relics:[],potions:[]},map:{nodes:[],routes:[]}});
const reward=(ids,canSkip=true,character='ironclad',deck=auto)=>({state:{...state(character,deck),reward:{cards:ids.map(card),canSkip}}});
const modelResult=m=>({cards:m.cards.map(c=>({key:c.key,systems:c.systems.map(s=>({systemId:s.systemId,diagnosisId:s.options[0].id,shortfall:s.options[0].shortfall,advice:s.options[0].advice}))}))});

test('全部26体系都有完整运转链、补强优先级、机制依赖、误区与例外',()=>{
  assert.equal(Object.keys(strategies).length,26);
  for(const b of builds){const s=strategies[b.id.split(':')[1]];for(const field of ['goal','startup','cycle','finish'])assert.ok(s[field]?.length>8,b.id+field);for(const field of ['priorities','dependencies','anchors','pitfalls','exceptions'])assert.ok(s[field]?.length,b.id+field);}
});
test('原始力量会改变打击组件而单张巨石不会，不根据网站名单判断冲突',()=>{
  const p=evaluateBuildPolicy('ironclad',auto,[],{id:'PRIMAL_FORCE'});assert.equal(p.blocked,true);assert.match(p.conflicts[0].reason,/巨石/);assert.match(p.conflicts[0].reason,/当前手牌/);
  assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id:'GIANT_ROCK'}).disposition,'neutral');
  assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id:'SHRUG_IT_OFF'}).disposition,'neutral');
  assert.equal(evaluateBuildPolicy('ironclad',['STRIKE_IRONCLAD','DEFEND_IRONCLAD'],[],{id:'PRIMAL_FORCE'}).blocked,false);
});
test('判定读取实际牌面，修改或未知效果不按卡名套用破坏结论',()=>{
  assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id:'PRIMAL_FORCE',description:'造成16点伤害。',descriptionSource:'runtime'}).blocked,false);
  assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id:'NEW_MOD_CARD',description:'将手牌中的所有攻击牌变化为巨石。',descriptionSource:'runtime'}).blocked,true);
  assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id:'NEW_MOD_CARD'}).known,false);
  assert.equal(effectsOf({id:'PRIMAL_FORCE',upgraded:true}).effects[0].replacement,'巨石+');
  assert.equal(effectsOf({id:'HOLOGRAM',upgraded:true}).facts.exhaust,false);
  assert.equal(effectsOf({id:'OFFERING',upgraded:true}).facts.exhaust,true);
  assert.equal(effectsOf({id:'SOUL',upgraded:true}).facts.exhaust,true);
  assert.equal(effectsOf({id:'BULLET_TIME',upgraded:true}).facts.cost,2);
  const combined=cardGuidance('ironclad',auto,[],{id:'MOD_COMBINED',description:'将手牌中的所有攻击牌变化为巨石。你在本回合不能再抽牌。',descriptionSource:'runtime'});
  const choices=combined.systems.find(s=>s.systemId==='ironclad:auto-strike').options;
  assert.ok(choices.every(o=>o.id==='transform_attacks'),'Cannot hide structural conflict behind a lighter draw-order warning');
});
test('攻击身份、力量多段、格挡转伤、君王之剑与奥斯提均检查改写对象',()=>{
  const cases=[['ironclad',['INFLAME','TWIN_STRIKE']],['ironclad',['BODY_SLAM','SHRUG_IT_OFF']],['defect',['CLAW','ALL_FOR_ONE']],['silent',['ACCURACY','BLADE_DANCE']],['regent',['SUMMON_FORTH','FURNACE']],['necrobinder',['CALCIFY','FETCH']]];
  for(const [ch,deck]of cases)assert.equal(evaluateBuildPolicy(ch,deck,[],{id:'PRIMAL_FORCE'}).blocked,true,ch+deck.join(','));
  assert.equal(evaluateBuildPolicy('regent',['SUMMON_FORTH','FURNACE'],[],{id:'GUARDS'}).blocked,false,'Selective transformation can preserve the blade');
});
test('锁抽牌是有牌序例外的条件冲突，手牌消耗保留终结或防御用途',()=>{
  for(const id of ['BATTLE_TRANCE','BULLET_TIME']){const p=evaluateBuildPolicy('ironclad',auto,[],{id});assert.equal(p.blocked,false);assert.equal(p.disposition,'caution');assert.match(p.conflicts[0].advice,/结束后/);}
  for(const id of ['FIEND_FIRE','STOKE','SECOND_WIND'])assert.equal(evaluateBuildPolicy('ironclad',auto,[],{id}).blocked,false);
});
test('出牌上限遗物约束五职业循环，但不无差别排斥低频辉星路线',()=>{
  const cases=[['ironclad',auto],['silent',['REFLEX','ACROBATICS']],['defect',['CLAW','ALL_FOR_ONE']],['regent',['ALIGNMENT','GLOW']],['necrobinder',['HAUNT','GRAVE_WARDEN']]];
  for(const[ch,deck]of cases){const p=evaluateBuildPolicy(ch,deck,[],{id:'VELVET_CHOKER'},{kind:'relic'});assert.equal(p.blocked,true,ch);assert.match(p.conflicts[0].reason,/6张/);}
  assert.equal(evaluateBuildPolicy('regent',['GENESIS','COMET'],[],{id:'VELVET_CHOKER'},{kind:'relic'}).blocked,false);
});
test('集中、敏捷代价基于机制；爪击不依赖集中时不误报，紧急生存明示取舍',()=>{
  assert.equal(evaluateBuildPolicy('defect',['GLACIER','DEFRAGMENT'],[],{id:'HYPERBEAM'}).blocked,true);
  assert.equal(evaluateBuildPolicy('defect',['CLAW','ALL_FOR_ONE'],[],{id:'HYPERBEAM'}).blocked,false);
  const emergency=cardGuidance('defect',['GLACIER','DEFRAGMENT'],[],{id:'HYPERBEAM'},{hp:10,maxHp:80});assert.equal(emergency.policy.blocked,false);assert.equal(emergency.policy.exception,'survival_tradeoff');assert.match(emergency.systems.find(s=>s.conflict).advice,/生命吃紧/);
  assert.equal(evaluateBuildPolicy('defect',['GLACIER','DEFRAGMENT'],[],{id:'BIASED_COGNITION'}).disposition,'caution');
  assert.equal(evaluateBuildPolicy('silent',['FOOTWORK','BACKFLIP'],[],{id:'WRAITH_FORM'}).disposition,'caution');
});
test('腐化会耗尽星位循环组件，另一已建立消耗路线允许明确转向取舍',()=>{
  const p=evaluateBuildPolicy('regent',['ALIGNMENT','GLOW'],[],{id:'CORRUPTION'});assert.equal(p.blocked,true);assert.match(p.conflicts[0].reason,/无法.*反复/);
  const mixed=evaluateBuildPolicy('regent',['ALIGNMENT','GLOW','FEEL_NO_PAIN','TRUE_GRIT'],[],{id:'CORRUPTION'});
  assert.equal(mixed.blocked,false);assert.equal(mixed.exception,'mixed_route_tradeoff');
  assert.equal(evaluateBuildPolicy('ironclad',['FEEL_NO_PAIN','TRUE_GRIT'],[],{id:'CORRUPTION'}).blocked,false);
});
test('所有AI入口都有完整策略与已知牌面，悬停不再只传ID和模板',async()=>{
  let payload;
  const service=new CardGuidanceService({llm:{enabled:true,completeBuildGuidance:async p=>{payload=p;return modelResult({cards:p.cards});}}});
  service.update({runId:'x',character:'ironclad',deck:auto,relics:[],candidates:[{id:'PRIMAL_FORCE'}],context:'reward',signature:'x'});
  await new Promise(r=>setImmediate(r));assert.ok(payload.strategyContext.systems.length===6);assert.match(payload.deck[0].description,/打击/);assert.ok(payload.strategyContext.systems.every(s=>s.cycle&&s.priorities));assert.equal(service.current.cards[0].policy.blocked,true);
  const altered=modelResult(service.current);altered.cards[0].systems[0].shortfall='完全适合自动打击';assert.equal(applyAiChoices(service.current,altered),null);
});
test('有无AI都不强推原始力量，越界模型选择回退，不能跳过仍说明风险',async()=>{
  const observation=reward(['PRIMAL_FORCE']);
  const rules=await recommendCardReward(observation,{codex});assert.equal(rules.primary.action,'SKIP');
  let payload;const bad=await recommendCardReward(observation,{codex,llm:{enabled:true,completeCardReward:async p=>{payload=p;return{index:p.candidates.findIndex(c=>c.id==='PRIMAL_FORCE'),reason:'完全适合'};}}});
  assert.equal(bad.primary.action,'SKIP');assert.equal(bad.source,'rules');assert.ok(payload.strategyContext.systems.every(s=>s.startup&&s.finish));assert.ok(payload.candidates.find(c=>c.id==='PRIMAL_FORCE').buildPolicy.blocked);
  const forced=await recommendCardReward(reward(['PRIMAL_FORCE'],false),{codex});assert.equal(forced.primary.action,'TAKE_CARD');assert.match(forced.reason,/不能跳过/);assert.equal(forced.strategyDecision.forcedRiskChoice,true);
});
test('选牌模型失败继续规则，有条件选择不能用无冲突措辞盖掉代价',async()=>{
  const failed=await recommendCardReward(reward(['SHRUG_IT_OFF']),{codex,llm:{enabled:true,completeCardReward:async()=>{throw Error('offline');}}});assert.equal(failed.source,'rules');assert.equal(validateRecommendation(failed).ok,true);
  const caution=await recommendCardReward(reward(['BATTLE_TRANCE']),{codex,llm:{enabled:true,completeCardReward:async p=>({index:p.candidates.findIndex(c=>c.id==='BATTLE_TRANCE'),reason:'完全没有冲突'})}});
  assert.match(caution.reason,/不能继续抽牌/);assert.doesNotMatch(caution.reason,/完全没有冲突/);
});
test('商店整份清单过滤结构冲突卡和遗物，保留库存解释与其他购买',async()=>{
  const s=state();s.shop={gold:250,items:[{index:0,id:'PRIMAL_FORCE',name:'原始力量',itemType:'card',price:10,stocked:true,card:card('PRIMAL_FORCE')},{index:1,id:'VELVET_CHOKER',name:'天鹅绒颈圈',itemType:'relic',price:10,stocked:true},{index:2,id:'SHRUG_IT_OFF',name:'耸肩无视',itemType:'card',price:50,stocked:true,card:card('SHRUG_IT_OFF')}]};
  let payload;const rec=await recommendShop({state:s},{codex,llm:{enabled:true,completeShop:async p=>{payload=p;return{index:9999,reason:'越界'};}}});
  assert.equal(validateRecommendation(rec).ok,true);assert.ok(rec.primary.plan.every(i=>!['PRIMAL_FORCE','VELVET_CHOKER'].includes(i.id)));assert.ok(rec.inventory.find(i=>i.id==='PRIMAL_FORCE').analysis.buildPolicy.blocked);assert.ok(payload.strategyContext.systems.every(s=>s.pitfalls.length));assert.ok(payload.candidates.every(p=>p.items.every(i=>!i.analysis?.buildPolicy?.blocked)));
});
test('删牌保护打击数量、专属核心和重复爪击，不再按打击后缀误删',()=>{
  const target=removeTarget(auto.map(card),{character:'ironclad'});assert.equal(target.id,'DEFEND_IRONCLAD');
  assert.equal(removeTarget(['HELLRAISER','POMMEL_STRIKE','PERFECTED_STRIKE'].map(card),{character:'ironclad'}),null);
  assert.notEqual(removeTarget(['CLAW','CLAW','DEFEND_DEFECT'].map(card),{character:'defect'}).id,'CLAW');
  assert.equal(removeTarget(['POMMEL_STRIKE','DEFEND_IRONCLAD'].map(card),{character:'ironclad'}).id,'DEFEND_IRONCLAD');
});
test('关键通知不强推已确认机制冲突的核心或遗物',()=>{
  assert.deepEqual(evaluateCardAlerts({character:'ironclad',deck:auto,cards:[card('PRIMAL_FORCE')]}),[]);
  assert.equal(evaluateShopAlerts({character:'ironclad',deck:auto,relics:[],gold:500,items:[{id:'VELVET_CHOKER',itemType:'relic',price:50,stocked:true}]}),null);
});
test('选牌和商店客户端系统提示实际要求策略与合法下标',async()=>{
  const requests=[];const llm=createOpenAiClient({enabled:true,apiKey:'fixture',baseURL:'https://fixture.invalid/v1',model:'fixture',wireApi:'chat'},{fetchImpl:async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({choices:[{message:{content:'{"index":0,"reason":"fixture"}'}}]})};},onLog:()=>{}});
  await llm.completeCardReward({candidates:[{index:0}],allowedIndexes:[0]});await llm.completeShop({candidates:[{index:0}],allowedIndexes:[0]});
  for(const r of requests){assert.match(r.messages[0].content,/strategyContext/);assert.match(r.messages[0].content,/allowedIndexes/);assert.match(r.messages[0].content,/巨石/);}
});
