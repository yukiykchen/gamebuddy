'use strict';
const cards = new Map(require('../agent/data/codex/cards.json').map(item => [item.id, item]));
const relics = new Map(require('../agent/data/codex/relics.json').map(item => [item.id, item]));
const potions = new Map(require('../agent/data/codex/potions.json').map(item => [item.id, item]));
const events = new Map(require('../agent/data/codex/events.json').map(item => [item.id, item]));
const monsters = new Map(require('../agent/data/codex/monsters.json').map(item => [item.id, item]));
const assetManifest = require('../src/assets/run-details/manifest.json');
const clean = value => String(value ?? '').replace(/\[energy:(\d+)\]/gi, '$1点能量').replace(/\[star:(\d+)\]/gi, '$1颗星星').replace(/\[\/?[a-z][^\]]*\]/gi, '').trim();
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const idOf = value => String(value?.id || value?.cardId || value?.relicId || value?.potionId || '').replace(/^(CARD|RELIC|POTION)\./, '');
const KINDS = { Monster: 'monster', Elite: 'elite', Boss: 'boss', Event: 'event', RestSite: 'rest_site', Shop: 'shop', Treasure: 'treasure' };
const LABELS = { monster: '战斗', elite: '精英战斗', boss: '首领战斗', event: '事件', rest_site: '休息处', shop: '商店', treasure: '宝箱房', unknown: '房间未记录' };
function asset(relative) { return assetManifest.assets[relative] ? `./assets/run-details/${relative}` : null; }
function item(value, family = 'cards') {
  if (typeof value === 'string') value = { id: value };
  const id = idOf(value), known = ({ cards, relics, potions })[family]?.get(id);
  const upgraded = value?.upgraded === true;
  const raw = clean(value?.description);
  const description = raw && !/[{}]/.test(raw) ? raw
    : clean(upgraded ? known?.upgrade_description : known?.description);
  const baseName = clean(value?.name || known?.name || id || '未知');
  return { id, name: upgraded && !baseName.endsWith('+') ? `${baseName}+` : baseName, upgraded,
    type: known?.type_key || value?.type || 'Skill', color: known?.color || 'colorless', rarity: known?.rarity_key || 'Common',
    cost: value?.cost ?? known?.cost ?? null, description: /[{}]/.test(description) ? '' : description,
    image: family === 'cards' ? asset(`cards/faces/${id.toLowerCase()}${upgraded ? '_upg' : ''}.webp`)
      || asset(`cards/portraits/${id.toLowerCase()}.webp`) : asset(`${family}/${id.toLowerCase()}.webp`),
    // 变体保留在分组键与可见说明中，不能把附魔和普通卡合并。
    variant: [value?.enchantment, value?.affliction].filter(Boolean).map(v => typeof v === 'string' ? clean(v)
      : [clean(v.name || v.id), number(v.amount) != null ? `×${v.amount}` : ''].filter(Boolean).join(' ')).filter(Boolean).join(' · '),
    variantKey: JSON.stringify([value?.enchantment ?? null, value?.affliction ?? null, value?.upgradeLevel ?? null, value?.description ?? null]) };
}
function collection(values, family) {
  if (!Array.isArray(values)) return null;
  const grouped = new Map();
  for (const value of values) {
    const entry = item(value, family), key = JSON.stringify([entry.id, entry.name, entry.upgraded, entry.cost, entry.variantKey]);
    if (grouped.has(key)) grouped.get(key).count++;
    else grouped.set(key, { ...entry, count: 1 });
  }
  return [...grouped.values()].map(({ variantKey, ...entry }) => entry);
}
function effectiveFacts(runId, input) {
  const seen = new Set(), generations = new Map();
  const facts = input.filter(f => f.runId === runId).filter(f => {
    const key = f.eventId || (f.sourceSessionId && f.sourceSeq != null ? `${f.sourceSessionId}:${f.sourceSeq}` : null);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    if (f.combatId && Number.isInteger(f.attemptGeneration)) generations.set(f.combatId, Math.max(generations.get(f.combatId) ?? -1, f.attemptGeneration));
    return true;
  });
  return facts.filter(f => !f.combatId || f.attemptGeneration == null || f.attemptGeneration === generations.get(f.combatId))
    .sort((a, b) => (a.occurredAt || 0) - (b.occurredAt || 0) || (a.sourceSeq || 0) - (b.sourceSeq || 0));
}
function buildRunDetails(run, input = []) {
  const facts = effectiveFacts(run.runId, input), floors = new Map(), combatFloors = new Map(), relicGains = new Map();
  let current = null, latest = {}, epoch = 0;
  const ensure = (act, floor) => {
    if (!Number.isInteger(act) || act < 1 || !Number.isInteger(floor) || floor < 1) return null;
    const key = `${act}-${floor}`;
    if (!floors.has(key)) floors.set(key, { key, act, floor, kind: 'unknown', combats: new Map(),
      decisions: new Map(), offers: new Map(), rows: [], snapshots: [], actions: new Set(), eventName: null });
    return floors.get(key);
  };
  for (const fact of facts) {
    const p = fact.payload || {}, type = fact.eventType;
    if (type === 'run.resumed') { epoch++; current = null; }
    if (type === 'capture.gap_detected' || type === 'combat.attempt_replaced') epoch++;
    if (type === 'run.observed') {
      latest = { ...latest, ...p }; current = ensure(p.act, p.floor);
      current?.snapshots.push({ ...p, epoch, session: fact.sourceSessionId }); continue;
    }
    let floor = (fact.combatId && combatFloors.get(fact.combatId)) || current;
    if (Number.isInteger(p.act) && Number.isInteger(p.floor)) floor = ensure(p.act, p.floor);
    if (!floor) continue;
    const add = (label, text, key = fact.actionId || fact.eventId) => {
      if (key && floor.actions.has(key)) return;
      if (key) floor.actions.add(key);
      floor.rows.push({ label, text: clean(text) });
    };
    if (type === 'map.observed') {
      const node = p.nodes?.find(n => n.id === p.current);
      if (floor.kind === 'unknown' && node && KINDS[node.type]) floor.kind = KINDS[node.type];
    }
    if (type === 'combat.started') {
      const key = fact.combatId || fact.eventId;
      // BeforeCombatStart早于新楼层快照；带敌人信息的通知与快照同帧，归属以此为准。
      if (p.enemies?.length && current && floor !== current) {
        const pending = floor.combats.get(key);
        floor.combats.delete(key);
        floor = current;
        if (pending) floor.combats.set(key, pending);
      }
      combatFloors.set(key, floor);
      const combat = floor.combats.get(key) || { enemies: [], turns: new Set(), outcome: null };
      if (p.enemies?.length) {
        const enemies = new Map();
        for (const e of p.enemies) { const name = clean(e.name || monsters.get(e.id)?.name || e.id); enemies.set(name, (enemies.get(name) || 0) + 1); }
        combat.enemies = [...enemies].map(([name, count]) => `${name}${count > 1 ? ` ×${count}` : ''}`);
      }
      if (p.boss === true) floor.kind = 'boss';
      else if (KINDS[p.roomType]) floor.kind = KINDS[p.roomType];
      floor.combats.set(key, combat);
    }
    if (fact.combatId && floor.combats.has(fact.combatId)) {
      const combat = floor.combats.get(fact.combatId);
      if (type === 'turn.started' && String(p.side || p.actorSide || '').toLowerCase() === 'player' && Number.isInteger(p.turn ?? p.turnNumber)) combat.turns.add(p.turn ?? p.turnNumber);
      // 旧AfterCombatEnd的victory=false是占位值，不能据此宣布战败。
      if (type === 'combat.ended') {
        if (p.playerDied === true || p.outcome === 'defeat') combat.outcome = '战败';
        else if (p.victory === true || p.outcome === 'victory') combat.outcome = '获胜';
      }
    }
    if (type === 'reward.offered' || type === 'reward.updated') {
      floor.offers.set(`reward:${fact.decisionId || ''}:${p.candidateVersion || ''}`, p);
    }
    if (type === 'reward.resolved') {
      const version = p.candidateVersion || '';
      let key = fact.decisionId ? `reward:${fact.decisionId}` : null;
      // 旧state_diff补充通知没有decisionId，只能与同层、同候选版本的未补全选择匹配。
      if (!key) key = [...floor.decisions].reverse().find(([, d]) => d.kind === 'reward' && d.version === version && !d.cardId)?.[0];
      key ||= `reward:${fact.eventId}`;
      const previous = floor.decisions.get(key) || {};
      floor.decisions.set(key, { ...previous, kind: 'reward', decisionId: fact.decisionId || previous.decisionId,
        version, result: p.result || previous.result, cardId: p.cardId || previous.cardId, upgraded: p.upgraded ?? previous.upgraded });
    }
    if (type === 'event.options_offered') {
      floor.kind = floor.kind === 'unknown' ? 'event' : floor.kind;
      floor.eventName = events.get(p.eventId)?.name || clean(p.eventName || p.eventId) || floor.eventName;
      floor.offers.set(`event:${fact.decisionId || ''}`, p);
    }
    if (type === 'event.option_selected') {
      const offer = floor.offers.get(`event:${fact.decisionId || ''}`);
      const option = offer?.options?.find(o => o.optionId === p.optionId || o.label === p.label);
      add(floor.eventName || '事件', `${p.label || option?.label || '选项未记录'}${option?.description ? ` · ${option.description}` : ''}`);
    }
    if (type === 'rest.options_offered') floor.kind = 'rest_site';
    if (type === 'rest.action_completed') {
      floor.kind = 'rest_site';
      add('火堆', p.action === 'heal' ? '选择休息' : p.action === 'smith'
        ? `选择升级${p.cardId ? ` · ${item({ id: p.cardId, upgraded: true }).name}` : ' · 卡牌未记录'}` : clean(p.action || '选择未记录'));
    }
    if (type === 'shop.opened') floor.kind = 'shop';
    if (type === 'shop.transaction_completed' && p.status !== 'failed') {
      floor.kind = 'shop';
      const family = p.itemType === 'relic' ? 'relics' : p.itemType === 'potion' ? 'potions' : 'cards';
      add('购买', `${p.itemId || p.cardId || p.name ? item({ id: p.itemId || p.cardId, name: p.name }, family).name : '物品未记录'}${number(p.price) != null ? ` · ${p.price} 金币` : ''}`);
    }
    if (['relic.gained', 'potion.gained', 'potion.used', 'deck.card_removed'].includes(type)) {
      const family = type.startsWith('relic') ? 'relics' : type.startsWith('potion') ? 'potions' : 'cards';
      if (idOf(p) || p.name) add(type === 'potion.used' ? '使用药水' : type === 'deck.card_removed' ? '移除卡牌' : '获得', item(p, family).name);
      if (type === 'relic.gained' && idOf(p)) relicGains.set(idOf(p), { act: floor.act, floor: floor.floor });
    }
  }
  const floorRows = [...floors.values()].sort((a, b) => a.act - b.act || a.floor - b.floor).map(floor => {
    for (const decision of floor.decisions.values()) {
      const offer = floor.offers.get(`reward:${decision.decisionId || ''}:${decision.version}`);
      const selected = decision.cardId ? item({ id: decision.cardId, upgraded: decision.upgraded }) : null;
      const alternatives = offer?.candidates?.filter(c => c.cardId !== decision.cardId).map(c => item({ id: c.cardId, name: c.name, upgraded: c.upgraded }).name);
      floor.rows.push({ label: '选牌', text: decision.result === 'skipped' || decision.result === 'skip' ? '跳过奖励'
        : selected ? `拿取 ${selected.name}` : decision.result === 'selected' ? '已选择 · 卡牌未记录' : '选择结果未记录',
      detail: alternatives?.length && (selected || decision.result === 'skipped' || decision.result === 'skip') ? `未拿：${alternatives.join('、')}` : null });
    }
    const first = floor.snapshots[0], last = floor.snapshots.at(-1);
    const continuous = first && last && first.epoch === last.epoch && first.session === last.session;
    if (continuous && first !== last) {
      for (const [family, label] of [['relics', '遗物'], ['potions', '药水'], ['deck', '牌组']]) {
        if (!Array.isArray(first[family]) || !Array.isArray(last[family])) continue;
        const counts = values => { const m = new Map(); for (const value of values) { const id = idOf(value); if (id) m.set(id, (m.get(id) || 0) + 1); } return m; };
        const before = counts(first[family]), after = counts(last[family]);
        const added = [], removed = [];
        for (const id of new Set([...before.keys(), ...after.keys()])) {
          const delta = (after.get(id) || 0) - (before.get(id) || 0);
          if (!delta) continue;
          const named = item(last[family].find(v => idOf(v) === id) || first[family].find(v => idOf(v) === id), family === 'deck' ? 'cards' : family);
          (delta > 0 ? added : removed).push(`${named.name}${Math.abs(delta) > 1 ? ` ×${Math.abs(delta)}` : ''}`);
          if (family === 'relics' && delta > 0 && !relicGains.has(id)) relicGains.set(id, { act: floor.act, floor: floor.floor });
        }
        if (added.length || removed.length) floor.rows.push({ label: `${label}变化`, text: [added.length ? `净增：${added.join('、')}` : '', removed.length ? `净减：${removed.join('、')}` : ''].filter(Boolean).join('；') });
      }
    }
    const combats = [...floor.combats.values()].map(c => ({ enemies: [...new Set(c.enemies)].join('、') || '遭遇未记录',
      turns: c.turns.size || null, outcome: c.outcome }));
    const title = combats.length ? combats.map(c => c.enemies).join(' / ') : floor.eventName || LABELS[floor.kind];
    return { key: floor.key, act: floor.act, floor: floor.floor, kind: floor.kind, label: LABELS[floor.kind], title,
      hpBefore: continuous ? number(first.hp) : null, hpAfter: number(last?.hp), maxHp: number(last?.maxHp),
      goldBefore: continuous ? number(first.gold) : null, goldAfter: number(last?.gold),
      combats, rows: floor.rows, continuity: Boolean(continuous) };
  });
  const final = { ...latest, ...run.finalState };
  const lastCombat = floorRows.flatMap(f => f.combats).at(-1);
  const observedDuration = number(run.observedDurationSeconds) ?? (number(run.startedAt) != null && number(run.endedAt) != null ? Math.max(0, (run.endedAt - run.startedAt) / 1000) : null);
  return { runId: run.runId, status: 'ready', summary: {
    character: String(run.character || latest.character || '').toLowerCase(), ascension: number(run.ascension ?? latest.ascension),
    result: run.result, floor: number(run.finalFloor), act: number(run.finalAct ?? latest.act), localFloor: number(latest.floor),
    hp: number(final.hp), maxHp: number(final.maxHp), gold: number(final.gold), durationSeconds: observedDuration,
    endedAt: number(run.endedAt), lastEncounter: lastCombat?.enemies || run.finalBossName || null,
    gameMode: clean(run.gameMode || '')
  }, deck: collection(final.deck ?? run.finalDeck, 'cards'), relics: collection(final.relics ?? run.finalRelics, 'relics')?.map(relic => ({ ...relic, acquiredAt: relicGains.get(relic.id) || null })) ?? null,
  potions: collection(final.potions, 'potions'), acts: [...new Set(floorRows.map(f => f.act))].map(act => ({ act, floors: floorRows.filter(f => f.act === act) })),
  coverageNote: '仅展示实际留下的记录；缺失楼层和选择不补写，生命与金币为该层观测值。' };
}
function readRunDetails(runId, history, factStore) {
  const run = typeof runId === 'string' && history.runs?.find(run => run.runId === runId);
  return run ? buildRunDetails(run, factStore.getEffectiveFacts(runId)) : null;
}
module.exports = { buildRunDetails, readRunDetails };
