function stripMarkup(value) {
  return String(value || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function cardSearchText(card) {
  const evaluation = card?.evaluation?.advice || card?.evaluation || {};
  return stripMarkup([
    card?.description,
    card?.description_raw,
    card?.upgrade_description,
    card?.upgradeDescription,
    card?.text,
    evaluation.description,
    ...(card?.keywords_key || []),
    ...(card?.keywords || [])
  ].filter(Boolean).join(' ')).toLowerCase();
}

function generatesNamedStatus(text) {
  const source = String(text || '').toLowerCase();
  return /(将.{0,8})?(伤口|灼伤|眩晕|黏液).{0,16}(加入|洗入)|(加入|洗入).{0,16}(伤口|灼伤|眩晕|黏液)/.test(source)
    || /add .{0,24}(wound|burn|dazed|slime)|shuffle .{0,24}(wound|burn)/.test(source);
}

function mentionsStatus(text) {
  return /状态牌|伤口|灼伤|眩晕|黏液|\bwound\b|\bburn\b|\bdazed\b|slimed|\bstatus/.test(String(text || '').toLowerCase());
}

function isStatusGenerationTrigger(text) {
  return /每当你生成状态牌|生成状态牌的时候|生成状态牌时|抽到状态牌|whenever you.{0,32}status/.test(String(text || '').toLowerCase());
}

function statusTagsFromText(text) {
  const tags = [];
  if (!mentionsStatus(text)) return tags;
  tags.push('status');
  if (generatesNamedStatus(text)) tags.push('status_generate');
  return tags;
}

function deriveMechanicTags(card, existing = []) {
  return [...new Set([...(existing || []), ...statusTagsFromText(cardSearchText(card))])];
}

function inferOrbGeneration(text) {
  const source = stripMarkup(text).toLowerCase();
  if (!source) return null;
  if (/随机.{0,16}充能球|充能球.{0,8}随机|random.{0,24}orb/.test(source)) return 'random';
  const kinds = [];
  if (/闪电|\blightning\b/.test(source)) kinds.push('lightning');
  if (/冰霜|\bfrost\b/.test(source)) kinds.push('frost');
  if (/黑暗|\bdark\b/.test(source)) kinds.push('dark');
  if (/等离子|\bplasma\b/.test(source)) kinds.push('plasma');
  if (/玻璃|\bglass\b/.test(source)) kinds.push('glass');
  if (kinds.length === 1) return kinds[0];
  if (kinds.length > 1) return kinds.join(',');
  if (/生成.{0,16}充能球|channel.{0,20}orb/.test(source)) return 'unspecified';
  return null;
}

module.exports = {
  stripMarkup,
  cardSearchText,
  generatesNamedStatus,
  isStatusGenerationTrigger,
  statusTagsFromText,
  deriveMechanicTags,
  inferOrbGeneration
};
