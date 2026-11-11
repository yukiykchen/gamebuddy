'use strict';
const { profile, idOf, cards: catalog, evaluateBuildPolicy } = require('./card-guidance');
const relicsCatalog = new Map(require('../data/codex/relics.json').map(r => [r.id, r]));
const openings = {
  'auto-strike':'自动打击的补给到了', 'exhaust-engine':'消耗引擎有新组件', 'strength-scaling':'力量路线可以添火了',
  'block-barricade':'格挡转伤有新拼图', vulnerable:'易伤路线有新配合', 'self-damage':'自伤收益有新搭档',
  poison:'毒素路线有新配方', 'sly-discard':'弃牌周转有新帮手', shiv:'小刀路线有新装备',
  'dexterity-block':'敏捷防线有新补强', 'draw-tempo':'过牌节奏有新接力', 'frost-focus-orbs':'冰霜防线有新组件',
  'claw-zero-cost':'零费爪击有新配合', 'lightning-power-engine':'闪电引擎有新零件', 'dark-orb-evoke-burst':'黑暗球爆发有新拼图',
  'status-engine':'状态牌引擎有新组件', 'star-engine':'辉星路线有新星光', 'alignment-loop':'星位循环有新接点',
  'sovereign-blade-forge':'君王之剑有新铸材', 'void-form':'虚空形态有新重手', 'card-creation':'造牌路线有新素材',
  'soul-cycle':'灵魂周转有新接力', 'doom-execute':'灾厄路线有新铺垫', osty:'奥斯提有新搭档',
  ethereal:'虚无路线有新配合', 'reaper-big-hit':'死神重击有新助力'
};
const rank = level => level === 'must_take' ? 0 : level === 'focus' ? 1 : 2;
const slotKey = alert => alert.offer.stockKey || `${alert.offer.kind}:${alert.offer.id}`;
function cardAlerts(character, deck, relics, candidate) {
  if (!candidate || candidate.hidden || candidate.preview || candidate.revealed === false || candidate.claimed || candidate.random || candidate.stocked === false) return [];
  const id=idOf(candidate), card=catalog.get(id);
  if (!card) return [];
  const policy=evaluateBuildPolicy(character,deck,relics,candidate);
  if (policy.blocked) return [];
  const owned=deck.some(c=>idOf(c)===id);
  if(owned && !['POMMEL_STRIKE','PERFECTED_STRIKE'].includes(id)) return [];
  return profile(character,deck,relics).filter(p=>[...p.build.core,...p.build.support].some(c=>c.id===id)).map(p=>({
    systemId:p.build.id, systemName:p.build.name,
    level:id==='HELLRAISER' && deck.some(c=>catalog.get(idOf(c))?.tags?.includes('Strike'))?'must_take':p.active?'focus':'direction',
    component:p.build.core.some(c=>c.id===id)?'核心':'辅助', name:card.name,
    offer:{...candidate,id,name:card.name,kind:'card'},objectKey:`card:${id}:${Boolean(candidate.upgraded)}`,
    risk:policy.conflicts.map(c=>`${c.systemName}：${c.reason}`).join('；')
  }));
}
function groupAlerts(alerts,{gold=null,shop=false}={}) {
  const systems=new Map();
  for(const alert of alerts){
    if(!systems.has(alert.systemId))systems.set(alert.systemId,[]);
    const rows=systems.get(alert.systemId);
    if(!rows.some(a=>(shop?slotKey(a):a.objectKey)===(shop?slotKey(alert):alert.objectKey)))rows.push(alert);
  }
  return [...systems].map(([systemId,rows])=>{
    rows.sort((a,b)=>rank(a.level)-rank(b.level));
    const grouped=['核心','辅助','遗物'].map(type=>{
      const names=[...new Set(rows.filter(a=>a.component===type).map(a=>`「${a.name}」`))];
      return names.length?`${type}：${names.join('、')}`:'';
    }).filter(Boolean).join('；');
    const must=rows.find(a=>a.level==='must_take' && (!shop || a.offer.price!=null&&a.offer.price<=gold));
    let text=`${openings[systemId.split(':')[1]] || rows[0].systemName+'有新组件'}，${grouped}。`;
    if(must)text+=`自动打击启动牌「${must.name}」出现，务必拿下！`;
    const risks=[...new Set(rows.map(a=>a.risk).filter(Boolean))];
    if(risks.length)text+=`注意：${risks.join('；')}`;
    if(shop){
      const unknown=rows.filter(a=>a.offer.price==null).map(a=>`「${a.name}」`);
      const poor=rows.filter(a=>a.offer.price!=null&&a.offer.price>gold).map(a=>`「${a.name}」`);
      if(unknown.length)text+=`${unknown.join('、')}价格尚未确认。`;
      if(poor.length)text+=`${poor.join('、')}目前金币不足。`;
      if(rows.length>1&&rows.every(a=>a.offer.price!=null&&a.offer.price<=gold)&&rows.reduce((n,a)=>n+a.offer.price,0)>gold)text+='这些组件各自买得起，但金币不够同时拿下，需要取舍。';
    }
    return {systemId,systemName:rows[0].systemName,level:rows[0].level,alerts:rows,text,
      objectKeys:rows.map(a=>shop?slotKey(a):a.objectKey),objectKey:systemId};
  }).sort((a,b)=>rank(a.level)-rank(b.level));
}
function evaluateCardAlerts({character,deck=[],relics=[],cards=[],isUnseen=()=>true}) {
  return groupAlerts(cards.flatMap(c=>cardAlerts(character,deck,relics,c)).filter(a=>isUnseen(a.systemId,a.objectKey)));
}
function evaluateShopAlerts({character,deck=[],relics=[],gold=0,items=[],isUnseen=()=>true}) {
  const profiles=profile(character,deck,relics),alerts=[];
  for(const item of items){
    if(!item||item.stocked===false||item.hidden||item.preview)continue;
    if(item.itemType==='card')alerts.push(...cardAlerts(character,deck,relics,{...item.card,...item,upgraded:item.card?.upgraded||item.upgraded}));
    if(item.itemType!=='relic'||relics.some(r=>(r.id||r)===item.id))continue;
    if(evaluateBuildPolicy(character,deck,relics,item,{kind:'relic'}).conflicts.length)continue;
    const relic=relicsCatalog.get(item.id);if(!relic)continue;
    for(const p of profiles.filter(p=>p.active&&p.build.relics.some(r=>r.id===item.id)
      ||p.build.id==='ironclad:auto-strike'&&item.id==='STRIKE_DUMMY'&&p.functions.some(g=>g.id==='supply'&&g.count>0))){
      alerts.push({systemId:p.build.id,systemName:p.build.name,level:'focus',component:'遗物',name:relic.name,
        offer:{...item,name:relic.name,kind:'relic'},objectKey:`relic:${item.id}`});
    }
  }
  const groups=groupAlerts(alerts.filter(a=>isUnseen(a.systemId,slotKey(a))),{gold,shop:true});
  return groups.length?{groups,alerts:groups.flatMap(g=>g.alerts),objectKeys:[...new Set(groups.flatMap(g=>g.objectKeys))],text:groups.map(g=>g.text).join('')}:null;
}
module.exports={evaluateCardAlerts,evaluateShopAlerts};
