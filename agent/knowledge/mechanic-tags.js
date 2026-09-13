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

module.exports = {
  stripMarkup,
  cardSearchText,
  generatesNamedStatus,
  isStatusGenerationTrigger,
  statusTagsFromText,
  deriveMechanicTags
};
