(function attachReviewUi(globalScope) {
  const CHARACTER_NAMES = {
    ironclad: '铁甲战士',
    silent: '静默猎手',
    defect: '故障机器人',
    regent: '统御者',
    necrobinder: '死灵法师'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function characterName(id) {
    return CHARACTER_NAMES[String(id || '').toLowerCase()] || id || '等待第一局';
  }

  function characterImage(id) {
    const safe = Object.prototype.hasOwnProperty.call(CHARACTER_NAMES, id) ? id : 'ironclad';
    return `./assets/pets/${safe}/advising.png`;
  }

  function point(index, radius, center = 160) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
  }

  function pointsForRadius(radius) {
    return Array.from({ length: 5 }, (_, index) => point(index, radius).map(value => value.toFixed(1)).join(',')).join(' ');
  }

  function radar(dashboard) {
    const axes = dashboard.axes || [];
    const enough = dashboard.sampleSize >= 3;
    const complete = enough && axes.length === 5 && axes.every(axis => Number.isFinite(axis.value));
    const missing=axes.filter(axis=>!Number.isFinite(axis.value)).map(axis=>axis.label);
    const pending=enough ? `已记录 ${dashboard.sampleSize} 局，等待${missing.length?escapeHtml(missing.join('、')):'更多行为'}数据`
      : dashboard.sampleSize ? `再完成 ${Math.max(0, 3-dashboard.sampleSize)} 局即可生成五星图` : '完成对局后生成五星图';
    const valuePoints = complete
      ? axes.map((axis, index) => point(index, 115 * Math.max(0, Math.min(100, axis.value)) / 100).map(value => value.toFixed(1)).join(',')).join(' ')
      : '';
    const labels = axes.map((axis, index) => {
      const [x, y] = point(index, 145);
      const anchor = x < 125 ? 'end' : x > 195 ? 'start' : 'middle';
      const value = Number.isFinite(axis.value) ? `${Math.round(axis.value)}` : '暂无';
      return `<text class="review-radar-label" x="${x}" y="${y}" text-anchor="${anchor}">
        <tspan x="${x}" dy="0">${escapeHtml(axis.label)}</tspan>
        <tspan class="review-radar-value" x="${x}" dy="17">${value}</tspan>
      </text>`;
    }).join('');
    return `
      <div class="review-radar-wrap">
        <svg class="review-radar" viewBox="0 0 320 320" role="img" aria-label="玩家最近对局的五星玩法倾向">
          ${[23, 46, 69, 92, 115].map(radius => `<polygon class="review-radar-grid" points="${pointsForRadius(radius)}"></polygon>`).join('')}
          ${Array.from({ length: 5 }, (_, index) => {
            const [x, y] = point(index, 115);
            return `<line class="review-radar-axis" x1="160" y1="160" x2="${x}" y2="${y}"></line>`;
          }).join('')}
          ${complete ? `<polygon class="review-radar-data" points="${valuePoints}"></polygon>` : ''}
          ${labels}
        </svg>
        ${complete ? '' : `<div class="review-radar-empty">${pending}</div>`}
      </div>`;
  }

  function statRows(stats) {
    return (stats || []).map(stat => {
      if(stat.kind==='count')return `<div class="review-stat-row review-stat-count-row"><div class="review-stat-copy"><strong>${escapeHtml(stat.label)}</strong><span>最近 ${stat.sampleSize ?? 0} 局</span></div><span class="review-streak-rule" aria-hidden="true"></span><b>${Math.max(0,Math.round(Number(stat.value)||0))}<small> 连胜</small></b></div>`;
      const known = Number.isFinite(stat.value);
      const detail = stat.id === 'progress'
        ? (known ? `均值 · ${stat.denominator}局` : '暂无')
        : (stat.denominator > 0 ? `${stat.numerator}/${stat.denominator}` : '暂无');
      return `
        <div class="review-stat-row">
          <div class="review-stat-copy"><strong>${escapeHtml(stat.label)}</strong><span>${detail}</span></div>
          <div class="review-stat-track" aria-label="${escapeHtml(stat.label)} ${known ? `${Math.round(stat.value)}%` : '暂无'}">
            <span style="width:${known ? Math.max(2, Math.min(100, stat.value)) : 0}%"></span>
          </div>
          <b>${known ? `${Math.round(stat.value)}%` : '--'}</b>
        </div>`;
    }).join('');
  }

  function resultLabel(result) {
    if (result === 'win') return ['通关', 'win'];
    if (result === 'abandoned') return ['放弃', 'abandoned'];
    return result === 'loss' ? ['未通关', 'loss'] : ['结果未知', 'unknown'];
  }

  function renderRecap(recap, run = {}) {
    const labels = ['累计输出', '实际抗伤', '累计受伤', '实际恢复'];
    const metrics = labels.map(label => recap?.battleMetrics?.find(metric => metric.label === label) || { label, display: '未记录' });
    const summary = recap?.runSummary || {}, character = summary.character || run.character;
    const [result, resultClass] = resultLabel(summary.result || run.result);
    const meta = [character ? characterName(character) : '',
      Number.isInteger(summary.ascension) ? `进阶 ${summary.ascension}` : '',
      Number.isFinite(summary.totalFloor ?? run.floor) ? `到达第 ${summary.totalFloor ?? run.floor} 层` : '',
      Number.isInteger(summary.act) && Number.isInteger(summary.floor) ? `第 ${summary.act} 幕 · 第 ${summary.floor} 层` : ''].filter(Boolean);
    const records = (recap?.fixedMetrics || []).filter(metric => metric.label !== '实际抗伤'
      && metric.display && metric.display !== '未记录');
    const status = recap?.status === 'loading' ? '正在寻找更多值得回味的片段…'
      : recap?.status === 'unavailable' ? '本局记录暂时无法读取'
        : recap?.cards?.length ? '' : recap?.coverageNote || '本局暂无值得回味的片段';
    return `<section class="review-recap" aria-label="本局复盘">
      <header class="review-recap-heading">
        <div><span class="review-recap-eyebrow">TALES FROM THE SPIRE</span><h3>本局复盘</h3></div>
        <span class="review-recap-result ${resultClass}">${escapeHtml(result)}</span>
      </header>
      ${recap?.portrait ? `<p class="review-recap-portrait">${escapeHtml(recap.portrait)}</p>` : ''}
      <div class="review-recap-meta">${meta.map(text => `<span>${escapeHtml(text)}</span>`).join('')}</div>
      <p class="review-recap-duration">${escapeHtml(summary.durationLabel || '记录覆盖')}<strong>${escapeHtml(summary.durationDisplay || '未记录')}</strong></p>
      <div class="review-recap-metrics">${metrics.map((metric, index) => `<div${metric.display === '未记录' ? ' class="is-unknown"' : ''}><span class="review-recap-metric-label"><i aria-hidden="true">${['攻', '御', '伤', '愈'][index]}</i>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.display)}</strong></div>`).join('')}</div>
      ${recap?.choiceStats?.length ? `<div class="review-recap-choices"><span>已记录选择</span>${recap.choiceStats.map(stat => `<span>${escapeHtml(stat.label)} <b>${escapeHtml(stat.display)}</b></span>`).join('')}</div>` : ''}
      ${records.length ? `<div class="review-recap-records">${records.map(metric => `<span>${escapeHtml(metric.label)} <b>${escapeHtml(metric.display)}</b></span>`).join('')}</div>` : ''}
      <div class="review-recap-cards">${(recap?.cards || []).map((card, index) => `<article><span class="review-recap-card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><h4>${escapeHtml(card.title)}</h4><p>${escapeHtml(card.body)}</p></article>`).join('')}</div>
      ${recap?.closing ? `<p class="review-recap-closing"><span>这局怎么说</span>${escapeHtml(recap.closing)}</p>` : ''}
      ${status ? `<p class="review-recap-status" role="status">${escapeHtml(status)}</p>` : ''}
      ${recap?.cards?.length && metrics.some(m => m.display === '未记录') ? '<p class="review-recap-footnote">部分累计战况未记录，已保留可确认的故事。</p>' : ''}
    </section>`;
  }

  function runBuild(run, panelId, recap, details) {
    return `
      <div class="review-run-build" id="${panelId}" role="region" aria-label="本局复盘与单局详情" data-run-id="${escapeHtml(run.runId)}">
        ${renderRecap(recap, run)}
        ${globalScope.GameBuddyRunDetailsUi.render(details, run)}
      </div>`;
  }

  function recentRuns(runs, expandedRunId = null, recaps = {}, details = {}) {
    if (!runs?.length) {
      return `<div class="review-no-runs"><strong>还没有本地对局记录</strong><span>开始一局《杀戮尖塔 2》，GameBuddy 会自动记录到这里。</span></div>`;
    }
    return runs.map((run, index) => {
      const [label, className] = resultLabel(run.result);
      const panelId = `review-run-build-${index}`;
      const expanded = expandedRunId != null && run.runId === expandedRunId;
      return `
        <div class="review-run-entry">
          <div class="review-run-card${expanded ? ' is-expanded' : ''}" role="button" tabindex="0" data-run-id="${escapeHtml(run.runId)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${panelId}">
            <img src="${characterImage(run.character)}" alt="" />
            <div class="review-run-character"><strong>${escapeHtml(characterName(run.character))}</strong><span class="review-result ${className}">${label}</span></div>
            <div><span>${run.encounterKind === 'killer' ? '死于' : '关底 BOSS'}</span><strong>${escapeHtml(run.bossName || '未知')}</strong></div>
            <div><span>最终楼层</span><strong>${Number.isFinite(run.floor) ? `${run.floor} 层` : '未知'}</strong></div>
            <div><span>最高单回合伤害</span><strong>${Number.isFinite(run.maxTurnDamage) ? run.maxTurnDamage : '未知'}</strong></div>
          </div>
          ${expanded ? runBuild(run, panelId, recaps[run.runId], details[run.runId]) : ''}
        </div>`;
    }).join('');
  }

  function render(dashboard, expandedRunId = null, profile = null, recaps = {}, details = {}) {
    const displayName = profile?.displayName || '匿名人士';
    const safe = dashboard || { window: {}, axes: [], stats: [], recentRuns: [] };
    const character = safe.mainCharacter || 'ironclad';
    return `
      <section class="review-page" aria-label="个人数据">
        <div class="review-pattern" aria-hidden="true"></div>
        <header class="review-header">
          <div class="review-score-pill">
            <span class="review-score-number">${safe.window?.wins || 0}</span>
            <span class="review-score-copy">胜局<small>/ ${safe.window?.wins + safe.window?.losses || 0} 局有结果</small></span>
            ${safe.window?.abandoned ? `<span class="review-abandoned-count">放弃 ${safe.window.abandoned} 局</span>` : ''}
          </div>
          <div class="review-brand"><strong>GAMEBUDDY</strong><span>个人数据</span></div>
          <div class="review-identity">
            <form class="review-name" id="review-name-form">
              <label for="review-display-name">榜上名称</label>
              <input id="review-display-name" name="displayName" maxlength="16" value="${escapeHtml(displayName)}" autocomplete="nickname">
              <button type="submit">保存</button>
            </form>
            <div class="review-actions">
              <span>记录保存在本机；生成复盘时，本局必要片段会发送至已配置的模型服务</span>
              <button type="button" id="review-export">导出</button>
              <button type="button" id="review-clear">清空</button>
            </div>
          </div>
        </header>

        ${safe.recoveryWarning ? `<div class="review-warning">${escapeHtml(safe.recoveryWarning)}</div>` : ''}

        <div class="review-hero">
          <section class="review-character-panel">
            <div class="review-ribbon"><span>MAIN CHARACTER</span><strong>主角色</strong></div>
            <div class="review-character-stage">
              <div class="review-character-name"><span>最近 50 局最常使用</span><strong>${escapeHtml(characterName(safe.mainCharacter))}</strong></div>
              <img src="${characterImage(character)}" alt="${escapeHtml(characterName(safe.mainCharacter))}" />
              <div class="review-character-shadow"></div>
              <div class="review-character-stamp">${safe.mainCharacterSampleSize ?? safe.sampleSize ?? 0}<small>局使用</small></div>
            </div>
          </section>

          <section class="review-data-panel">
            <div class="review-ribbon right"><span>PLAY STYLE</span><strong>玩法五星图</strong></div>
            <div class="review-radar-card">${radar(safe)}<span class="review-radar-scope">全角色 · 最近 ${safe.sampleSize || 0} 局</span></div>
            <div class="review-ribbon compact"><span>RECENT MATCHES</span><strong>最近的 50 场对局</strong></div>
            <div class="review-stats">${statRows(safe.stats)}</div>
          </section>
        </div>

        <section class="review-history">
          <div class="review-history-heading"><strong>最近游戏记录</strong><span>角色 · 通关状态 · BOSS · 楼层 · 单回合伤害</span></div>
          <div class="review-run-list">${recentRuns(safe.recentRuns, expandedRunId, recaps, details)}</div>
        </section>
      </section>`;
  }

  globalScope.GameBuddyReviewUi = { render, renderRecap, characterName, pointsForRadius };
})(window);
