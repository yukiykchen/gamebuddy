const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JSON_OUTPUT = path.join(ROOT, 'agent', 'knowledge', 'card-evaluations.json');
const CSV_OUTPUT = path.join(ROOT, 'docs', 'card-evaluations.csv');
const CODEX_API = process.env.GAMEBUDDY_SPIRE_CODEX_URL || 'https://spire-codex.com/api';
const EXPERT_SITE = 'https://sts2tierlists.com';
const DATA_CHANNEL = String(process.env.GAMEBUDDY_CARD_DATA_CHANNEL || 'stable').toLowerCase();
const VERSION_OVERRIDE = String(process.env.GAMEBUDDY_CARD_DATA_VERSION || '').trim();
const CARD_GUIDES = new Set(['ironclad', 'silent', 'defect', 'necrobinder', 'regent', 'colorless']);

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
}

function tier(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 90) return 'S';
  if (score >= 78) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function mechanicTags(card) {
  const text = `${card.description || ''} ${(card.keywords_key || []).join(' ')}`.toLowerCase();
  const target = String(card.target || '').toLowerCase();
  const damagesEnemy = card.type_key === 'Attack' || target.includes('enemy');
  const tags = [];
  if (Number(card.damage) > 0 && damagesEnemy) tags.push('damage');
  if (Number(card.block) > 0) tags.push('block');
  if (Number(card.cards_draw) > 0 || /抽.*牌|draw .*card/.test(text)) tags.push('draw');
  if (Number(card.energy_gain) > 0 || /获得.*能量|gain .*energy/.test(text)) tags.push('energy');
  if (String(card.target).toLowerCase().includes('allenem') || /所有敌人|all enemies/.test(text)) tags.push('aoe');
  if (/力量|敏捷|集中|中毒|厄运|strength|dexterity|focus|poison|doom|本场战斗中.*增加|for the rest of combat.*increase/.test(text)) tags.push('scaling');
  if (/虚弱|易伤|降低.*力量|weak|vulnerable|lose.*strength/.test(text)) tags.push('control');
  if (/消耗|exhaust/.test(text)) tags.push('exhaust');
  if (/保留|retain/.test(text)) tags.push('retain');
  if (/丢弃|discard|sly|灵巧/.test(text)) tags.push('discard');
  if (/固有|innate/.test(text)) tags.push('innate');
  if (/生成|加入你的手牌|create|add .* to your hand/.test(text)) tags.push('generate');
  if (/毒|poison/.test(text)) tags.push('poison');
  if (/小刀|shiv/.test(text)) tags.push('shiv');
  if (/力量|strength/.test(text)) tags.push('strength');
  if (/失去.*生命|受到.*伤害|lose .*hp|take .*damage/.test(text)) tags.push('self_damage');
  if (/易伤|vulnerable/.test(text)) tags.push('vulnerable');
  if (/充能球|冰霜|闪电|黑暗|等离子|orb|frost|lightning|dark|plasma/.test(text)) tags.push('orb');
  if (/厄运|doom/.test(text)) tags.push('doom');
  if (/召唤|summon/.test(text)) tags.push('summon');
  if (/星|star/.test(text)) tags.push('stars');
  if (/锻造|forge/.test(text)) tags.push('forge');
  if (/重放|replay/.test(text)) tags.push('replay');
  if (/所有.*卡牌.*伤害增加|all .*cards.*damage/.test(text)) tags.push('repeat_copy');
  if (/如果|若|每当|只能|if |when |whenever|only/.test(text)) tags.push('conditional');
  return [...new Set(tags)];
}

function formatTimestamp(url) {
  const seconds = Number(String(url || '').match(/[?&]t=(\d+)s?/)?.[1]);
  if (!Number.isFinite(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function unique(items, limit) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function buildEvaluation(card, prior, community, expertConsensus, gameVersion) {
  const tags = mechanicTags(card);
  const text = String(card.description || '').toLowerCase();
  const cost = card.is_x_cost ? null : Number(card.cost);
  const target = String(card.target || '').toLowerCase();
  const damagesEnemy = card.type_key === 'Attack' || target.includes('enemy');
  const damage = damagesEnemy ? Number(card.damage || 0) * Math.max(1, Number(card.hit_count || 1)) : 0;
  const block = Number(card.block || 0);
  const draw = Number(card.cards_draw || 0);
  const energy = Number(card.energy_gain || 0);
  const expert = expertConsensus.evaluations[0] || null;
  const special = ['status', 'curse', 'event', 'quest', 'token'].includes(card.color) || card.rarity_key === 'Basic';
  const rank = prior.tier || (special ? 'N/A' : 'Unrated');
  const effects = [];
  if (damage) effects.push(`${damage} 点总伤害${Number(card.hit_count) > 1 ? '且能利用多段触发' : ''}`);
  if (block) effects.push(`${block} 点格挡`);
  if (draw) effects.push(`抽 ${draw} 张牌`);
  if (energy) effects.push(`获得 ${energy} 点能量`);
  if (tags.includes('aoe')) effects.push('覆盖多目标');
  if (tags.includes('scaling')) effects.push('提供长线成长');
  if (tags.includes('control')) effects.push('提供弱化或控制');
  if (tags.includes('generate')) effects.push('生成额外资源');

  let evidence;
  if (expert) evidence = `${expert.source} 在适用 ${gameVersion} 的 Tier List 中将其列为「${expert.rank}」`;
  else if (community) evidence = `同版本社区数据给出的基础档位为 ${community.tier}`;
  else evidence = '缺少同版本社区样本和高手 Tier 记录';
  let value = special
    ? `它的特殊效果是“${String(card.description || '无直接战斗效果').replace(/\s+/g, ' ')}”`
    : (effects.length ? `主要价值是${effects.slice(0, 3).join('、')}` : `效果重点是“${String(card.description || '特殊机制').replace(/\s+/g, ' ')}”`);
  let caution = '';
  if (special) caution = '；它不是常规战后奖励牌，不能按普通拿取率直接比较';
  else if (tags.includes('self_damage')) caution = '；需要支付生命代价，收益必须覆盖由此增加的生存风险';
  else if (Number.isFinite(cost) && cost >= 3) caution = '；费用较高，必须确认当前能量和启动速度能够承受';
  else if (/如果|若|每当|只能|if |when |whenever|only/.test(text)) caution = '；收益依赖触发条件，条件不成立时容易成为低效抽牌';
  else if (card.type_key === 'Power' && !damage && !block) caution = '；打出当回合缺少直接攻防，短战需要权衡启动损失';

  const goodWhen = [];
  if (special) goodWhen.push('通过对应事件、生成效果或特殊规则获得它时');
  if (tags.includes('self_damage')) goodWhen.push('已有自伤触发收益，并且当前生命足以支付代价时');
  if (damage >= 10) goodWhen.push('第一章或当前牌组缺少前置伤害时');
  if (tags.includes('aoe')) goodWhen.push('即将面对多目标战斗或召唤型敌人时');
  if (block >= 8) goodWhen.push('牌组防御密度不足或需要处理爆发回合时');
  if (draw) goodWhen.push('牌组需要加速循环、寻找核心牌时');
  if (energy) goodWhen.push('手牌充足但能量限制展开时');
  if (tags.includes('scaling')) goodWhen.push('即将面对精英、Boss 或其他长战时');
  if (tags.includes('control')) goodWhen.push('敌人关键回合可被虚弱、易伤或降力量缓解时');
  if (tags.includes('exhaust')) goodWhen.push('已有消耗触发收益或需要战中压缩牌组时');
  if (tags.includes('discard')) goodWhen.push('已有弃牌、灵巧或相关触发体系时');
  if (tags.includes('poison')) goodWhen.push('已有中毒叠层与持续伤害支持时');
  if (tags.includes('shiv')) goodWhen.push('已有小刀增伤、连击或出牌次数收益时');
  if (tags.includes('orb')) goodWhen.push('当前充能球类型和槽位支持该效果时');
  if (tags.includes('doom') || tags.includes('summon')) goodWhen.push('已有厄运或召唤体系，能够放大联动时');
  if (tags.includes('stars')) goodWhen.push('星能产出足以稳定支付或触发相关效果时');
  if (tags.includes('forge') || tags.includes('replay')) goodWhen.push('已有锻造或重放体系并缺少关键组件时');
  if (tags.includes('retain')) goodWhen.push('需要保留组件等待爆发或防御窗口时');
  if (tags.includes('repeat_copy')) goodWhen.push('已有同名牌、检索或高频循环，能反复兑现成长时');
  if (Number.isFinite(cost) && cost === 0) goodWhen.push('需要低成本提升当回合行动密度时');
  if (!goodWhen.length) goodWhen.push(`当前牌组确实缺少这张${card.type || '牌'}提供的功能时`);

  const badWhen = [];
  if (special) badWhen.push('把它当成普通奖励牌与可选卡直接横向比较时');
  if (tags.includes('self_damage')) badWhen.push('当前生命已接近精英或 Boss 的斩杀线时');
  if (Number.isFinite(cost) && cost >= 3) badWhen.push('基础能量不足且没有减费、回能或保留支持时');
  if (/如果|若|每当|只能|if |when |whenever|only/.test(text)) badWhen.push('牌组无法稳定满足其触发条件时');
  if (tags.includes('scaling')) badWhen.push('当前更需要立即解决走廊战而不是长线成长时');
  if (tags.includes('exhaust')) badWhen.push('长战需要重复使用它且没有回收手段时');
  if (tags.includes('discard')) badWhen.push('缺少弃牌出口或相关触发组件时');
  if (tags.includes('poison')) badWhen.push('下一场敌人克制持续伤害或当前缺少中毒支持时');
  if (tags.includes('orb')) badWhen.push('球槽、集中或目标球类型与它不匹配时');
  if (tags.includes('repeat_copy')) badWhen.push('牌组没有同名牌支持，也不准备围绕它持续拿牌时');
  if (card.type_key === 'Power' && !damage && !block) badWhen.push('短战压力高、打出当回合必须立刻攻防时');
  if (draw && !energy && Number.isFinite(cost) && cost > 0) badWhen.push('抽牌已经充足但能量无法支持额外手牌时');
  if (!badWhen.length) badWhen.push('它不能改善当前牌组缺口，拿取只会降低核心牌抽取频率时');

  return {
    rank,
    expertSummary: `${evidence}。${value}${caution}。`,
    goodWhen: unique(goodWhen, 4),
    badWhen: unique(badWhen, 3),
    sourceTimestamp: formatTimestamp(expert?.timestampUrl),
    sourceUrl: expert?.timestampUrl || 'https://spire-codex.com/tier-list',
    sourceName: expert?.source || (community ? 'Spire Codex community data' : 'GameBuddy mechanics synthesis'),
    sourceType: expert ? 'expert-tier+synthesis' : (community ? 'community-data+synthesis' : 'mechanics-synthesis'),
    gameVersion,
    note: 'expertSummary 是 GameBuddy 依据卡牌机制与来源档位生成的原创中文归纳，不是专家原话。'
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeExpertScore(entries, maxima) {
  const signals = entries.map(entry => {
    const key = `${entry.guideId}:${entry.source}`;
    const max = maxima.get(key) || 1;
    const normalized = max === 0 ? 100 : 100 * (1 - entry.rankOrder / max);
    return normalized * (entry.contextual ? 0.75 : 1);
  });
  return signals.length ? Math.round(signals.reduce((sum, value) => sum + value, 0) / signals.length) : null;
}

async function loadExpertEntries() {
  const homepage = await fetchText(`${EXPERT_SITE}/`);
  const searchPath = homepage.match(/data-search-url="([^"]+)"/)?.[1];
  if (!searchPath) throw new Error('Could not discover expert tier-list data URL');
  const body = await fetchJson(new URL(searchPath, EXPERT_SITE).toString());
  return body.filter(item => CARD_GUIDES.has(item.guideId));
}

async function loadGameVersions() {
  const [changelogs, beta] = await Promise.all([
    fetchJson(`${CODEX_API}/changelogs`),
    fetchJson(`${CODEX_API}/beta/version`)
  ]);
  const stableVersion = changelogs
    .map(item => String(item.title || '').match(/Slay the Spire 2 (v\d+\.\d+\.\d+)/i)?.[1])
    .find(Boolean);
  return {
    stable: stableVersion || null,
    beta: beta.beta_version || null
  };
}

function apiUrl(pathname, params = {}) {
  const url = new URL(`${CODEX_API.replace(/\/$/, '')}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

async function main() {
  if (!['stable', 'beta'].includes(DATA_CHANNEL)) throw new Error('GAMEBUDDY_CARD_DATA_CHANNEL must be stable or beta');
  const availableVersions = await loadGameVersions();
  const gameVersion = VERSION_OVERRIDE || availableVersions[DATA_CHANNEL];
  if (!gameVersion) throw new Error(`Could not determine current ${DATA_CHANNEL} game version`);
  const patchVersion = gameVersion.replace(/^v/i, '');
  const [cardsZh, cardsEn, scores, expertItems] = await Promise.all([
    fetchJson(apiUrl('/cards', { lang: 'zhs', channel: DATA_CHANNEL })),
    fetchJson(apiUrl('/cards', { lang: 'eng', channel: DATA_CHANNEL })),
    fetchJson(apiUrl('/runs/scores/cards', { lang: 'zhs', channel: DATA_CHANNEL, bracket: gameVersion })),
    loadExpertEntries()
  ]);
  const capturedAt = new Date().toISOString();
  const englishById = new Map(cardsEn.map(card => [card.id, card]));
  const expertsByName = new Map();
  const maxima = new Map();

  for (const item of expertItems) {
    const name = `${item.guideId}:${normalize(item.name)}`;
    const entries = (item.evaluations || []).filter(entry => (entry.patches || []).some(patch => patch.replace(/^v/i, '') === patchVersion)).map(entry => ({
      guideId: item.guideId,
      source: entry.source,
      patches: entry.patches || [],
      rank: entry.rank,
      rankOrder: entry.rankOrder,
      contextual: Boolean(entry.contextual),
      timestampUrl: entry.timestampUrl || null
    }));
    expertsByName.set(name, [...(expertsByName.get(name) || []), ...entries]);
    for (const entry of entries) {
      const key = `${entry.guideId}:${entry.source}`;
      maxima.set(key, Math.max(maxima.get(key) || 0, Number(entry.rankOrder) || 0));
    }
  }

  const cards = cardsZh.map(card => {
    const english = englishById.get(card.id) || {};
    const score = scores[card.id] || null;
    const experts = expertsByName.get(`${card.color}:${normalize(english.name)}`) || [];
    const expertScore = normalizeExpertScore(experts, maxima);
    const codexScore = Number.isFinite(score?.score) ? score.score : null;
    const priorScore = codexScore !== null && expertScore !== null
      ? Math.round(codexScore * 0.7 + expertScore * 0.3)
      : (codexScore ?? expertScore);
    const evidenceCount = (codexScore === null ? 0 : 1) + experts.length;
    const confidence = codexScore !== null && experts.length >= 2 ? 'high'
      : evidenceCount >= 1 ? 'medium' : 'low';
    const prior = {
      score: priorScore,
      tier: tier(priorScore),
      confidence,
      warning: '基础先验，不代表当前局面中的最终拿取价值'
    };
    const community = score ? {
      codexScore: score.score,
      tier: tier(score.score),
      picks: score.picks,
      wins: score.wins,
      winRate: score.win_rate,
      elo: score.elo
    } : null;
    const expertConsensus = {
      normalizedScore: expertScore,
      evidenceCount: experts.length,
      evaluations: experts
    };
    return {
      id: card.id,
      name: card.name,
      nameEn: english.name || null,
      color: card.color,
      type: card.type,
      rarity: card.rarity,
      cost: card.is_x_cost ? 'X' : card.cost,
      multiplayerOnly: Boolean(card.multiplayer_only),
      description: card.description,
      upgradeDescription: card.upgrade_description,
      mechanicTags: mechanicTags(card),
      prior,
      community,
      expertConsensus,
      evaluation: buildEvaluation(card, prior, community, expertConsensus, gameVersion)
    };
  }).sort((left, right) => left.color.localeCompare(right.color) || left.name.localeCompare(right.name, 'zh-CN'));

  const payload = {
    schemaVersion: 3,
    capturedAt,
    game: {
      version: gameVersion,
      channel: DATA_CHANNEL,
      availableVersions,
      statisticsBracket: gameVersion
    },
    methodology: {
      purpose: '为奖励选牌 Agent 提供单卡基础先验；最终建议必须继续结合牌组、遗物、章节和敌人。',
      priorBlend: 'Spire Codex Bayesian score 70% + normalized expert tier signal 30% when both exist.',
      copyright: 'Only rankings, patch identifiers and source links are retained from editorial sources; commentary is not copied.',
      caveats: [
        '胜率与拿取数据存在玩家水平、章节和幸存者偏差，不能解释为因果效果。',
        `本快照严格面向 ${DATA_CHANNEL} ${gameVersion}；Early Access 更新后必须重新生成。`,
        '无论基础档位多高，都不能替代实时牌组和具体敌人分析。'
      ]
    },
    sources: [
      { id: 'spire-codex', url: 'https://spire-codex.com/tier-list', kind: 'bayesian-community-win-rate', version: gameVersion, channel: DATA_CHANNEL },
      { id: 'sts2-tier-lists', url: EXPERT_SITE, kind: 'expert-tier-index', versionFilter: patchVersion }
    ],
    cards
  };

  const headers = ['game_version', 'data_channel', 'captured_at', 'id', 'name', 'name_en', 'color', 'type', 'rarity', 'cost', 'rank', 'expert_summary', 'good_when', 'bad_when', 'source_timestamp', 'source_name', 'source_type', 'prior_score', 'confidence', 'codex_score', 'picks', 'win_rate', 'expert_score', 'expert_evidence', 'mechanic_tags', 'expert_sources'];
  const rows = cards.map(card => [
    gameVersion, DATA_CHANNEL, capturedAt, card.id, card.name, card.nameEn, card.color, card.type, card.rarity, card.cost,
    card.evaluation.rank, card.evaluation.expertSummary, card.evaluation.goodWhen, card.evaluation.badWhen,
    card.evaluation.sourceTimestamp, card.evaluation.sourceName, card.evaluation.sourceType,
    card.prior.score, card.prior.confidence,
    card.community?.codexScore, card.community?.picks, card.community?.winRate,
    card.expertConsensus.normalizedScore, card.expertConsensus.evidenceCount,
    card.mechanicTags,
    [...new Set(card.expertConsensus.evaluations.map(item => item.source))]
  ].map(csvCell).join(','));

  await fs.writeFile(JSON_OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(CSV_OUTPUT, `${headers.join(',')}\n${rows.join('\n')}\n`);
  console.log(`Wrote ${cards.length} cards for ${DATA_CHANNEL} ${gameVersion} to ${path.relative(ROOT, JSON_OUTPUT)} and ${path.relative(ROOT, CSV_OUTPUT)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
