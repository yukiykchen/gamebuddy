const { loadProjectEnv } = require('./load-env');

const DEFAULT_BASE_URL = 'https://ai.gs88.shop';
const DEFAULT_MODEL = 'gpt-5.5';

function normalizeApiRoot(baseURL) {
  const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function readLlmConfig(env = process.env) {
  if (env === process.env) loadProjectEnv(env);
  const apiKey = String(env.GAMEBUDDY_LLM_API_KEY || env.OPENAI_API_KEY || '').trim();
  const baseURL = normalizeApiRoot(env.GAMEBUDDY_LLM_BASE_URL || DEFAULT_BASE_URL);
  const model = String(env.GAMEBUDDY_LLM_MODEL || DEFAULT_MODEL).trim();
  const wireEnv = String(env.GAMEBUDDY_LLM_WIRE_API || '').trim().toLowerCase();
  let wireApi = 'responses';
  if (wireEnv === 'chat' || wireEnv === 'completions') wireApi = 'chat';
  else if (wireEnv === 'responses' || wireEnv === 'response') wireApi = 'responses';
  const reasoningEffort = String(env.GAMEBUDDY_LLM_REASONING_EFFORT || 'xhigh').trim();
  const source = apiKey ? 'env' : '';
  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseURL,
    model,
    wireApi,
    reasoningEffort,
    store: false,
    source: apiKey ? (source || 'env') : '',
    providerName: env.GAMEBUDDY_LLM_PROVIDER || ''
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

function createOpenAiClient(config = readLlmConfig(), { fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  const enabled = Boolean(config?.enabled && config.apiKey);
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

  async function completeJson(system, payload) {
    if (!enabled) return null;
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
          temperature: 1,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        });
      }
    } else {
      body = await request(`${config.baseURL}/chat/completions`, {
        model: config.model,
        temperature: 1,
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
  }

  return {
    enabled,
    completeRoute: payload => completeJson(
      '你是杀戮尖塔 2 的路线顾问。权衡收益和风险：精英给遗物和更好的牌；火堆可回血或升级；商店可删牌和买东西提高战斗力。只从给定候选里选一条，不要发明新路线，不要建议出牌。用 JSON 回答：{"index":0,"reason":"两句中文解释"}。',
      payload
    ),
    completeRest: payload => completeJson(
      '你是杀戮尖塔 2 的休息处顾问。在回血和升级之间权衡：残血或后面有精英时优先回血；生命健康时升级核心牌，不要优先升打击和防御。只从给定候选里选一条。用 JSON 回答：{"index":0,"reason":"两句中文解释"}。',
      payload
    ),
    completeEvent: payload => completeJson(
      '你是杀戮尖塔 2 的事件选择顾问。阅读事件背景和所有选项，结合当前生命、金币、遗物和卡组，选择长期收益更高且风险可接受的选项。只从给定选项里选，不要发明选项。用 JSON 回答：{"index":0,"reason":"两句中文解释"}。',
      payload
    )
  };
}

module.exports = { readLlmConfig, parseJsonObject, extractResponseText, createOpenAiClient };
