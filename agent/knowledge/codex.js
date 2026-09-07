const NODE_TYPE_NOTES = {
  Monster: '普通战斗：风险一般，用来稳定拿牌。',
  Elite: '精英：有遗物和更好的卡牌奖励，是地图上最强单点收益之一；残血时风险可能盖过遗物。',
  Unknown: '问号：可能是事件、战斗、商店或宝藏，走进去之前无法揭示。',
  Shop: '商店：删起手牌、买牌或买遗物来提高战斗力。金币不够时收益很小。',
  Treasure: '宝箱：几乎总是正收益，优先经过。',
  RestSite: '火堆：可以回血，也可以敲升级。生命健康时升级仍然值钱。',
  Boss: '本层 Boss，路线终点。',
  Ancient: '远古节点：通常有独特收益，值得评估是否绕路。',
  Unassigned: '尚未分配类型的节点。'
};

function describeNodeType(type) {
  return NODE_TYPE_NOTES[type] || type || '未知节点';
}

module.exports = { NODE_TYPE_NOTES, describeNodeType };
