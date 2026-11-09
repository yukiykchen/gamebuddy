(function attachRunDetailsUi(globalScope) {
  'use strict';
  const ROOT = './assets/run-details/';
  const names = { ironclad: '铁甲战士', silent: '静默猎手', defect: '故障机器人', regent: '统御者', necrobinder: '死灵法师' };
  const colors = { ironclad: '#d62000', silent: '#5ebd00', defect: '#3eb3ed', regent: '#e36600', necrobinder: '#cd4eed' };
  const rarity = { Basic: '#9c9c9c', Common: '#9c9c9c', Uncommon: '#64ffff', Rare: '#ffda36', Curse: '#e669ff' };
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const known = value => typeof value === 'number' && Number.isFinite(value);
  const format = value => known(value) ? String(value) : '未记录';
  const roomImage = kind => ['monster', 'elite', 'event', 'shop', 'rest_site', 'treasure'].includes(kind) ? `${ROOT}rooms/${kind}.webp`
    : null;
  const roomSymbol = kind => kind === 'boss' ? '♛' : '?';
  function icon(src, className = '') { return src ? `<img class="${className}" src="${escape(src)}" alt="" loading="lazy">` : ''; }
  function cardImage(card) {
    if (card.image) return `<span class="rd-card-art is-face" aria-hidden="true">${icon(card.image, 'rd-card-face')}</span>`;
    const type = /attack|攻击/i.test(card.type) ? 'attack' : /power|能力/i.test(card.type) ? 'power' : 'skill';
    return `<span class="rd-card-art" style="--rd-pool:${colors[card.color] || '#a3a3a3'};--rd-rarity:${rarity[card.rarity] || '#9c9c9c'}" aria-hidden="true"><i class="rd-card-back"></i>${icon(`${ROOT}cards/desc_box.png`, 'rd-card-desc')}${icon(`${ROOT}cards/${type}_portrait_shadow.png`, 'rd-card-shadow')}${icon(`${ROOT}cards/${type}_portrait.png`, 'rd-card-portrait')}<i class="rd-card-banner"></i></span>`;
  }
  function collections(title, entries, family) {
    const card = family === 'cards', unit = card ? '张' : family === 'relics' ? '件' : '瓶';
    const count = entries?.reduce((n, entry) => n + (entry.count || 1), 0);
    return `<section class="rd-collection"><h4>${title}${entries ? `<small>${count} ${unit}</small>` : ''}</h4>
      ${!Array.isArray(entries) ? '<p class="rd-empty">旧记录未包含此数据</p>' : !entries.length
        ? `<p class="rd-empty">本局没有记录到${card ? '牌组' : family === 'relics' ? '遗物' : '药水'}</p>`
        : `<div class="rd-items ${card ? 'rd-deck' : 'rd-inventory'}">${entries.map((entry, index) => {
          const tipId = `rd-${family}-tip-${index}`;
          return `<div class="rd-item ${card ? 'review-card-chip' : 'review-relic-badge'}${entry.upgraded ? ' is-upgraded' : ''}" tabindex="0" aria-describedby="${tipId}">
          ${card ? cardImage(entry) : icon(entry.image, 'rd-inventory-art')}<span class="rd-item-name">${escape(entry.name || entry.id || '未知')}${entry.upgraded && !String(entry.name).endsWith('+') ? '<span class="review-card-upgrade" aria-label="已升级">+</span>' : entry.upgraded ? '<span class="review-card-upgrade sr-only" aria-label="已升级">+</span>' : ''}${entry.count > 1 ? `<b>×${entry.count}</b>` : ''}</span>
          <span id="${tipId}" class="rd-tooltip" role="tooltip"><strong>${escape(entry.name || entry.id)}</strong>${card ? `<small>${entry.cost != null && Number(entry.cost) >= 0 ? `${escape(entry.cost)} 费 · ` : ''}${escape(({ Attack: '攻击', Skill: '技能', Power: '能力' })[entry.type] || entry.type || '卡牌')}</small>` : ''}<span>${escape(entry.description || '效果未记录')}</span>${entry.variant ? `<em>${escape(entry.variant)}</em>` : ''}${family === 'relics' ? `<small>${entry.acquiredAt ? `已记录获得 · 第${entry.acquiredAt.act}幕第${entry.acquiredAt.floor}层` : '获取楼层未记录'}</small>` : ''}</span></div>`;
        }).join('')}</div>`}</section>`;
  }
  function floorMarkup(floor) {
    const hp = known(floor.hpAfter) ? `${floor.hpAfter}${known(floor.maxHp) ? `/${floor.maxHp}` : ''}` : '未记录';
    const change = (before, after) => known(before) && known(after) && before !== after ? `${before} → ${after}` : format(after);
    return `<details class="rd-floor" id="rd-floor-${escape(floor.key)}"><summary>
      <span class="rd-floor-number">${floor.floor}<small>层</small></span><span class="rd-floor-icon">${icon(roomImage(floor.kind)) || roomSymbol(floor.kind)}</span>
      <span class="rd-floor-title"><strong>${escape(floor.title)}</strong><small>${escape(floor.label)}</small></span>
      <span class="rd-floor-hp">${escape(hp)}<small>生命</small></span><span class="rd-disclosure" aria-hidden="true">⌄</span></summary>
      <div class="rd-floor-body"><div class="rd-floor-resources"><span>生命 <b>${escape(change(floor.hpBefore, floor.hpAfter))}${known(floor.maxHp) ? ` / ${floor.maxHp}` : ''}</b></span><span>金币 <b>${escape(change(floor.goldBefore, floor.goldAfter))}</b></span></div>
      ${floor.combats.map(combat => `<div class="rd-history-row"><span>战斗</span><div><strong>${escape(combat.enemies)}</strong><small>${combat.turns ? `已记录 ${combat.turns} 个玩家回合` : '回合数未记录'}${combat.outcome ? ` · ${escape(combat.outcome)}` : ''}</small></div></div>`).join('')}
      ${floor.rows.map(row => `<div class="rd-history-row"><span>${escape(row.label)}</span><div><strong>${escape(row.text)}</strong>${row.detail ? `<small>${escape(row.detail)}</small>` : ''}</div></div>`).join('')}
      ${!floor.combats.length && !floor.rows.length ? '<p class="rd-empty">这一层没有留下具体选择。</p>' : ''}</div></details>`;
  }
  function render(details, run = {}) {
    const s = details?.summary || { character: String(run.character || '').toLowerCase(), result: run.result, floor: run.floor };
    const result = ({ win: '通关', loss: '未通关', abandoned: '放弃' })[s.result] || '结果未记录';
    const duration = known(s.durationSeconds) ? `${Math.floor(s.durationSeconds / 60)}分${Math.floor(s.durationSeconds % 60)}秒` : '未记录';
    const stats = [['top_bar_heart', '终局生命', known(s.hp) ? `${s.hp}/${format(s.maxHp)}` : '未记录'],
      ['top_bar_gold', '终局金币', format(s.gold)], ['top_bar_map', '到达楼层', format(s.floor)],
      ['timer_icon', '记录时长', duration], ['top_bar_ascension', '进阶', format(s.ascension)]];
    const fallback = (items) => items?.map(item => ({ ...item, count: 1 }));
    const loaded = details?.status === 'ready';
    return `<section class="review-run-details" aria-label="单局详情" data-status="${escape(details?.status || 'loading')}">
      <header class="rd-header"><div><span>RUN ARCHIVE</span><h3>单局详情</h3></div><span class="rd-result ${escape(s.result || 'unknown')}">${result}</span></header>
      <div class="rd-character">${names[s.character] ? icon(s.character === 'ironclad' ? `${ROOT}characters/ironclad.webp` : `./assets/pets/${s.character}/advising.png`, 'rd-character-icon') : ''}<strong>${escape(names[s.character] || s.character || '角色未记录')}</strong>${s.lastEncounter ? `<span>最后遭遇 · ${escape(s.lastEncounter)}</span>` : ''}${known(s.endedAt) ? `<time>${escape(new Date(s.endedAt).toLocaleString('zh-CN'))}</time>` : ''}</div>
      <div class="rd-stats">${stats.map(([image, label, value]) => `<div>${icon(`${ROOT}stats/${image}.webp`)}<span><small>${label}</small><strong>${escape(value)}</strong></span></div>`).join('')}</div>
      ${s.gameMode || (known(s.act) && known(s.localFloor)) ? `<p class="rd-mode">${[s.gameMode, known(s.act) && known(s.localFloor) ? `终点 · 第${s.act}幕第${s.localFloor}层` : ''].filter(Boolean).map(escape).join(' · ')}</p>` : ''}
      ${details?.acts?.length ? `<section class="rd-route"><h4>登塔路线<small>点击节点查看这一层</small></h4>${details.acts.map(act => `<div class="rd-act-route"><b>第 ${act.act} 幕</b><div>${act.floors.map(floor => `<button type="button" data-floor-target="rd-floor-${escape(floor.key)}" aria-label="第${act.act}幕第${floor.floor}层 ${escape(floor.title)}" title="${escape(floor.title)}">${icon(roomImage(floor.kind)) || `<span>${roomSymbol(floor.kind)}</span>`}<small>${floor.floor}</small></button>`).join('')}</div></div>`).join('')}</section>` : ''}
      ${collections('终局遗物', loaded ? details.relics : fallback(run.relics), 'relics')}
      ${collections('终局牌组', loaded ? details.deck : fallback(run.deck), 'cards')}
      ${details?.potions ? collections('终局药水', details.potions, 'potions') : ''}
      <section class="rd-history"><h4>逐层履历<small>${details?.acts?.reduce((n, act) => n + act.floors.length, 0) || 0} 个已记录楼层</small></h4>
      ${details?.acts?.length ? details.acts.map(act => `<div class="rd-history-act"><h5>第 ${act.act} 幕</h5>${act.floors.map(floorMarkup).join('')}</div>`).join('')
        : `<p class="rd-empty" role="status">${details?.status === 'unavailable' ? '本局详情暂时无法读取，重新打开可重试。' : details ? '旧记录没有留下逐层信息。' : '正在整理本局记录…'}</p>`}</section>
      <p class="rd-footnote">${escape(details?.coverageNote || '仅展示实际留下的记录。')}</p></section>`;
  }
  globalScope.GameBuddyRunDetailsUi = { render };
})(window);
