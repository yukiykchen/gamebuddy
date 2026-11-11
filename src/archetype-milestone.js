(function registerArchetypeMilestone(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameBuddyArchetypeMilestone = api;
}(typeof window !== 'undefined' ? window : globalThis, function buildArchetypeMilestone() {
  const ARCHETYPE_ORDER = ['auto_strike', 'exhaust', 'strength', 'block'];
  const ARCHETYPE_LABELS = {
    auto_strike: '自动打击',
    exhaust: '消耗引擎',
    strength: '力量叠加',
    block: '格挡壁垒'
  };
  const AXIS_LABELS = {
    auto_gate: '自动打击核心',
    auto_loop: '抽牌循环',
    auto_ammo: '打击弹药',
    auto_payoff: '打击兑现',
    exhaust_pain: '消耗格挡',
    exhaust_draw: '消耗抽牌',
    exhaust_outlet: '消耗出口',
    exhaust_event: '批量消耗',
    exhaust_payoff: '消耗兑现',
    strength_source: '力量来源',
    strength_multihit: '多段输出',
    strength_balance: '力量攻防',
    block_source: '格挡来源',
    block_gate: '格挡留存',
    block_conversion: '格挡转伤'
  };
  const STAGE_RANK = { unformed: 0, started: 1, formed: 2 };
  const STATUS_RANK = { missing_starter: 0, incomplete_loop: 1, operational: 2, stable: 3 };
  const STATUS_LABELS = {
    missing_starter: '尚缺启动组件',
    incomplete_loop: '已有启动，闭环尚未齐备',
    operational: '可以运转',
    stable: '稳定成型'
  };

  function usesStatus(archetype) {
    return Boolean(archetype && (archetype.beforeStatus || archetype.afterStatus));
  }

  function transitionFor(archetype) {
    if (!archetype || !(archetype.id in ARCHETYPE_LABELS)) return null;
    const before = usesStatus(archetype) ? STATUS_RANK[archetype.beforeStatus] : STAGE_RANK[archetype.beforeStage];
    const after = usesStatus(archetype) ? STATUS_RANK[archetype.afterStatus] : STAGE_RANK[archetype.afterStage];
    if ((after ?? -1) <= (before ?? -1)) return null;
    return {
      id: archetype.id,
      name: ARCHETYPE_LABELS[archetype.id],
      beforeStage: archetype.beforeStage,
      afterStage: archetype.afterStage,
      beforeStatus: archetype.beforeStatus,
      afterStatus: archetype.afterStatus,
      completedAxes: Array.isArray(archetype.completedAxes) ? archetype.completedAxes : [],
      completedFunctions: Array.isArray(archetype.completedFunctions) ? archetype.completedFunctions : []
    };
  }

  function buildFeedback(impact, selection) {
    const transitions = (impact?.archetypes || [])
      .map(transitionFor)
      .filter(Boolean)
      .sort((left, right) => {
        const rank = item => item.afterStatus ? (STATUS_RANK[item.afterStatus] ?? -1) : (STAGE_RANK[item.afterStage] ?? -1);
        return (rank(right) - rank(left)) || ARCHETYPE_ORDER.indexOf(left.id) - ARCHETYPE_ORDER.indexOf(right.id);
      });
    if (!transitions.length) return null;

    if (transitions.some(item => item.afterStatus)) {
      const stable = transitions.some(item => item.afterStatus === 'stable');
      const operational = transitions.some(item => item.afterStatus === 'operational' || item.afterStatus === 'stable');
      const names = transitions.map(item => item.name).join('、');
      const status = stable ? 'stable' : operational ? 'operational' : transitions[0].afterStatus;
      return {
        signature: selection.signature,
        cardId: selection.cardId,
        upgraded: selection.upgraded,
        level: status,
        title: STATUS_LABELS[status],
        message: `${names}：${STATUS_LABELS[status]}。`,
        transitions
      };
    }

    const formed = transitions.some(item => item.afterStage === 'formed');
    const names = transitions.map(item => item.name).join('、');
    const axes = [...new Set(transitions.flatMap(item => item.completedAxes))]
      .map(axis => AXIS_LABELS[axis])
      .filter(Boolean);
    const suffix = formed ? '核心循环完整了' : axes.length ? `${axes.slice(0, 2).join('、')}接上了` : '已经开始运转';
    return {
      signature: selection.signature,
      cardId: selection.cardId,
      upgraded: selection.upgraded,
      level: formed ? 'formed' : 'started',
      title: formed ? '流派成型' : '流派启动',
      message: `${names}：${suffix}。`,
      transitions
    };
  }

  function createArchetypeMilestoneTracker() {
    const impactsBySignature = new Map();
    const confirmed = new Set();
    return {
      cache(message) {
        if (!message?.signature || !Array.isArray(message.impacts)) return;
        impactsBySignature.set(message.signature, new Map(
          message.impacts.map(impact => [String(impact.cardId), impact])
        ));
      },
      confirm(selection) {
        if (!selection?.signature || !selection?.cardId || typeof selection.upgraded !== 'boolean') return null;
        const key = `${selection.signature}\0${selection.cardId}\0${selection.upgraded}`;
        if (confirmed.has(key)) return null;
        confirmed.add(key);
        return buildFeedback(impactsBySignature.get(selection.signature)?.get(String(selection.cardId)), selection);
      },
      clear(signature) {
        impactsBySignature.delete(signature);
      }
    };
  }

  return { ARCHETYPE_ORDER, buildFeedback, createArchetypeMilestoneTracker };
}));
