const state = {
  mode: 'combat',
  paused: false,
  source: 'waiting',
  syncedAt: 0,
  run: { act: 0, floor: 0, totalFloor: 0, room: null, character: '' },
  selectedCard: '',
  player: { hp: 0, maxHp: 0, block: 0, energy: 0, maxEnergy: 0, gold: 0, cards: [], relics: [], potions: [] },
  combat: null,
  enemy: null,
  hand: [],
  map: { visited: [] },
  reward: null,
  event: null,
  recommendation: null,
  thisRunSl: null
};

const viewContainer = document.querySelector('#view-container');
const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function hpPercent(unit) { return unit?.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100))) : 0; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function characterName(character) {
  const names = { ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '统御者', necrobinder: '死灵法师' };
  return names[String(character || '').toLowerCase()] || character || '等待游戏';
}

function combatView() {
  const hasCombat = Boolean(state.combat);
  const enemy = state.enemy;
  const enemyIntent = enemy?.subtitle || '意图未知';
  const liveRecommendation = hasCombat && enemy
    ? { title: '战斗出牌暂缓', card: '', reason: `已收到 ${enemy.name} 的生命、格挡和意图，手牌也会同步。出牌顺序先不做，打开地图后会给路线建议。`, sequence: [] }
    : { title: '战斗出牌暂缓', card: '', reason: '当前先做路线规划。进入战斗后这里仍会显示真实手牌和敌人，但暂时不给出牌顺序。', sequence: [] };
  const hand = hasCombat ? state.hand : [];
  return `
    <div class="view-grid">
      <section class="panel battle-panel">
        <div class="panel-heading"><span class="panel-title">战斗状态</span><span class="panel-meta">${hasCombat ? `楼层 ${state.run.floor} · 回合 ${String(state.combat.turn).padStart(2, '0')}` : '当前不在战斗中'}</span></div>
        <div class="combat-top">
          <div class="unit-card">
            <div class="unit-label"><span class="mini-status"></span>我方</div><div class="unit-name">${characterName(state.run.character)}</div><div class="unit-subtitle">${hasCombat ? '实时战斗数据' : '等待真实游戏数据'}</div>
            <div class="vitals"><div class="vital ${state.player.hp < 30 ? 'danger' : ''}"><strong>${state.player.hp}</strong><span>生命 / ${state.player.maxHp}</span></div><div class="vital"><strong>${state.player.block}</strong><span>格挡</span></div></div>
            <div class="unit-meter"><span style="width:${hpPercent(state.player)}%"></span></div>
          </div>
          <div class="unit-card enemy-card">
            <div class="unit-label enemy-label"><span class="mini-status"></span>敌方</div><div class="unit-name">${enemy?.name || '暂无敌人'}</div><div class="unit-subtitle">${enemy?.subtitle || '进入战斗后显示'}</div>
            <div class="vitals"><div class="vital danger"><strong>${enemy?.hp ?? '--'}</strong><span>${enemy ? `生命 / ${enemy.maxHp}` : '生命'}</span></div></div>
            <div class="unit-meter"><span style="width:${enemy ? hpPercent(enemy) : 0}%"></span></div><div class="intent"><strong>${enemy ? enemyIntent : '等待战斗数据'}</strong>　${enemy ? '仅显示游戏上报的行动意图' : '本区域暂无敌人'}</div>
          </div>
        </div>
        <div class="energy-row"><div class="energy">${hasCombat ? state.player.energy : '--'}<small>/ ${hasCombat ? state.player.maxEnergy : '--'} 能量</small></div><div class="turn-status">${state.paused ? '建议已暂停 · 数据仍在同步' : hasCombat ? '等待你的操作' : '等待进入战斗'}</div><div class="panel-meta">抽牌堆 ${hasCombat ? state.combat.drawPile.length : '--'}　弃牌堆 ${hasCombat ? state.combat.discardPile.length : '--'}</div></div>
        <div class="hand-area"><div class="hand-label"><span>当前手牌 · ${hand.length} 张</span><span>${hand.length ? '点击卡牌查看推演' : '等待真实手牌数据'}</span></div><div class="hand">${hand.length ? hand.map(card => `<button class="card-tile ${card.skill ? 'skill' : ''} ${state.selectedCard === card.name ? 'recommended' : ''}" data-card="${card.name}"><span class="card-cost">${card.cost ?? 'X'}</span><span class="card-name">${card.name}</span><span class="card-type">${card.type}</span></button>`).join('') : '<div class="data-empty">进入战斗后，真实手牌会显示在这里。</div>'}</div></div>
      </section>
      <div class="side-stack">
        <section class="panel recommendation-panel">
          <div class="panel-heading"><span class="panel-title">本回合建议</span><span class="confidence">暂缓</span></div>
          <div class="recommendation-body"><div class="recommendation-kicker">出牌顺序稍后接入</div><div class="recommendation-title">${liveRecommendation.title} <em>${liveRecommendation.card}</em></div><p class="recommendation-reason">${liveRecommendation.reason}</p><div class="decision-footer"><button class="outline-button" id="open-route-view">去看路线建议</button></div></div>
        </section>
        <section class="panel why-panel"><div class="panel-heading"><span class="panel-title">为什么这样打</span><span class="panel-meta">暂缓</span></div><div class="why-body"><div class="data-empty">战斗出牌先不做。地图打开后，路线页会给出下一步该往哪走。</div></div></section>
      </div>
    </div>`;
}

function showingRest() {
  if (state.mode === 'combat' || state.mode === 'draft' || state.combat) return false;
  return state.recommendation?.task === 'rest_site';
}

function showingEvent() {
  if (state.mode === 'combat' || state.mode === 'draft' || state.combat) return false;
  return state.recommendation?.task === 'event_choice';
}

function atRestSite(run = state.run, combat = state.combat) {
  if (combat) return false;
  const room = String(run?.room || '');
  const node = String(run?.currentNode || '');
  if (/rest|camp/i.test(room)) return true;
  if (/map/i.test(room)) return false;
  return /rest/i.test(node);
}

function restView() {
  const rec = state.recommendation?.task === 'rest_site' ? state.recommendation : null;
  const primary = rec?.primary;
  const hp = state.player;
  const missing = Math.max(0, (hp.maxHp || 0) - (hp.hp || 0));
  const healPick = primary?.action === 'HEAL';
  const smithPick = primary?.action === 'SMITH';
  const healAmount = primary?.healAmount ?? (rec?.alternatives || []).find(item => item.action === 'HEAL')?.healAmount;
  const healTo = primary?.healTo ?? (hp.hp || 0) + (healAmount || 0);
  const smithAlts = (rec?.alternatives || []).filter(item => item.action === 'SMITH');
  const displayedSmith = smithPick ? primary : smithAlts[0];
  const smithAnalysis = displayedSmith?.upgradeAnalysis;
  const smithReasons = (smithAnalysis?.reasons || []).slice(0, 3).map(item => `<li class="positive">${escapeHtml(item)}</li>`).join('');
  const unupgraded = (hp.cards || []).filter(card => card && card.upgraded !== true);
  const title = primary?.label ? escapeHtml(primary.label) : '回血还是升级？';
  const reason = rec?.reason
    ? escapeHtml(rec.reason)
    : '进入休息处后，这里会根据生命、后续精英和未升级的牌，建议回血或敲哪一张。';
  const healCard = `
    <article class="draft-card ${healPick ? 'top-pick' : ''}">
      <span class="pick-tag">${healPick ? '建议' : '备选'}</span>
      <div class="card-name">回血</div>
      <p>${missing ? `当前缺口 ${missing} 点，估计可回到 ${healTo || hp.hp}/${hp.maxHp}。` : '生命已满，回血没有收益。'}</p>
    </article>`;
  const smithCard = smithPick || smithAlts[0]
    ? `<article class="draft-card ${smithPick ? 'top-pick' : ''}">
        <span class="pick-tag">${smithPick ? '建议升级' : '可升级'}</span>
        <div class="card-name">${escapeHtml(displayedSmith?.cardName || '')}</div>
        <p>${smithPick ? escapeHtml(rec.reason) : '生命还够时，升级这张牌通常比回一点血更能提高战斗力。'}</p>
        ${smithReasons ? `<ul class="draft-notes">${smithReasons}</ul>` : ''}
      </article>`
    : `<article class="draft-card"><span class="pick-tag">没有可升级牌</span><div class="card-name">卡组已升满</div><p>没有未升级的牌时，只能选择回血。</p></article>`;
  const otherSmiths = smithAlts.slice(smithPick ? 0 : 1).slice(0, 3).map(item => `
    <div class="route-choice"><strong>备选升级 · ${escapeHtml(item.cardName || item.label)}</strong><span>${escapeHtml(item.reason || '升级收益低于当前首选')}</span></div>`).join('');
  const sourceLabel = rec ? (rec.source === 'llm' ? '模型 + 社区 Skill' : '社区 Skill') : '等待分析';
  return `<div class="draft-layout rest-layout"><section class="panel draft-offer"><div class="draft-kicker">REST / CAMPFIRE</div><h2 class="draft-title">${title}</h2><p class="recommendation-reason">${reason}</p><div class="draft-cards">${healCard}${smithCard}</div>${otherSmiths}</section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">休息处状态</span><span class="panel-meta">${sourceLabel}</span></div><div class="deck-stat"><span>生命</span><strong>${hp.hp || 0} / ${hp.maxHp || 0}</strong></div><div class="deck-stat"><span>缺口</span><strong>${missing || 0}</strong></div><div class="deck-stat"><span>未升级</span><strong>${unupgraded.length || 0}</strong></div><div class="deck-stat"><span>卡组</span><strong>${hp.cards?.length || 0}</strong></div><div class="deck-stat"><span>策略版本</span><strong>${escapeHtml(rec?.strategy?.gameVersion || 'v0.107.1')}</strong></div><div class="data-empty" style="margin-top:18px">社区策略是局面先验，不是固定升级榜。GameBuddy 不会替你点击。</div></section></div>`;
}

function eventView() {
  const rec = state.recommendation?.task === 'event_choice' ? state.recommendation : null;
  const primary = rec?.primary;
  const options = [];
  if (primary?.label) {
    options.push({ ...primary, recommended: true });
  }
  for (const item of rec?.alternatives || []) {
    if (item?.label) options.push({ ...item, recommended: false });
  }
  const fromState = Array.isArray(state.event?.options) ? state.event.options : [];
  if (!options.length && fromState.length) {
    fromState.forEach(option => options.push({ ...option, recommended: false }));
  }
  const kind = rec?.eventKind || state.event?.kind;
  const kicker = kind === 'ancient' ? 'ACT START / ANCIENT' : 'EVENT / CHOICE';
  const title = primary?.label
    ? `建议选择「${escapeHtml(primary.label)}」`
    : escapeHtml(rec?.eventTitle || state.event?.title || '事件选项');
  const reason = rec?.reason
    ? escapeHtml(rec.reason)
    : fromState.length
      ? '当前选项效果资料不足，无法形成可靠首选；请按游戏原文判断，不会默认选择第一个按钮。'
      : '出现可选项后，这里会结合牌组、遗物和生命给出推荐。';
  const riskLabels = { low: '低风险', medium: '中风险', high: '高风险', fatal: '致命' };
  const cards = options.length
    ? options.map(option => {
      const analysis = option.analysis || {};
      const pros = (analysis.pros || []).slice(0, 3).map(item => `<li class="positive">${escapeHtml(item)}</li>`).join('');
      const cons = [...(analysis.cons || []), ...(analysis.unknown || [])].slice(0, 3).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      const risk = analysis.riskLevel ? riskLabels[analysis.riskLevel] || analysis.riskLevel : '效果待确认';
      return `
      <article class="draft-card ${option.recommended ? 'top-pick' : ''}">
        <span class="pick-tag">${option.recommended ? '建议' : '备选'}</span>
        <div class="card-name">${escapeHtml(option.label)}</div>
        <p>${escapeHtml(option.description || '游戏内选项效果。')}</p>
        <div class="draft-fit"><span class="fit-${analysis.riskLevel === 'low' ? 'strong' : analysis.riskLevel === 'medium' ? 'medium' : 'weak'}">${escapeHtml(risk)}</span><span>${analysis.eligible === false ? '不可推荐' : Number.isFinite(analysis.score) ? `规则分 ${analysis.score}` : '未评分'}</span></div>
        ${pros || cons ? `<ul class="draft-notes">${pros}${cons}</ul>` : ''}
      </article>`;
    }).join('')
    : '<div class="data-empty large-empty">等待事件选项同步。开局祝福和途中事件的按钮文案会显示在这里。</div>';
  const sourceLabel = rec ? (rec.source === 'llm' ? '模型复核' : '规则评分') : '等待分析';
  const knowledge = rec?.eventKnowledge || {};
  return `<div class="draft-layout rest-layout"><section class="panel draft-offer"><div class="draft-kicker">${kicker}</div><h2 class="draft-title">${title}</h2><p class="recommendation-reason">${reason}</p><div class="draft-cards">${cards}</div></section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">当前局面</span><span class="panel-meta">${sourceLabel}</span></div><div class="deck-stat"><span>生命</span><strong>${state.player.hp || 0} / ${state.player.maxHp || 0}</strong></div><div class="deck-stat"><span>金币</span><strong>${state.player.gold ?? '--'}</strong></div><div class="deck-stat"><span>卡组</span><strong>${state.player.cards?.length || 0}</strong></div><div class="deck-stat"><span>遗物 / 药水</span><strong>${state.player.relics?.length || 0} / ${state.player.potions?.length || 0}</strong></div><div class="deck-stat"><span>事件资料</span><strong>${escapeHtml(knowledge.gameVersion || '运行时文本')}</strong></div><div class="deck-stat"><span>匹配方式</span><strong>${escapeHtml(knowledge.match || '未匹配')}</strong></div><div class="data-empty" style="margin-top:18px">随机结果保持未知；GameBuddy 不会替你点击选项。</div></section></div>`;
}

function draftView() {
  const rec = state.recommendation?.task === 'card_reward' ? state.recommendation : null;
  const rawCards = state.reward?.cards || state.reward?.offered || state.reward?.options || [];
  const options = rec?.options?.length
    ? rec.options
    : rawCards.map(card => typeof card === 'string' ? { id: card, name: card } : card);
  if (!options.length) {
    return `<div class="draft-layout"><section class="panel draft-offer"><div class="draft-kicker">REWARD / CARD REWARD</div><h2 class="draft-title">等待真实卡牌奖励</h2><div class="data-empty large-empty">战斗结束并打开选牌界面后，Mod 会同步候选牌、当前牌组与战斗上下文。</div></section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">当前卡组</span><span class="panel-meta">${state.player.cards.length ? `${state.player.cards.length} 张` : '等待数据'}</span></div><div class="deck-stat"><span>卡牌</span><strong>${state.player.cards.length || '--'}</strong></div><div class="deck-stat"><span>遗物</span><strong>${state.player.relics.length || '--'}</strong></div><div class="deck-stat"><span>药水</span><strong>${state.player.potions.length || '--'}</strong></div></section></div>`;
  }

  const primaryId = rec?.primary?.action === 'TAKE_CARD' ? String(rec.primary.cardId) : '';
  const skipPick = rec?.primary?.action === 'SKIP';
  const cardHtml = options.map((card, index) => {
    const id = String(card.id || card.name || index);
    const recommended = primaryId && id === primaryId;
    const pros = (card.pros || []).slice(0, 2).map(item => `<li class="positive">${escapeHtml(item)}</li>`).join('');
    const cons = (card.cons || []).slice(0, 2).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const boss = card.fit?.boss;
    const elite = card.fit?.elite;
    const knowledge = card.knowledgeEvaluation;
    const fitClass = level => level === '强' ? 'strong' : level === '中' ? 'medium' : 'weak';
    const fit = boss || elite
      ? `<div class="draft-fit"><span class="fit-${fitClass(elite?.level)}">精英 ${escapeHtml(elite?.level || '--')}</span><span class="fit-${fitClass(boss?.level)}">Boss ${escapeHtml(boss?.level || '--')}</span></div>`
      : '';
    const knowledgeHtml = knowledge
      ? `<div class="card-knowledge"><div class="knowledge-head"><span>${escapeHtml(knowledge.rank || '未评级')}</span><strong>${escapeHtml(knowledge.sourceName || 'GameBuddy')}</strong></div><p>${escapeHtml(knowledge.expertSummary || '')}</p><div class="knowledge-condition good">适合：${escapeHtml((knowledge.goodWhen || []).slice(0, 2).join('；'))}</div><div class="knowledge-condition bad">慎拿：${escapeHtml((knowledge.badWhen || []).slice(0, 2).join('；'))}</div>${knowledge.sourceTimestamp ? `<div class="knowledge-source">${escapeHtml(knowledge.gameVersion || '')} · 来源时间点 ${escapeHtml(knowledge.sourceTimestamp)}</div>` : `<div class="knowledge-source">${escapeHtml(knowledge.gameVersion || '')} · 无专家时间点，使用社区/机制综合评价</div>`}</div>`
      : '';
    return `<article class="draft-card ${recommended ? 'top-pick' : ''}" data-card="${escapeHtml(card.name || card.id)}">
      <div class="draft-card-head"><span class="pick-tag">${recommended ? '首选' : rec ? `第 ${index + 1} 位` : '分析中'}</span><strong>${Number.isFinite(card.score) ? card.score : '--'}</strong></div>
      <div class="card-name">${escapeHtml(card.name || card.id)}</div>
      <div class="draft-card-meta">${escapeHtml(card.type || '未知')} · ${escapeHtml(card.rarity || '未知')} · ${card.cost === null ? 'X' : escapeHtml(card.cost ?? '?')} 费</div>
      <p>${escapeHtml(card.description || '正在从 Spire Codex 获取卡牌说明与对局统计。')}</p>
      ${fit}
      ${knowledgeHtml}
      ${pros || cons ? `<ul class="draft-notes">${pros}${cons}</ul>` : ''}
    </article>`;
  }).join('');
  const title = skipPick
    ? '建议跳过这次奖励'
    : rec?.primary?.cardName
      ? `建议拿「${escapeHtml(rec.primary.cardName)}」`
      : '正在结合当前局势分析';
  const reason = rec?.reason || '正在读取卡牌数据、当前牌组、遗物、路线与社区对局统计。';
  const sourceLabel = rec
    ? `${rec.source === 'llm' ? '模型复核' : '规则评分'} · ${rec.knowledgeSource === 'spire-codex' ? 'Spire Codex' : '桥接数据'}`
    : '分析中';
  const context = rec?.context || {};
  const defeatedType = state.reward?.context?.defeatedType;
  return `<div class="draft-layout"><section class="panel draft-offer"><div class="draft-kicker">REWARD / CARD REWARD</div><h2 class="draft-title">${title}</h2><p class="recommendation-reason">${escapeHtml(reason)}</p>${skipPick ? '<div class="skip-advice">跳过也是有效选择：避免弱牌稀释核心循环。</div>' : ''}<div class="draft-cards">${cardHtml}</div></section><section class="panel draft-side"><div class="panel-heading"><span class="panel-title">选牌依据</span><span class="panel-meta">${escapeHtml(sourceLabel)}</span></div><div class="deck-stat"><span>卡组厚度</span><strong>${state.player.cards.length || '--'} 张</strong></div><div class="deck-stat"><span>遗物 / 药水</span><strong>${state.player.relics.length || 0} / ${state.player.potions.length || 0}</strong></div><div class="deck-stat"><span>金币</span><strong>${state.player.gold ?? '--'}</strong></div><div class="deck-stat"><span>当前生命</span><strong>${state.player.hp || '--'} / ${state.player.maxHp || '--'}</strong></div><div class="deck-stat"><span>近期精英</span><strong>${context.eliteSoon ? '有' : '未发现'}</strong></div><div class="deck-stat"><span>确定 Boss</span><strong>${escapeHtml(context.knownBoss || '尚未识别')}</strong></div><div class="deck-stat"><span>接近 Boss</span><strong>${context.bossSoon ? '是' : '否'}</strong></div><div class="deck-stat"><span>刚结束战斗</span><strong>${escapeHtml(defeatedType || '普通战斗')}</strong></div>${context.archetype ? `<div class="archetype-note"><span>当前流派</span><strong>${escapeHtml(context.archetype)}</strong></div>` : ''}<div class="data-empty draft-disclaimer">建议只辅助判断，不会替你点击卡牌。</div></section></div>`;
}

const MAP_TYPE_LABELS = {
  Monster: '战斗',
  Elite: '精英',
  Unknown: '问号',
  Shop: '商店',
  Treasure: '宝箱',
  RestSite: '休息处',
  Boss: 'Boss',
  Ancient: '远古',
  Unassigned: '未分配'
};

function mapTypeLabel(type) {
  return MAP_TYPE_LABELS[type] || type || '未知';
}

function sameRoute(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((id, index) => id === right[index]);
}

function mapNodeClass(type, id) {
  const classes = ['map-node'];
  const rec = state.recommendation?.task === 'map_route' ? state.recommendation : null;
  if (id && id === state.map?.current) classes.push('current');
  if (rec?.primary?.route?.includes(id) && id !== state.map?.current) classes.push('on-route');
  if (id && id === rec?.primary?.targetId) classes.push('recommended');
  if (type === 'Elite') classes.push('elite');
  if (type === 'RestSite') classes.push('rest');
  if (type === 'Boss') classes.push('boss');
  return classes.join(' ');
}

function routeView() {
  const map = state.map || { visited: [], nodes: [], routes: [] };
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const routes = Array.isArray(map.routes) ? map.routes : [];
  const visited = map.visited?.length || 0;
  const typeCounts = nodes.reduce((counts, node) => {
    counts[node.type] = (counts[node.type] || 0) + 1;
    return counts;
  }, {});
  const rows = [...new Set(nodes.map(node => node.row))].sort((a, b) => a - b);
  const mapGrid = rows.length
    ? rows.map(row => {
        const rowNodes = nodes.filter(node => node.row === row).sort((a, b) => a.col - b.col);
        return `<div class="map-rail" style="grid-template-columns: repeat(${Math.max(map.cols || rowNodes.length, 1)}, 1fr)">${rowNodes.map(node => `<div class="${mapNodeClass(node.type, node.id)}" data-node="${node.id}" title="${mapTypeLabel(node.type)} ${node.id}">${mapTypeLabel(node.type).slice(0, 1)}</div>`).join('')}</div>`;
      }).join('')
    : `<div class="data-empty large-empty">${visited ? `已访问 ${visited} 个节点，完整地图尚未到达。` : '打开地图后，这里会显示每个节点的类型和全部可达路线。'}</div>`;
  const rec = state.recommendation?.task === 'map_route' ? state.recommendation : null;
  const orderedRoutes = rec?.primary?.route
    ? [rec.primary.route, ...routes.filter(route => !sameRoute(route, rec.primary.route))]
    : routes;
  const routeList = orderedRoutes.slice(0, 8).map((route, index) => {
    const labels = route.map(id => {
      const node = nodes.find(item => item.id === id);
      return mapTypeLabel(node?.type);
    }).join(' → ');
    const recommended = Boolean(rec && sameRoute(route, rec.primary.route));
    const closeAlternative = Boolean(rec?.uncertainty?.targets?.some(target => target.targetId !== rec.primary?.targetId && route.includes(target.targetId)));
    return `<div class="route-choice${recommended ? ' recommended' : ''}"><strong>${recommended ? '建议路线' : closeAlternative ? '接近备选' : `路线 ${String(index + 1).padStart(2, '0')}`}</strong><span>${escapeHtml(labels)}</span></div>`;
  }).join('');
  const routeTitle = rec?.primary?.displayLabel || rec?.primary?.label;
  const title = routeTitle ? `下一步：${escapeHtml(routeTitle)}` : state.run.currentNode ? mapTypeLabel(state.run.currentNode) : '等待地图状态';
  const reason = rec?.reason ? escapeHtml(rec.reason) : (nodes.length
    ? `本层 ${nodes.length} 个节点，从当前位置出发有 ${routes.length} 条可达 Boss 的路线${map.routesTruncated ? '（已截断）' : ''}。`
    : '启动游戏并打开地图后，这里会显示真实位置和全部路线。');
  const profileRows = rec?.routeProfiles
    ? ['safe', 'balanced', 'growth'].map(profile => {
        const choice = rec.routeProfiles[profile];
        if (!choice) return '';
        const title = profile === 'safe' ? '安全视角' : profile === 'balanced' ? '平衡视角' : '收益视角';
        const active = rec.routeProfiles.active === profile ? ' · 当前采用' : '';
        return `<div class="route-choice${choice.targetId === rec.primary?.targetId ? ' recommended' : ''}"><strong>${title}${active}</strong><span>${escapeHtml(choice.displayLabel)} · 仅比较真实可达路线，不预测伤害</span></div>`;
      }).join('')
    : '';
  const sourceLabel = rec ? (rec.source === 'llm' ? '模型' : '规则') : '等待分析';
  return `<div class="route-layout"><section class="panel map-panel"><div class="panel-heading"><span class="panel-title">当前地图</span><span class="panel-meta">${map.current || state.run.currentCoord || '等待地图数据'}</span></div>${mapGrid}<div class="map-legend"><span>战斗</span><span class="legend-elite">精英</span><span>问号</span><span>商店</span><span class="legend-rest">休息处</span><span class="legend-current">当前位置</span><span class="legend-recommended">建议下一步</span></div></section><section class="panel route-advice"><div class="eyebrow">MAP / ${rec ? 'RECOMMENDATION' : 'LIVE STATE'}</div><h2>${title}</h2><p>${reason}</p>${profileRows}${routeList || `<div class="route-choice"><strong>已访问节点</strong><span>${visited || '--'}</span></div>`}<div class="score-row" style="margin-top:24px"><div class="score-number">${rec ? Math.round((rec.confidence || 0) * 100) : routes.length || '--'}</div><div class="score-copy"><strong>${rec ? `${sourceLabel}置信度` : '可达路线'}</strong><span>${rec ? `还有 ${rec.alternatives?.length || 0} 个备选入口 · 共 ${routes.length} 条可达 Boss 路线${rec.routesTruncated ? '（枚举已截断）' : ''}` : Object.entries(typeCounts).map(([type, count]) => `${mapTypeLabel(type)} ${count}`).join(' · ') || '等待完整地图数据'}</span></div></div></section></div>`;
}

function render() {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
  const copy = {
    combat: ['COMBAT / LIVE STATE', '战斗数据在同步', '出牌顺序先不做。这里只显示真实手牌和敌人，路线建议在地图页。'],
    draft: ['REWARD / CARD REWARD', '这张牌值得拿吗？', '把卡组当前缺口、未来路线和战斗表现放在一起判断。'],
    route: showingEvent()
      ? ['EVENT / CHOICE', state.recommendation?.eventKind === 'ancient' ? '开局选哪个祝福？' : '这个事件选哪项？', '根据牌组、遗物和生命，在可见选项里给出推荐。']
      : showingRest()
      ? ['REST / CAMPFIRE', '回血还是升级？', '根据生命缺口、后续精英和未升级的牌，给出休息处选择。']
      : ['MAP / ACT ' + String(state.run.act || 1).padStart(2, '0'), '下一步往哪里走？', '把战斗风险、卡组成长和遗物收益，压缩成一条可执行的路线。']
  }[state.mode];
  document.querySelector('#page-eyebrow').textContent = copy[0];
  document.querySelector('#page-title').textContent = copy[1];
  document.querySelector('#page-description').textContent = copy[2];
  viewContainer.innerHTML = showingEvent()
    ? eventView()
    : showingRest()
    ? restView()
    : state.mode === 'combat' ? combatView() : state.mode === 'draft' ? draftView() : routeView();
  updateRunSummary();
  document.querySelector('#pause-button').classList.toggle('paused', state.paused);
  bindViewActions();
}

function updateRunSummary() {
  const character = state.run.character || '';
  const name = characterName(character);
  document.querySelector('#character-badge').textContent = name === '等待游戏' ? '?' : name.slice(0, 1);
  document.querySelector('#run-character-name').textContent = name;
  document.querySelector('#run-location').textContent = state.run.act ? `尖塔 · 第 ${state.run.act} 层 · 房间 ${state.run.floor || 0}` : '启动《杀戮尖塔 2》后显示';
  document.querySelector('#run-progress-label').textContent = state.run.act ? `${state.run.floor || 0} / ${state.run.totalFloor || '--'}` : '-- / --';
  document.querySelector('#run-progress-bar').style.width = state.run.act ? `${Math.min(100, ((state.run.floor || 0) / Math.max(1, state.run.totalFloor || 52)) * 100)}%` : '0%';
  document.querySelector('#deck-count').textContent = state.player.cards?.length || '--';
  document.querySelector('#relic-count').textContent = state.player.relics?.length || '--';
  document.querySelector('#gold-count').textContent = state.run.act ? (state.player.gold ?? 0) : '--';
  document.querySelector('#sl-count').textContent = Number.isInteger(state.thisRunSl) ? String(state.thisRunSl) : '--';
}

function bindViewActions() {
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { state.selectedCard = button.dataset.card; render(); showToast(state.mode === 'draft' ? `正在查看「${button.dataset.card}」的拿取分析` : `已查看「${button.dataset.card}」，出牌建议稍后接入`); }));
  document.querySelector('#open-route-view')?.addEventListener('click', () => { state.mode = 'route'; render(); });
  document.querySelector('#confirm-action')?.addEventListener('click', () => showToast('建议已记录，GameBuddy 不会自动操作游戏'));
  document.querySelector('#more-actions')?.addEventListener('click', () => showToast('其他方案将在决策引擎接入后显示'));
  document.querySelectorAll('[data-node]').forEach(button => button.addEventListener('click', () => showToast(`节点 ${button.dataset.node}`)));
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; render(); }));
document.querySelector('#minimize-button').addEventListener('click', () => window.windowControls?.minimize());
document.querySelector('#close-button').addEventListener('click', () => window.windowControls?.close());
document.querySelector('#refresh-button').addEventListener('click', async () => {
  state.syncedAt = Date.now();
  document.querySelector('#last-sync').textContent = '刚刚同步';
  try {
    const result = await window.gamebuddyBridge?.refreshRecommendation?.();
    showToast(result?.ok ? '已根据当前地图给出路线建议' : '已刷新，但还没有可走的下一步');
  } catch {
    showToast('已从游戏数据桥刷新当前局面');
  }
});
document.querySelector('#pause-button').addEventListener('click', () => { state.paused = !state.paused; document.querySelector('#pause-button').classList.toggle('paused', state.paused); document.querySelector('#pause-label').textContent = state.paused ? '已暂停' : '建议中'; render(); });

function setBridgeStatus(status) {
  const phase = typeof status === 'object' ? status.status : status ? 'connected' : 'waiting';
  const replay = phase === 'live' && typeof status === 'object' && status.mode === 'replay';
  const connected = phase === 'live' && !replay;
  const invalid = phase === 'invalid';
  const stale = phase === 'stale';
  const wasLive = state.source === 'bridge' || state.source === 'demo';
  state.source = replay || phase === 'demo' ? 'demo' : connected ? 'bridge' : 'waiting';
  if (wasLive && phase !== 'live' && phase !== 'stale') {
    state.run = { act: 0, floor: 0, totalFloor: 0, room: null, character: '' };
    state.player = { hp: 0, maxHp: 0, block: 0, energy: 0, maxEnergy: 0, gold: 0, cards: [], relics: [], potions: [] };
    state.combat = null;
    state.enemy = null;
    state.hand = [];
    state.reward = null;
    state.selectedCard = '';
    state.recommendation = null;
    state.syncedAt = 0;
    render();
  }
  document.querySelector('.status-indicator').style.background = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-name').textContent = replay || phase === 'demo' ? '回放数据' : connected ? '游戏数据' : invalid ? '数据异常' : stale ? '数据停滞' : phase === 'connecting' ? '正在连接' : phase === 'connected' ? '数据桥已连接' : '等待游戏';
  document.querySelector('#bridge-state').textContent = replay || phase === 'demo' ? 'DEMO' : connected ? 'LIVE' : invalid ? 'ERROR' : stale ? 'STALE' : 'WAIT';
  document.querySelector('#bridge-state').style.color = connected ? 'var(--mint)' : invalid || stale ? 'var(--red)' : 'var(--amber)';
  document.querySelector('#bridge-detail').textContent = connected
    ? '本地 Mod Bridge · 0.4.2'
    : replay
      ? 'Replay Bridge · 127.0.0.1:27182'
    : invalid
      ? `消息未通过校验 · ${status.detail || '未知错误'}`
      : stale
        ? status.detail
      : phase === 'connecting'
        ? '正在等待 127.0.0.1:27182'
        : phase === 'connected'
          ? '等待第一份游戏状态 · 127.0.0.1:27182'
        : phase === 'demo'
          ? 'Replay Bridge · 127.0.0.1:27182'
          : '等待本地 Mod Bridge · 127.0.0.1:27182';
}

function applyBridgeState(next) {
  if (next.run) state.run = { ...state.run, ...next.run };
  if (next.player) state.player = { ...state.player, ...next.player };
  state.map = next.map || { visited: [] };
  state.event = next.event || null;
  if (Object.prototype.hasOwnProperty.call(next, 'reward')) state.reward = next.reward;
  const incomingCombat = next.combat;
  state.combat = incomingCombat ? {
    ...incomingCombat,
    drawPile: incomingCombat.drawPile || [],
    discardPile: incomingCombat.discardPile || [],
    exhaustPile: incomingCombat.exhaustPile || []
  } : null;
  state.enemy = null;
  state.hand = [];
  if (next.combat?.enemies?.[0]) {
    const enemy = next.combat.enemies[0];
    state.enemy = {
      ...state.enemy,
      ...enemy,
      subtitle: enemy.intent === 'AttackIntent' ? '意图：攻击' : enemy.intent === 'DefendIntent' ? '意图：防御' : enemy.intent ? `意图：${enemy.intent}` : '意图未知'
    };
  }
  if (Array.isArray(next.combat?.hand)) {
    state.hand = next.combat.hand.map(card => ({
      ...card,
      skill: card.skill ?? /技能|skill/i.test(card.type || '')
    }));
  }
  state.selectedCard = '';
  if (next.combat) state.reward = null;
  state.syncedAt = Date.now();
  if (atRestSite(next.run, state.combat)) state.mode = 'route';
  if (state.mode === 'combat' || state.mode === 'route' || state.mode === 'draft') render();
}

setInterval(() => {
  if (state.paused) return;
  const seconds = Math.max(0, Math.round((Date.now() - state.syncedAt) / 1000));
  document.querySelector('#last-sync').textContent = seconds < 2 ? '刚刚同步' : `${seconds} 秒前同步`;
}, 1000);

render();
setBridgeStatus({ status: 'waiting' });
function applySlStats(stats) {
  if (!Number.isInteger(stats?.thisRun)) return;
  state.thisRunSl = stats.thisRun;
  const el = document.querySelector('#sl-count');
  if (el) el.textContent = String(stats.thisRun);
}

window.gamebuddyBridge?.onState(applyBridgeState);
window.gamebuddyBridge?.onObservation(observation => applySlStats(observation?.slStats));
window.gamebuddyBridge?.onEvent(event => {
  if (event.name === 'card.reward.opened') {
    state.reward = event.data || null;
    state.mode = 'draft';
    render();
    showToast('发现新的卡牌奖励');
  }
  if (event.name === 'map.opened') {
    state.reward = null;
    if (state.recommendation?.task === 'card_reward' || state.recommendation?.task === 'event_choice') state.recommendation = null;
    state.mode = 'route';
    render();
    showToast('地图已打开；出现分叉时会生成路线建议');
  }
  if (event.name === 'rest.opened') {
    state.mode = 'route';
    render();
    showToast('休息处：回血还是升级');
  }
  if (event.name === 'rest.closed') {
    if (state.recommendation?.task === 'rest_site') state.recommendation = null;
    state.mode = 'route';
    render();
    const action = event.data?.action;
    showToast(action === 'HEAL' ? '已回血，开始看下一步' : action === 'SMITH' ? '已升级，开始看下一步' : '休息处已选完，开始看下一步');
  }
  if (event.name === 'event.opened') {
    state.mode = 'route';
    if (event.data?.title || event.data?.options) {
      state.event = {
        title: event.data.title || state.event?.title || '',
        description: event.data.description || state.event?.description || '',
        kind: event.data.kind || state.event?.kind || 'event',
        options: event.data.options || state.event?.options || []
      };
    }
    render();
    showToast(event.data?.kind === 'ancient' ? '开局祝福：看看选哪个' : '事件选项已出现');
  }
  if (event.name === 'event.closed') {
    if (state.recommendation?.task === 'event_choice') state.recommendation = null;
    state.event = null;
    state.mode = 'route';
    render();
    showToast('事件已选完，开始看下一步');
  }
});
window.gamebuddyBridge?.onRecommendation(recommendation => {
  if (!recommendation) {
    state.recommendation = null;
    if (state.mode === 'route' || state.mode === 'draft') render();
    return;
  }
  if (recommendation.task !== 'map_route' && recommendation.task !== 'rest_site' && recommendation.task !== 'card_reward' && recommendation.task !== 'event_choice') return;
  state.recommendation = recommendation;
  if (recommendation.task === 'rest_site' || recommendation.task === 'event_choice') state.mode = 'route';
  if (recommendation.task === 'card_reward') state.mode = 'draft';
  if (state.mode === 'route' || state.mode === 'draft') render();
});
window.gamebuddyBridge?.onStatus(status => {
  setBridgeStatus(status);
  if (status.status === 'connected') showToast('已连接《杀戮尖塔 2》实时数据');
});
window.gamebuddyBridge?.onSlStats(applySlStats);

function formatLlmLog(entries) {
  if (!entries?.length) return '等待模型请求。系统提示、完整输入 JSON、原始输出会显示在这里。';
  return entries.map(entry => (
    entry.text ? `[GameBuddy LLM] ${entry.label}\n${entry.text}` : `[GameBuddy LLM] ${entry.label}`
  )).join('\n\n');
}

function applyLlmLog(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const body = document.querySelector('#llm-log-body');
  const status = document.querySelector('#llm-log-status');
  if (!body || !status) return;
  body.textContent = formatLlmLog(entries);
  const last = entries[entries.length - 1];
  status.textContent = last ? last.label : '还没有请求';
  body.scrollTop = body.scrollHeight;
}

document.querySelector('#llm-log-copy')?.addEventListener('click', async () => {
  const text = document.querySelector('#llm-log-body')?.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制模型日志');
  } catch {
    showToast('复制失败');
  }
});
document.querySelector('#llm-log-clear')?.addEventListener('click', () => {
  window.gamebuddyBridge?.clearLlmLog();
});
window.gamebuddyBridge?.onLlmLog(applyLlmLog);
