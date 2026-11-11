(function attachReviewRenderer(globalScope) {
  function createReviewController(options) {
    const root = options.root;
    const toast = options.toast;
    const ui = options.ui;
    const bridge = options.bridge;
    const confirmFn = options.confirm || (message => globalScope.confirm(message));
    const schedule = options.setTimeout || ((fn, delay) => globalScope.setTimeout(fn, delay));
    const cancel = options.clearTimeout || (id => globalScope.clearTimeout(id));
    let dashboard = null;
    let profile = { displayName: '匿名人士' };
    let expandedRunId = null;
    let selectedFloorKey = null;
    const recaps = Object.create(null);
    const details = Object.create(null);
    let dataGeneration = 0;
    let toastTimer;

    function runs() {
      return Array.isArray(dashboard?.recentRuns) ? dashboard.recentRuns : [];
    }

    function retainExpanded() {
      if (expandedRunId == null) return;
      if (!runs().some(run => run.runId === expandedRunId)) expandedRunId = null;
    }

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('show');
      cancel(toastTimer);
      toastTimer = schedule(() => toast.classList.remove('show'), 2300);
    }

    function focusRun(runId) {
      const cards = root.querySelectorAll?.('.review-run-card') || [];
      for (const card of cards) {
        if (card.getAttribute('data-run-id') === runId) {
          card.focus?.();
          return;
        }
      }
    }

    function render(renderOptions = {}) {
      retainExpanded();
      root.innerHTML = ui?.render(dashboard, expandedRunId, profile, recaps, details, selectedFloorKey) || '';
      bindActions();
      if (renderOptions.restoreFocus && expandedRunId) focusRun(expandedRunId);
    }

    function refreshRecap(runId) {
      if (expandedRunId !== runId) return;
      const region = root.querySelector?.('.review-recap');
      if (region && 'outerHTML' in region && ui?.renderRecap) region.outerHTML = ui.renderRecap(recaps[runId], runs().find(run => run.runId === runId));
      else render({ restoreFocus: true });
    }

    function loadRecap(runId) {
      if (runId && (!recaps[runId] || ['retryable', 'cancelled', 'stale', 'unavailable'].includes(recaps[runId].status))) {
        const loading = { status: 'loading' };
        recaps[runId] = loading;
        refreshRecap(runId);
        Promise.resolve(bridge?.getRunRecapPreview ? bridge.getRunRecapPreview(runId) : bridge?.getRunMetrics?.(runId)).then(preview => {
          if (recaps[runId] === loading) {
            if (Array.isArray(preview)) recaps[runId].fixedMetrics = preview;
            else if (preview) Object.assign(recaps[runId], preview, { status: 'loading' });
            if (expandedRunId === runId) refreshRecap(runId);
          }
        }).catch(() => {});
        Promise.resolve(bridge?.getRunRecap?.(runId)).then(recap => {
          if (recaps[runId] !== loading) return;
          recaps[runId] = recap || { status: 'unavailable' };
          if (expandedRunId === runId) refreshRecap(runId);
        }).catch(() => {
          if (recaps[runId] !== loading) return;
          recaps[runId] = { status: 'unavailable' };
          if (expandedRunId === runId) refreshRecap(runId);
        });
      }
    }

    function activateRun(runId) {
      if (!runId) return;
      expandedRunId = expandedRunId === runId ? null : runId;
      selectedFloorKey = null;
      render({ restoreFocus: true });
      if (expandedRunId) { loadRecap(runId); loadDetails(runId); }
    }

    function loadDetails(runId) {
      if (!bridge?.getRunDetails || (details[runId] && details[runId].status !== 'unavailable')) return;
      const generation = dataGeneration;
      details[runId] = { status: 'loading' };
      Promise.resolve().then(() => bridge.getRunDetails(runId)).then(result => {
        if (generation !== dataGeneration) return;
        details[runId] = result || { status: 'unavailable' };
        refreshDetails(runId);
      }).catch(() => {
        if (generation !== dataGeneration) return;
        details[runId] = { status: 'unavailable' };
        refreshDetails(runId);
      });
    }

    function refreshDetails(runId) {
      if (expandedRunId !== runId) return;
      const region = root.querySelector?.('.review-run-details');
      if (region && 'outerHTML' in region && globalScope.GameBuddyRunDetailsUi) {
        region.outerHTML = globalScope.GameBuddyRunDetailsUi.render(details[runId], runs().find(run => run.runId === runId), selectedFloorKey);
      }
    }

    function runCardFromEvent(event) {
      const list = event.currentTarget;
      const card = event.target?.closest?.('.review-run-card');
      if (!card || !list?.contains(card)) return null;
      return card;
    }

    function onRunListClick(event) {
      const card = runCardFromEvent(event);
      if (!card) return;
      activateRun(card.getAttribute('data-run-id'));
    }

    function onRunListKeydown(event) {
      if (event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      const card = runCardFromEvent(event);
      if (!card || event.target !== card) return;
      event.preventDefault();
      activateRun(card.getAttribute('data-run-id'));
    }

    function bindActions() {
      root.querySelector('#review-name-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const input = root.querySelector('#review-display-name');
        const typed = String(input?.value || '').trim().slice(0, 16) || '匿名人士';
        const result = await bridge?.savePlayerProfile?.(typed);
        profile = { displayName: result?.displayName || typed };
        render();
        showToast(`榜上名称已保存：${profile.displayName}`);
      });
      root.querySelector('#review-export')?.addEventListener('click', async () => {
        const result = await bridge?.exportReview?.();
        showToast(result?.ok ? '个人数据已导出' : '已取消导出');
      });
      root.querySelector('#review-clear')?.addEventListener('click', async () => {
        if (!confirmFn('确认清空本机全部个人数据？此操作不能撤销。')) return;
        const token = await bridge?.requestReviewClear?.();
        const result = await bridge?.clearReview?.(token);
        if (!result?.ok) {
          showToast('清空失败，请重试');
          return;
        }
        expandedRunId = null;
        selectedFloorKey = null;
        dataGeneration++;
        for (const key of Object.keys(recaps)) delete recaps[key];
        for (const key of Object.keys(details)) delete details[key];
        dashboard = result.dashboard;
        render();
        showToast('本机个人数据已清空');
      });
      const list = root.querySelector('.review-run-list');
      list?.addEventListener('click', onRunListClick);
      list?.addEventListener('keydown', onRunListKeydown);
      list?.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-floor-key]');
        if (!button || !list.contains(button)) return;
        const key = button.getAttribute('data-floor-key');
        const floor = details[expandedRunId]?.acts?.flatMap(act => act.floors).find(floor => floor.key === key);
        const panel = root.querySelector('.rd-selected-floor');
        if (!floor || !panel) return;
        selectedFloorKey = selectedFloorKey === key ? null : key;
        panel.outerHTML = globalScope.GameBuddyRunDetailsUi.renderSelectedFloor(selectedFloorKey ? floor : null);
        for (const node of root.querySelectorAll('[data-floor-key]')) {
          const selected = node.getAttribute('data-floor-key') === selectedFloorKey;
          node.setAttribute('aria-expanded', String(selected));
          node.classList.toggle('is-selected', selected);
        }
      });
    }

    function setDashboard(nextDashboard) {
      const previousRuns = new Map(runs().map(run => [run.runId, run]));
      dashboard = nextDashboard;
      selectedFloorKey = null;
      dataGeneration++;
      const currentRuns = new Map(runs().map(run => [run.runId, run]));
      for (const runId of Object.keys(recaps)) {
        if (!currentRuns.has(runId) || currentRuns.get(runId).endedAt !== previousRuns.get(runId)?.endedAt) delete recaps[runId];
      }
      for (const key of Object.keys(details)) delete details[key];
      render();
      if (expandedRunId) { loadRecap(expandedRunId); loadDetails(expandedRunId); }
    }

    function setProfile(nextProfile) {
      profile = { displayName: nextProfile?.displayName || '匿名人士' };
    }

    return {
      setDashboard,
      setProfile,
      activateRun,
      getExpandedRunId: () => expandedRunId
    };
  }

  globalScope.GameBuddyReviewRenderer = { createReviewController };

  const documentRef = globalScope.document;
  const root = documentRef?.querySelector?.('#review-root');
  if (!root) return;

  const controller = createReviewController({
    root,
    toast: documentRef.querySelector('#toast'),
    ui: globalScope.GameBuddyReviewUi,
    bridge: globalScope.gamebuddyBridge,
    confirm: message => globalScope.confirm(message)
  });

    async function loadDashboard() {
    let dashboard;
    try {
      dashboard = await globalScope.gamebuddyBridge?.getReviewDashboard?.();
    } catch {
      dashboard = { recoveryWarning: '个人数据暂时无法读取，请关闭窗口后重试。' };
    }
    try {
      const saved = await globalScope.gamebuddyBridge?.getPlayerProfile?.();
      if (saved?.displayName) controller.setProfile(saved);
    } catch {
      // 名称读取失败时保留默认匿名人士。
    }
    controller.setDashboard(dashboard);
  }

  documentRef.querySelector('#minimize-button')?.addEventListener('click', () => globalScope.windowControls?.minimize());
  documentRef.querySelector('#close-button')?.addEventListener('click', () => globalScope.windowControls?.close());
  globalScope.gamebuddyBridge?.onReviewChanged(nextDashboard => {
    controller.setDashboard(nextDashboard);
  });
  void loadDashboard();
})(typeof window !== 'undefined' ? window : globalThis);
