'use strict';
const { createHash } = require('node:crypto');
const catalog = require('../data/codex/cards.json');
const relicCatalog = require('../data/codex/relics.json');
const source = require('./build-guides.json');
const { groups } = require('./build-mechanics');
const { normalizeKey, inferUpgraded, stripMarkup } = require('./spire-codex');
const strategyPolicy = require('./build-strategy-policy');
const { STRATEGY_VERSION } = require('./build-strategies');
const cards = new Map(catalog.map(card => [card.id, card]));
const index = new Map(catalog.flatMap(card => [[normalizeKey(card.id), card.id], [normalizeKey(card.name), card.id]]));
const relicIndex = new Map(relicCatalog.flatMap(r => [[normalizeKey(r.id), r.id], [normalizeKey(r.name), r.id]]));
const idOf = value => {
  const raw = typeof value === 'string' ? value : value?.id || value?.cardId || value?.name;
  return index.get(normalizeKey(raw)) || (/^[A-Z][A-Z0-9_-]*\+?$/i.test(raw || '') ? raw.replace(/\+$/, '').toUpperCase() : '');
};
const copyOf = value => ({ id: idOf(value), upgraded: inferUpgraded(value) || inferUpgraded(value?.id) });
const keyOf = value => `${idOf(value)}:${copyOf(value).upgraded ? '1' : '0'}`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const supplement = (slug, name, ids) => ({ id: `ironclad:${slug}`, character: 'ironclad', name, sourceKind: 'mechanic',
  source: 'https://spire-codex.com/zhs/cards/hellraiser',
  core: ids.map(id => ({ id, name: cards.get(id)?.name, resolved: true })), support: [], relics: [] });
const builds = [...source.builds, supplement('auto-strike', '自动打击', ['HELLRAISER', 'POMMEL_STRIKE', 'PERFECTED_STRIKE', 'TWIN_STRIKE', 'SETUP_STRIKE', 'ASHEN_STRIKE', 'STRIKE_IRONCLAD'])];
const slugOf = build => build.id.split(':')[1];
const description = copy => stripMarkup(copy?.description || (copyOf(copy).upgraded ? cards.get(idOf(copy))?.upgrade_description : '') || cards.get(idOf(copy))?.description || '');
function characterKey(value) { return String(value || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^character/, ''); }
function genericRoles(value) {
  const card = cards.get(idOf(value));
  const text = description(value), roles = [];
  if (card?.tags?.includes('Strike')) roles.push('打击供给');
  if (/抽(?:\d+|[一二三四五六七八九十]+)张牌|抽牌直至/.test(text)) roles.push('过牌');
  if (/获得\d+点.*?格挡/.test(text)) roles.push('防御');
  if (card?.energy_gain || /获得\[energy:/.test(card?.description || '')) roles.push('回能');
  if (!roles.length) roles.push(card?.type_key === 'Attack' ? '输出' : card?.type_key === 'Power' ? '持续辅助' : card ? '功能辅助' : '作用待核实');
  return roles;
}
function roleFor(build, value) {
  const id = idOf(value), slug = slugOf(build);
  if (slug === 'auto-strike') return id === 'HELLRAISER' ? '关键启动' : id === 'POMMEL_STRIKE' ? '循环／输出' : id === 'PERFECTED_STRIKE' ? '核心输出／数量增伤' : '输出／打击供给';
  const matched = (groups[slug] || []).filter(group => group.ids.includes(id));
  return matched.length ? matched.map(g => g.label).join('／') : genericRoles(value).join('／');
}
function profile(character, deck = [], relics = []) {
  const copies = deck.map(copyOf), owned = new Set(copies.map(c => c.id));
  const relicIds = relics.map(r => relicIndex.get(normalizeKey(typeof r === 'string' ? r : r.id || r.name)) || '');
  const profiles=builds.map(build => {
    const functions = (groups[slugOf(build)] || []).map(g => {
      let ids = g.id === 'supply' && slugOf(build) === 'auto-strike'
        ? catalog.filter(c => c.tags?.includes('Strike')).map(c => c.id) : g.ids;
      if (g.id === 'generation' && ['block-barricade', 'dexterity-block'].includes(slugOf(build))) ids = [...new Set([...ids, ...catalog.filter(c => c.block > 0).map(c => c.id)])];
      if (g.id === 'generation' && slugOf(build) === 'block-barricade' && copies.some(c => ['TRUE_GRIT','BURNING_PACT','SECOND_WIND','FIEND_FIRE','CORRUPTION','BRAND','STOKE','HAVOC'].includes(c.id))) ids = [...ids, 'FEEL_NO_PAIN'];
      if (g.id === 'source' && slugOf(build) === 'strength-scaling' && copies.some(c => ['BLOODLETTING','OFFERING','HEMOKINESIS','BRAND','BLOOD_WALL','CRIMSON_MANTLE','INFERNO'].includes(c.id))) ids = [...ids,'RUPTURE'];
      const relicProviders = g.id === 'source' && slugOf(build) === 'strength-scaling' ? relicIds.filter(id => ['VAJRA','BRIMSTONE','SWORD_OF_JADE'].includes(id)) : [];
      return { ...g, ids, count: copies.filter(c => ids.includes(c.id)).length, relicProviders, present: copies.some(c => ids.includes(c.id)) || relicProviders.length > 0 };
    });
    // 通用防御/抽牌或基础打击不能单独证明一个路线；使用专属牌面证据。
    const uniqueCore = build.core.filter(c => !['STRIKE_IRONCLAD', 'SHRUG_IT_OFF', 'BACKFLIP', 'ACROBATICS', 'PREPARED', 'ADRENALINE', 'IMPERVIOUS', 'FTL', 'GLOW'].includes(c.id));
    const active = slugOf(build) === 'auto-strike' ? owned.has('HELLRAISER') || owned.has('POMMEL_STRIKE') || owned.has('PERFECTED_STRIKE')
      : uniqueCore.some(c => owned.has(c.id)) || build.relics.some(r => relicIds.includes(r.id));
    return { build, functions, active, deckSize: copies.length, unknownCount: copies.filter(c => !cards.has(c.id)).length, relicIds };
  });
  // 外职业卡牌确实接通另一套机制时允许识别混合路线，不仅按角色或网站名单判断。
  return profiles.filter(p=>p.build.character===characterKey(character)||strategyPolicy.routeEvidence(p,deck).level==='established');
}
function nameList(ids, limit = 2) { return ids.map(id => cards.get(id)?.name).filter(Boolean).slice(0, limit).join('、'); }
function optionsFor(p, candidate) {
  const options = [];
  const countText = p.functions.map(g => `${g.label}${g.count}张${g.relicProviders.length ? `＋遗物${g.relicProviders.length}件` : ''}`).join('，');
  for (const g of p.functions.filter(g => !g.present)) {
    const names = nameList(g.ids);
    let shortfall = `${g.optional ? '尚无' : '缺少'}${g.label}${names && g.label !== names ? `（${names}）` : ''}。`;
    if (slugOf(p.build) === 'auto-strike') shortfall += `打击${p.functions.find(f => f.id === 'supply')?.count || 0}/${p.deckSize}张，剑柄${p.functions.find(f => f.id === 'loop')?.count || 0}张。`;
    const fills = g.ids.includes(idOf(candidate));
    options.push({ id: `missing:${g.id}`, optional: g.optional, shortfall, advice: `${fills ? '此牌可补上该组件；' : ''}${names ? names === g.label ? `优先寻找${names}。` : `寻找${names}等牌补充${g.label}。` : `补充${g.label}。`}` });
  }
  const slug = slugOf(p.build);
  if (slug === 'auto-strike') {
    const supply = p.functions.find(g => g.id === 'supply')?.count || 0;
    const loop = p.functions.find(g => g.id === 'loop')?.count || 0;
    const starter = p.functions.find(g => g.id === 'starter')?.count || 0;
    options.push({ id: 'supply', shortfall: `${starter ? '已有启动牌；' : '尚无启动牌；'}打击${supply}/${p.deckSize}张，剑柄打击${loop}张。`,
      advice: idOf(candidate) === 'PERFECTED_STRIKE' ? '增加打击可强化完美打击；剑柄打击同时补供给与循环。' : '可继续补充打击；剑柄打击同时补供给与抽牌循环。' });
  } else if (p.functions.every(g => g.optional || g.present)) {
    options.push({ id: 'inventory', shortfall: `已有组件：${countText || '暂无已核实组件'}。`, advice: `继续补充${p.functions.filter(g => !g.optional).map(g => g.label).join('、')}，兼顾防御与费用。` });
  }
  if (p.unknownCount) options.unshift({ id: 'unknown', shortfall: `有${p.unknownCount}张牌效果未核实，短板判断不完整。`, advice: '先核实未知卡牌；暂按已确认组件判断配合。' });
  if (!p.unknownCount && slug === 'auto-strike') {
    const firstMissing = options.find(o => o.id.startsWith('missing:') && !o.optional);
    if (firstMissing) return [firstMissing];
  }
  return options;
}
function evaluateBuildPolicy(character, deck, relics, candidate, context = {}) {
  return strategyPolicy.assessCandidate(profile(character,deck,relics),deck,relics,candidate,context);
}
function buildStrategyContext(character, deck, relics = []) {
  return strategyPolicy.strategyContext(profile(character,deck,relics),deck,relics);
}
function evaluateRemoval(character, deck, relics, candidate) {
  return strategyPolicy.removalAssessment(profile(character,deck,relics),deck,candidate);
}
function cardGuidance(character, deck, relics, candidate, decisionState = {}) {
  const id = idOf(candidate), memberships = [];
  const profiles = profile(character, deck, relics);
  const policy = strategyPolicy.assessCandidate(profiles,deck,relics,candidate,decisionState);
  for (const p of profiles) {
    const listed = [...p.build.core, ...p.build.support].some(c => c.id === id);
    const conflicts = policy.conflicts.filter(c=>c.systemId===p.build.id);
    if (!listed && !conflicts.length) continue;
    // 同时存在结构与条件冲突时，模型不能用较轻的牌序提示掩盖结构破坏。
    const displayConflicts=conflicts.some(c=>c.severity==='structural')?conflicts.filter(c=>c.severity==='structural'):conflicts;
    const choices = displayConflicts.length ? displayConflicts.map(c=>({id:c.ruleId,shortfall:`${c.severity==='structural'?'机制冲突：':''}${c.reason}`,
      advice:policy.exception&&c.severity==='structural'?policy.exception==='survival_tradeoff'?'生命吃紧时可权衡即时防御或群伤，但需接受上述机制损失。':'可为另一已建立路线取舍，但需接受对当前体系的破坏。':c.advice})) : optionsFor(p, candidate);
    const selected = choices[0];
    memberships.push({ systemId: p.build.id, systemName: p.build.name, role: conflicts.length ? conflicts.some(c=>c.severity==='structural')?'机制冲突':'条件冲突' : roleFor(p.build, candidate),
      source: p.build.source, sourceKind: conflicts.length ? 'mechanic' : p.build.sourceKind, conflict: conflicts.length>0,
      core: p.build.core.some(c => c.id === id), active: p.active, options: choices,
      diagnosisId: selected.id, shortfall: selected.shortfall, advice: selected.advice, generatedBy: 'rules' });
  }
  return { cardId: typeof candidate === 'string' ? candidate.replace(/\+$/, '') : candidate?.id || id, key: keyOf(candidate), upgraded: copyOf(candidate).upgraded, systems: memberships, policy };
}
function decorateCardGuidance(character, deck, relics, candidates, decisionState = {}) {
  if (!Array.isArray(candidates)) return candidates;
  return candidates.map(candidate => {
    const result = { ...(typeof candidate === 'string' ? { id: candidate } : candidate) };
    for (const field of ['archetypeScores', 'archetypeImpacts', 'archetypeImpact']) delete result[field];
    result.buildGuidance = cardGuidance(character, deck || [], relics || [], candidate,decisionState);
    result.buildPolicy = result.buildGuidance.policy;
    if(result.buildPolicy.conflicts.length)result.cons=[...new Set([...(result.cons||[]),result.buildPolicy.summary])];
    return result;
  });
}
function guidanceSignature({ runId, character, deck, relics, candidates, context, signature, decisionState }) {
  return hash([source.version, STRATEGY_VERSION, runId, characterKey(character), deck.map(c=>({ ...copyOf(c), description:c?.description || '' })).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    relics.map(r => typeof r === 'string' ? r : r.id || r.name).sort(), candidates.map(c => [keyOf(c), c.stockKey || '', c.description || '']), context, signature, decisionState]);
}
module.exports = { builds, cards, idOf, keyOf, copyOf, hash, characterKey, profile, roleFor, cardGuidance, decorateCardGuidance, guidanceSignature, genericRoles,
  evaluateBuildPolicy, buildStrategyContext, evaluateRemoval };
