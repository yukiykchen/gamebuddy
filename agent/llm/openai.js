const { loadCodexLlmConfig, normalizeApiRoot } = require('./codex-config');
const { loadProjectEnv } = require('./load-env');

const DEFAULT_BASE_URL = 'https://ai.gs88.shop';
const DEFAULT_MODEL = 'gpt-5.5';

function readLlmConfig(env = process.env, options = {}) {
  if (env === process.env) loadProjectEnv(env);
  const fromCodex = loadCodexLlmConfig({ env, ...options });
  const apiKey = String(env.GAMEBUDDY_LLM_API_KEY || env.OPENAI_API_KEY || fromCodex.apiKey || '').trim();
  const baseURL = normalizeApiRoot(env.GAMEBUDDY_LLM_BASE_URL || fromCodex.baseURL || DEFAULT_BASE_URL);
  const model = String(env.GAMEBUDDY_LLM_MODEL || fromCodex.model || DEFAULT_MODEL).trim();
  const wireEnv = String(env.GAMEBUDDY_LLM_WIRE_API || '').trim().toLowerCase();
  let wireApi = 'responses';
  if (wireEnv === 'chat' || wireEnv === 'completions') wireApi = 'chat';
  else if (wireEnv === 'responses' || wireEnv === 'response') wireApi = 'responses';
  else if (fromCodex.wireApi === 'chat') wireApi = 'chat';
  const reasoningEffort = String(env.GAMEBUDDY_LLM_REASONING_EFFORT || fromCodex.reasoningEffort || 'xhigh').trim();
  const source = env.GAMEBUDDY_LLM_API_KEY || env.GAMEBUDDY_LLM_BASE_URL || env.OPENAI_API_KEY ? 'env' : fromCodex.source || '';
  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseURL,
    model,
    wireApi,
    reasoningEffort,
    store: fromCodex.store,
    source: apiKey ? (source || 'env') : '',
    providerName: fromCodex.providerName || ''
  };
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractResponseText(body) {
  if (!body || typeof body !== 'object') return '';
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  if (Array.isArray(body.output)) {
    const texts = [];
    for (const item of body.output) {
      const parts = Array.isArray(item?.content) ? item.content : [];
      for (const part of parts) {
        if (typeof part?.text === 'string') texts.push(part.text);
      }
    }
    if (texts.length) return texts.join('\n');
  }
  return String(body?.choices?.[0]?.message?.content || '');
}

function createOpenAiClient(config = readLlmConfig(), { fetchImpl = globalThis.fetch, timeoutMs, onThinkingChange } = {}) {
  const enabled = Boolean(config?.enabled && config.apiKey);
  let requestSequence = 0;
  const waitMs = Number.isFinite(timeoutMs)
    ? timeoutMs
    : (config.wireApi === 'responses' ? 120000 : 8000);

  async function request(url, body) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`llm http ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function notifyThinking(thinking, detail) {
    try {
      onThinkingChange?.(thinking, detail);
    } catch {
      // UI feedback must never interrupt the recommendation request.
    }
  }

  async function completeJson(system, payload, task) {
    if (!enabled) return null;
    const detail = { task, model: config.model, requestId: `${task}-${++requestSequence}` };
    notifyThinking(true, detail);
    try {
      const user = JSON.stringify(payload);
      let body;
      if (config.wireApi === 'responses') {
        const requestBody = {
          model: config.model,
          instructions: system,
          input: user,
          store: false
        };
        if (config.reasoningEffort) requestBody.reasoning = { effort: config.reasoningEffort };
        try {
          body = await request(`${config.baseURL}/responses`, requestBody);
        } catch (error) {
          if (error.status !== 404 && error.status !== 405) throw error;
          body = await request(`${config.baseURL}/chat/completions`, {
            model: config.model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ]
          });
        }
      } else {
        body = await request(`${config.baseURL}/chat/completions`, {
          model: config.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        });
      }
      const parsed = parseJsonObject(extractResponseText(body));
      if (!parsed) return null;
      return {
        index: Number(parsed.index),
        reason: typeof parsed.reason === 'string' ? parsed.reason : ''
      };
    } finally {
      notifyThinking(false, detail);
    }
  }

  return {
    enabled,
    completeRoute: payload => completeJson(
      '你是杀戮尖塔 2 的路线顾问。权衡收益和风险：精英给遗物和更好的牌；火堆可回血或升级；商店可删牌和买东西提高战斗力。候选中的 targetId、row、col 和 direction 用于区分同类型节点；不得把左侧和右侧的同名节点混为一条路线。只从给定候选里选一条，不要发明新路线，不要建议出牌。若多条候选收益与风险相同，应明确说明它们等价。用 JSON 回答：{"index":0,"reason":"两句中文解释"}。',
      payload,
      'map_route'
    ),
    completeRest: payload => completeJson(
      '你是杀戮尖塔 2 的休息处顾问。严格使用 payload.strategy 的社区复核原则，并结合当前生命、完整牌组、遗物、药水、地图和近期精英/Boss，在回血与真实升级候选之间权衡。先确保玩家能活过近期已知威胁；升级时优先能产生降费、抽牌/能量、保留/消耗变化、倍率成长等质变且会在当前牌组中频繁兑现的牌。单卡 Tier 只是弱先验，不能覆盖升级前后差值、牌组协同和生存风险。不要默认升级稀有牌，也不要默认永不升级起手牌。只从给定 candidates 中选择，不得发明卡牌、遗物、机制或数值。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明为什么回血更安全，或该升级如何改善当前牌组与近期战斗"}。',
      payload,
      'rest_site'
    ),
    completeCardReward: payload => completeJson(
      '你是杀戮尖塔 2 的选牌顾问。逐张核对候选牌的知识库 rank、expertSummary、goodWhen、badWhen，再与实际完整牌组、升级状态、完整遗物效果、药水效果、金币、章节、生命、完整地图和敌人机制对照。knownBoss 和 knownUpcomingElites 中 exact=true 的遭遇才是已确定身份；possibleBosses 和 possibleElites 只是当前区域的可能池，绝不能说成下一战确定会遇到。地图节点没有 encounterId/encounterName 时也不得猜测具体敌人。知识库评价只是单卡先验；条件不满足时必须降低价值，已有核心协同或能针对确定机制时应提高价值。允许选择 SKIP，避免为了拿牌而拿牌。只能从候选列表中选择，不能发明卡牌、遗物、药水、敌人、机制或数值。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明当前局面满足或不满足哪些拿取条件，以及相对其他选项的优势"}。',
      payload,
      'card_reward'
    )
  };
}

module.exports = { readLlmConfig, parseJsonObject, extractResponseText, createOpenAiClient };
