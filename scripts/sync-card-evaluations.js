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
  const tags = [];
  if (Number(card.damage) > 0) tags.push('damage');
  if (Number(card.block) > 0) tags.push('block');
  if (Number(card.cards_draw) > 0 || /抽.*牌|draw .*card/.test(text)) tags.push('draw');
  if (Number(card.energy_gain) > 0 || /获得.*能量|gain .*energy/.test(text)) tags.push('energy');
  if (String(card.target).toLowerCase().includes('allenem') || /所有敌人|all enemies/.test(text)) tags.push('aoe');
  if (/力量|敏捷|集中|中毒|厄运|strength|dexterity|focus|poison|doom/.test(text)) tags.push('scaling');
  if (/虚弱|易伤|降低.*力量|weak|vulnerable|lose.*strength/.test(text)) tags.push('control');
  if (/消耗|exhaust/.test(text)) tags.push('exhaust');
  if (/保留|retain/.test(text)) tags.push('retain');
  if (/丢弃|discard|sly|灵巧/.test(text)) tags.push('discard');
  if (/固有|innate/.test(text)) tags.push('innate');
  if (/生成|加入你的手牌|create|add .* to your hand/.test(text)) tags.push('generate');
  return [...new Set(tags)];
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
      prior: {
        score: priorScore,
        tier: tier(priorScore),
        confidence,
        warning: '基础先验，不代表当前局面中的最终拿取价值'
      },
      community: score ? {
        codexScore: score.score,
        tier: tier(score.score),
        picks: score.picks,
        wins: score.wins,
        winRate: score.win_rate,
        elo: score.elo
      } : null,
      expertConsensus: {
        normalizedScore: expertScore,
        evidenceCount: experts.length,
        evaluations: experts
      }
    };
  }).sort((left, right) => left.color.localeCompare(right.color) || left.name.localeCompare(right.name, 'zh-CN'));

  const payload = {
    schemaVersion: 2,
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

  const headers = ['game_version', 'data_channel', 'captured_at', 'id', 'name', 'name_en', 'color', 'type', 'rarity', 'cost', 'prior_score', 'prior_tier', 'confidence', 'codex_score', 'picks', 'win_rate', 'expert_score', 'expert_evidence', 'mechanic_tags', 'expert_sources'];
  const rows = cards.map(card => [
    gameVersion, DATA_CHANNEL, capturedAt, card.id, card.name, card.nameEn, card.color, card.type, card.rarity, card.cost,
    card.prior.score, card.prior.tier, card.prior.confidence,
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
