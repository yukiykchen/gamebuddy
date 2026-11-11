'use strict';
const STRATEGY_REVIEW = '先阅读strategyContext中每套套路的目标、启动、循环、收尾、依赖机制、补强优先级、例外及evidence。只把established视为明确路线，tentative只是方向。网站核心/辅助名单不是拿牌白名单；根据完整牌面与对象/事件/资源判断是否破坏配合。buildPolicy.blocked=true的候选或包含此类商品的清单不得选择，只能返回allowedIndexes；forcedRiskChoice=true表示无法跳过且所有候选有风险，必须明确代价。条件冲突不等于完全不能用，要说明牌序、终结用途或标明的生存/混合路线取舍。不得声称手牌变化永久改写整副牌，不得把单张巨石当成变牌效果，不得把不在核心清单当作冲突；不得推荐删掉被保护的核心或打击供给。';
// 普通推荐可继续使用自己的相对评分，机制约束负责决定哪些结果不可无条件推荐。
function cardDecisionPool(candidates) {
  const allowed = candidates.map((c,index)=>({c,index})).filter(({c})=>c.action==='SKIP'||!c.card?.buildPolicy?.blocked).map(({index})=>index);
  // 不可跳过且所有选项都有已确认风险时，仍必须提供一个明确标注代价的结果。
  return { allowedIndexes:allowed.length?allowed:candidates.map((_,i)=>i), forced:allowed.length===0 };
}
function riskNote(policy) {
  if(!policy?.conflicts?.length)return '';
  const reasons=[...new Set(policy.conflicts.map(c=>`${c.systemName}：${c.reason}`))].slice(0,2);
  const advice=policy.exception==='survival_tradeoff'?'当前生命吃紧，属于有代价的应急取舍。'
    :policy.exception==='mixed_route_tradeoff'?'这是混合路线取舍，不代表对原路线没有代价。':policy.conflicts[0].advice;
  return `${reasons.join('；')} ${advice}`;
}
function cardDecisionReason(chosen,candidates,baseReason,forced=false) {
  if(chosen.action==='SKIP'){
    const avoid=candidates.find(c=>c.card?.buildPolicy?.blocked)?.card?.buildPolicy;
    return avoid?`建议跳过本次不合适的补强。${riskNote(avoid)}`:baseReason;
  }
  const policy=chosen.card?.buildPolicy;
  if(!policy?.conflicts?.length)return baseReason;
  // 风险牌采用可核实的固定说明，不能让模型一句“完全适合”覆盖风险。
  return `${forced?'本次不能跳过，需在有风险的候选中取舍。':`选择「${chosen.card.name}」需要接受以下代价。`}${riskNote(policy)}`;
}
function planAllowed(plan) { return plan.items.every(item=>!item.analysis?.buildPolicy?.blocked); }
function planDecisionReason(plan,baseReason) {
  const notes=plan.items.map(item=>riskNote(item.analysis?.buildPolicy)).filter(Boolean);
  return notes.length?`本次清单包含有条件的选择。${[...new Set(notes)].join(' ')}`:baseReason;
}
module.exports={STRATEGY_REVIEW,cardDecisionPool,cardDecisionReason,riskNote,planAllowed,planDecisionReason};
