'use strict';
const cardData = require('../data/codex/cards.json');
const relicData = require('../data/codex/relics.json');
const { normalizeKey, inferUpgraded, stripMarkup } = require('./spire-codex');
const { strategies, STRATEGY_VERSION } = require('./build-strategies');
const cards = new Map(cardData.map(c => [c.id, c]));
const cardIds = new Map(cardData.flatMap(c => [[normalizeKey(c.id), c.id], [normalizeKey(c.name), c.id]]));
const relicIds = new Map(relicData.flatMap(c => [[normalizeKey(c.id), c.id], [normalizeKey(c.name), c.id]]));
const relics = new Map(relicData.map(r => [r.id,r]));
const idOf = c => cardIds.get(normalizeKey(typeof c === 'string' ? c : c?.id || c?.name)) || '';
const slugOf = p => p.build.id.split(':')[1];

function itemFacts(input, kind = 'card') {
  const raw = typeof input === 'string' ? { id: input } : input || {};
  const id = (kind === 'relic' ? relicIds : cardIds).get(normalizeKey(raw.id || raw.name)) || raw.id || '';
  const catalog = (kind === 'relic' ? relics : cards).get(id);
  const upgraded = inferUpgraded(raw) || inferUpgraded(raw.id);
  const runtime = typeof raw.description === 'string' && raw.description.trim() && raw.descriptionSource !== 'unavailable' ? raw.description : '';
  const text = runtime || (upgraded ? catalog?.upgrade_description : '') || catalog?.description || '';
  return { id, name: catalog?.name || raw.name || id, kind, upgraded, description: stripMarkup(text), rawDescription: text,
    type: raw.type_key || catalog?.type_key || raw.type || '', damage: catalog?.damage, block: catalog?.block,
    cost: raw.energyCost ?? raw.cost ?? (upgraded && Number.isFinite(catalog?.upgrade?.cost) ? catalog.upgrade.cost : catalog?.cost), tags: catalog?.tags || [],
    exhaust: Array.isArray(raw.keywords) ? raw.keywords.some(k=>['消耗','Exhaust'].includes(k))
      : /消耗[。\s]*$/.test(stripMarkup(text)) || Boolean(catalog?.keywords?.includes('消耗') && !(upgraded && catalog?.upgrade?.remove_exhaust)),
    known: Boolean(text) && (id !== 'MAD_SCIENCE' || Boolean(runtime)), source: runtime ? raw.descriptionSource === 'catalog' ? 'catalog' : 'runtime' : catalog ? 'catalog' : 'unknown' };
}

function effectsOf(input, kind = 'card') {
  const f = itemFacts(input,kind), t = f.description;
  if (!f.known) return { facts: f, effects: [] };
  const effects = [];
  if (/将.*手牌.*(?:所有|全部)攻击牌.*(?:变化|变为)/.test(t)) effects.push({ type:'transform_attacks', scope:'current_hand', replacement:/(?:变化为|变为)([^。]+)/.exec(t)?.[1] || '其他牌' });
  if (/回合开始.*变化.*手牌.*张牌/.test(t)) effects.push({ type:'random_transform', scope:'current_hand' });
  if (/不能[^。]*抽/.test(t)) effects.push({ type:'draw_lock', scope:'current_turn' });
  const cap = /不能打出超过(\d+)张牌/.exec(t);
  if (cap) effects.push({ type:'play_cap', limit:Number(cap[1]), scope:kind==='relic'||/每个回合/.test(t)?'each_turn':'current_turn' });
  const focus = /失去(\d+)点集中/.exec(t);
  if (focus) effects.push({ type:'focus_loss', amount:Number(focus[1]), recurring:/回合开始/.test(t), scope:/回合开始/.test(t)?'each_turn':'combat' });
  const dexterity=/失去(\d+)点敏捷/.exec(t);
  if(dexterity)effects.push({type:'dexterity_loss',amount:Number(dexterity[1]),scope:/回合开始/.test(t)?'each_turn':'combat'});
  if(/每当你打出.*技能牌.*消耗/.test(t))effects.push({type:'skills_exhaust',scope:'combat'});
  if (/消耗.*(?:所有|全部)手牌/.test(t)) effects.push({ type:'exhaust_hand', target:'all', scope:'combat' });
  else if (/消耗.*手牌.*(?:所有|全部)非攻击牌/.test(t)) effects.push({ type:'exhaust_hand', target:'non_attack', scope:'combat' });
  if (/不能[^。]*获得.*(?:能量|energy)/.test(f.rawDescription)) effects.push({ type:'energy_lock', scope:'current_turn' });
  if (kind === 'relic' && /变化所有.*打击.*防御/.test(t)) effects.push({type:'transform_basics',scope:'run'});
  return { facts:f, effects };
}

function routeEvidence(p, deck) {
  const strategy = strategies[slugOf(p)];
  const owned = new Set(deck.map(idOf));
  const anchors = (strategy?.anchors || []).filter(id=>owned.has(id));
  const connected = p.functions.filter(g=>g.present).map(g=>g.id);
  // 明确专属的引擎/数量收益可以表明意图；一般攻击或通用过牌不能锁定路线。
  const explicit = ['HELLRAISER','PERFECTED_STRIKE','CLAW','VOID_FORM','REAPER_FORM','HAUNT','FURNACE','ACCURACY','PAGESTORM','STORM','CORRUPTION'];
  return { level: anchors.length && (connected.length >= 2 || anchors.some(id=>explicit.includes(id))) ? 'established' : p.active ? 'tentative' : 'none',
    anchors:anchors.map(id=>({id,name:cards.get(id)?.name})), connectedFunctions:connected };
}

function strategyContext(profiles, deck, relicList = []) {
  return { version:STRATEGY_VERSION, principles:[
    '不使用流派分数或固定达标张数；组件存在不代表足够。',
    '网站名单是参考；根据真实牌面、触发、对象和当前路线证据判断配合或破坏。',
    '结构冲突与可用顺序解决的条件冲突分开；不同体系不天然互斥。',
    '只给已确认的当前状态，不虚构无限、击杀、生存或未来抽牌。'
  ], systems:profiles.map(p=>({ systemId:p.build.id, name:p.build.name, source:p.build.source, sourceKind:p.build.sourceKind,
    ...strategies[slugOf(p)], evidence:routeEvidence(p,deck),
    functions:p.functions.map(g=>({id:g.id,label:g.label,count:g.count,present:g.present,optional:g.optional,relicProviders:g.relicProviders})),
    knownCore:p.build.core.map(c=>({id:c.id,name:c.name})), knownSupport:p.build.support.map(c=>({id:c.id,name:c.name})) })),
    deck:deck.map(c=>itemFacts(c)), relics:relicList.map(r=>itemFacts(r,'relic')) };
}

function affectedByTransform(p, deck) {
  const slug=slugOf(p), owned=deck.map(c=>itemFacts(c));
  if(slug==='auto-strike')return owned.filter(c=>c.tags.includes('Strike'));
  if(slug==='claw-zero-cost')return owned.filter(c=>c.id==='CLAW'||c.type==='Attack'&&c.cost===0);
  if(slug==='strength-scaling')return owned.filter(c=>p.functions.find(g=>g.id==='output')?.ids.includes(c.id));
  if(slug==='block-barricade')return owned.filter(c=>c.id==='BODY_SLAM');
  if(slug==='reaper-big-hit')return owned.filter(c=>c.id==='THE_SCYTHE');
  if(slug==='osty')return owned.filter(c=>p.functions.find(g=>g.id==='output')?.ids.includes(c.id));
  if(slug==='ethereal')return owned.filter(c=>/虚无/.test(c.description)&&c.type==='Attack');
  if(slug==='shiv')return [{id:'SHIV',name:'小刀（生成后在手牌中时）'}];
  if(slug==='sovereign-blade-forge')return [{id:'SOVEREIGN_BLADE',name:'君王之剑（在手牌中时）'}];
  return [];
}

function assessCandidate(profiles, deck, relicList, candidate, { kind='card', hp=null, maxHp=null } = {}) {
  const {facts,effects}=effectsOf(candidate,kind), conflicts=[];
  for(const p of profiles){
    const evidence=routeEvidence(p,deck), strategy=strategies[slugOf(p)];
    if(evidence.level==='none'||!strategy)continue;
    const depends=new Set(strategy.dependencies), slug=slugOf(p);
    const add=(ruleId,severity,reason,advice,affected=[],exception=null)=>{
      conflicts.push({systemId:p.build.id,systemName:p.build.name,ruleId,severity,evidence,reason,advice,
        affected:affected.map(c=>({id:c.id,name:c.name})),effectSource:facts.source,scope:effects.find(e=>ruleId.startsWith(e.type))?.scope||'conditional',exception});
    };
    for(const effect of effects){
      if(effect.type==='transform_attacks'){
        const affected=affectedByTransform(p,deck);
        if(affected.length){
          const names=[...new Set(affected.map(c=>c.name))].slice(0,2).join('、');
          add('transform_attacks', 'structural', `手牌攻击变为${effect.replacement}会失去${names}等牌的原有身份与功能，破坏${p.build.name}配合；仅限当前手牌。`,
            `不推荐为${p.build.name}拿取；若已持有，应先打出关键攻击，避免将其变化。`,affected,
            '不是永久改变牌组；地狱狂徒生效后抽到的打击会先自动打出，实际风险取决于当时手牌。');
        }
      }
      if(effect.type==='random_transform'&&(depends.has('attack_identity')||depends.has('skill_identity')||depends.has('repeatable_supply'))){
        add('random_transform','structural','每回合随机变化手牌可能改写关键循环或成长牌，无法稳定保留原组件。',`不推荐用于依赖特定组件反复运转的${p.build.name}。`);
      }
      if(effect.type==='draw_lock'&&depends.has('draw')){
        add('draw_lock','conditional','与抽牌循环有冲突：本回合不能继续抽牌。','谨慎选择；需要使用时放在抽牌循环结束后。',[], '先完成本回合抽牌，再作为终结使用；不是永久禁止抽牌。');
      }
      if(effect.type==='play_cap'&&(depends.has('many_plays')||slug==='dexterity-block'&&deck.some(c=>idOf(c)==='AFTERIMAGE'))){
        add('play_cap','structural',`每回合最多打出${effect.limit}张牌，会截断${p.build.name}依赖的多次出牌收益。`, `不推荐用于持续循环；优先保留出牌次数空间。`);
      }
      if(effect.type==='focus_loss'&&depends.has('focus')){
        add('focus_loss',effect.recurring?'conditional':'structural', `${effect.recurring?'后续每回合':'使用后'}失去${effect.amount}点集中，会削弱后续充能球效果。`,
          effect.recurring?'权衡短期集中收益与后续衰减，避免无条件视为长期强化。':'不推荐作为常规补强；仅在明确需要即时群伤等场合权衡代价。',[],
          '不抹掉黑暗球已经积累的伤害；不依赖集中的零费攻击路线不自动冲突。');
      }
      if(effect.type==='dexterity_loss'&&depends.has('dexterity'))add('dexterity_loss','conditional',
        `后续失去${effect.amount}点敏捷，会降低长期格挡效率。`,'可用短期无实体渡过压力，但需接受后续敏捷下降。',[], '短期减伤收益与长期敏捷代价同时存在，不是完全不能用。');
      if(effect.type==='skills_exhaust'&&(depends.has('skill_identity')||depends.has('repeatable_supply')&&depends.has('draw'))){
        const componentIds=new Set(p.functions.flatMap(g=>g.ids));
        const affected=deck.map(c=>itemFacts(c)).filter(c=>c.type==='Skill'&&componentIds.has(c.id)
          && !c.exhaust);
        if(affected.length)add('skills_exhaust',slug==='alignment-loop'?'structural':'conditional',
          `技能打出后会被消耗，${[...new Set(affected.map(c=>c.name))].slice(0,2).join('、')}无法按原方式反复抽回。`,
          slug==='alignment-loop'?'不推荐用于辉光与星位序列循环；若转向消耗体系，需明确放弃原循环。':'权衡本回合免费技能与后续供给损失，先确认替代循环或收尾手段。',affected);
      }
      if(effect.type==='exhaust_hand'){
        const affected=deck.map(c=>itemFacts(c)).filter(c=>{
          if(effect.target==='non_attack'&&c.type==='Attack')return false;
          const ids=[...p.build.core,...p.build.support].map(c=>c.id);
          return ids.includes(c.id)&&!['Status','Curse'].includes(c.type);
        });
        if(affected.length&&slug!=='exhaust-engine')add('exhaust_hand','conditional',`会消耗当前手牌中的关键组件，减少${p.build.name}后续可用供给。`,
          '先打出需要保留的能力与组件，再考虑作为防御或终结使用。',affected,
          '有消耗收益、其他供给或明确终结用途时可用；不是消耗整副牌。');
      }
      if(effect.type==='energy_lock'&&['alignment-loop','claw-zero-cost','sly-discard','draw-tempo'].includes(slug))add('energy_lock','conditional',
        '本回合后续无法继续获得普通能量，可能截断依赖回能的周转。','先完成必要回能，再考虑使用；不能把初次回能与后续限制混为一谈。');
      if(effect.type==='transform_basics'&&slug==='auto-strike'&&deck.some(c=>idOf(c)==='PERFECTED_STRIKE')&&deck.some(c=>idOf(c)==='STRIKE_IRONCLAD'))add('transform_basics','conditional',
        '会变化初始打击，减少已确认的打击数量及完美打击增伤；随机产物未知。','权衡打击数量损失与移除初始防御的收益，不能直接承诺提升。');
    }
  }
  const immediateSurvival = Number.isFinite(hp)&&Number.isFinite(maxHp)&&maxHp>0&&hp/maxHp<=.35
    && (facts.block>0 || facts.damage>0&&/所有敌人/.test(facts.description));
  const establishedStructural=conflicts.filter(c=>c.severity==='structural'&&c.evidence.level==='established');
  // 另一条已建立路线真正使用该牌时，允许明确的混合路线取舍，不默认所有方向互斥。
  const supportsOtherRoute=profiles.some(p=>routeEvidence(p,deck).level==='established'&&(p.build.core.some(c=>c.id===facts.id)||p.functions.some(g=>!g.optional&&g.ids.includes(facts.id)))
    &&!conflicts.some(c=>c.systemId===p.build.id&&c.severity==='structural'));
  const exception=establishedStructural.length?(immediateSurvival?'survival_tradeoff':supportsOtherRoute?'mixed_route_tradeoff':null):null;
  const blocked=establishedStructural.length>0&&!exception;
  return { version:STRATEGY_VERSION, itemId:facts.id, kind, disposition:blocked?'avoid':conflicts.length?'caution':'neutral', blocked,
    conflicts, exception, known:facts.known,
    summary:conflicts.length?`${blocked?'不推荐：':'谨慎选择：'}${conflicts[0].systemName}，${conflicts[0].reason}`:'未发现已确认的机制冲突；不等于强度足够。' };
}

function removalAssessment(profiles, deck, candidate) {
  const id=idOf(candidate), c=cards.get(id), protectedBy=[];
  for(const p of profiles){
    if(routeEvidence(p,deck).level!=='established')continue;
    const slug=slugOf(p), strategy=strategies[slug];
    if(slug==='auto-strike'&&c?.tags?.includes('Strike'))protectedBy.push({systemId:p.build.id,reason:'删除打击会减少自动攻击供给及完美打击数量收益'});
    else if(slug==='claw-zero-cost'&&id==='CLAW')protectedBy.push({systemId:p.build.id,reason:'爪击需要保留并反复打出来成长'});
    else if(strategy.anchors.includes(id))protectedBy.push({systemId:p.build.id,reason:`这是${p.build.name}的关键机制牌`});
    else if(p.functions.some(g=>!g.optional&&g.count===1&&g.ids.includes(id)))protectedBy.push({systemId:p.build.id,reason:`这是${p.build.name}该功能唯一已确认的卡牌来源`});
  }
  return {protected:protectedBy.length>0,protectedBy};
}
module.exports={ itemFacts,effectsOf,routeEvidence,strategyContext,assessCandidate,removalAssessment };
