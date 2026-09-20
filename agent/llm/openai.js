const { loadProjectEnv } = require('./load-env');

const DEFAULT_BASE_URL = 'https://ai.gs88.shop';
const DEFAULT_MODEL = 'gpt-5.5';

function normalizeApiRoot(baseURL) {
  const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function parseThinking(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['disabled', 'off', 'none', 'false', '0'].includes(raw)) return 'disabled';
  if (['enabled', 'on', 'true', '1'].includes(raw)) return 'enabled';
  return '';
}

function parseTemperature(value) {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAllowedTemperature(message) {
  const match = String(message || '').match(/only\s+([0-9]*\.?[0-9]+)\s+is allowed/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveChatTemperature(config) {
  if (Number.isFinite(config?.temperature)) return config.temperature;
  if (/kimi[-_]?k2/i.test(String(config?.model || ''))) return 0.6;
  return undefined;
}

function chatCompletionsBody(config, system, user, temperature = resolveChatTemperature(config)) {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  if (Number.isFinite(temperature)) body.temperature = temperature;
  if (config.thinking) body.thinking = { type: config.thinking };
  return body;
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
  const thinking = parseThinking(env.GAMEBUDDY_LLM_THINKING);
  const temperature = parseTemperature(env.GAMEBUDDY_LLM_TEMPERATURE);
  const source = apiKey ? 'env' : '';
  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseURL,
    model,
    wireApi,
    reasoningEffort,
    thinking,
    temperature,
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

function stringifyLog(extra) {
  if (extra === undefined) return '';
  return typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2);
}

function redactSecrets(text, apiKey) {
  const key = String(apiKey || '').trim();
  const raw = String(text ?? '');
  return key ? raw.split(key).join('***') : raw;
}

function logLlm(label, extra) {
  console.log(`[GameBuddy LLM] ${label}`);
  if (extra === undefined) return;
  console.log(typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
}

function createOpenAiClient(config = readLlmConfig(), { fetchImpl = globalThis.fetch, timeoutMs, onThinkingChange, onLog } = {}) {
  const enabled = Boolean(config?.enabled && config.apiKey);
  let requestSequence = 0;
  const waitMs = Number.isFinite(timeoutMs) ? timeoutMs : 120000;

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
        const detail = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
        const error = new Error(`llm http ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`);
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

  function emitLog(requestId, task, phase, suffix, extra) {
    const label = `${requestId} ${suffix}`;
    logLlm(label, extra);
    try {
      onLog?.({
        requestId,
        task,
        phase,
        label,
        text: redactSecrets(stringifyLog(extra), config.apiKey),
        at: Date.now()
      });
    } catch {
      // UI logging must never interrupt the recommendation request.
    }
  }

  async function completeJson(system, payload, task) {
    if (!enabled) return null;
    const detail = { task, model: config.model, requestId: `${task}-${++requestSequence}` };
    const started = Date.now();
    notifyThinking(true, detail);
    emitLog(detail.requestId, task, 'start', '开始', {
      model: config.model,
      wireApi: config.wireApi,
      thinking: config.thinking || null,
      timeoutMs: waitMs
    });
    emitLog(detail.requestId, task, 'system', '系统提示', system);
    emitLog(detail.requestId, task, 'input', '输入', payload);
    try {
      const user = JSON.stringify(payload);
      let body;
      const requestChat = async temperature => {
        try {
          return await request(
            `${config.baseURL}/chat/completions`,
            chatCompletionsBody(config, system, user, temperature)
          );
        } catch (error) {
          const allowed = parseAllowedTemperature(error.message);
          if (error.status === 400 && Number.isFinite(allowed) && allowed !== temperature) {
            emitLog(detail.requestId, task, 'note', `temperature 不被接受，改用 ${allowed}`);
            return request(
              `${config.baseURL}/chat/completions`,
              chatCompletionsBody(config, system, user, allowed)
            );
          }
          throw error;
        }
      };
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
          emitLog(detail.requestId, task, 'note', 'Responses 不可用，改走 Chat Completions');
          body = await requestChat(resolveChatTemperature(config));
        }
      } else {
        body = await requestChat(resolveChatTemperature(config));
      }
      const text = extractResponseText(body);
      emitLog(detail.requestId, task, 'output', `原始输出 ${Date.now() - started}ms`, text || JSON.stringify(body, null, 2));
      const parsed = parseJsonObject(text);
      if (!parsed) {
        emitLog(detail.requestId, task, 'error', '解析失败，未得到 JSON');
        return null;
      }
      emitLog(detail.requestId, task, 'parsed', '解析结果', parsed);
      return {
        index: Number(parsed.index),
        reason: typeof parsed.reason === 'string' ? parsed.reason : ''
      };
    } catch (error) {
      emitLog(detail.requestId, task, 'error', `失败 ${Date.now() - started}ms`, error.message);
      throw error;
    } finally {
      setTimeout(() => notifyThinking(false, detail), 0);
    }
  }

  return {
    enabled,
    completeRoute: payload => completeJson(
      '你是杀戮尖塔 2 的路线顾问。每个候选是当前一个不同的可点击入口及其最佳后续路径。healthBand 按生命分为 healthy（至少 65%）、caution（高于 35% 且低于 65%）和 danger（至多 35%）；activeProfile 对应 growth、balanced、safe。safeScore、balancedScore 和 growthScore 只是启发式相对分，不是胜率或伤害预测。权衡当前生命、金币、精英收益、火堆、商店、路线灵活性、连续战斗压力和已知路径；危险血量时不能靠臆测未来回血来忽略明显风险。targetId、row、col、direction 和 displayLabel 用于唯一定位节点；四个或更多入口时必须使用“从左第 N 个”，不得笼统称为“中间”。只从给定候选里选一条，不要发明新路线或未知问号结果，不要建议出牌。即使分数相同，也要保留一个暂时首选，并说明当前证据无法拉开差距，不得宣称路线客观等价。routesTruncated 为真时承认路线枚举不完整。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明安全、成长和不确定性的取舍"}。',
      payload,
      'map_route'
    ),
    completeRest: payload => completeJson(
      '你是杀戮尖塔 2 的休息处顾问。严格使用 payload.strategy 的社区复核原则，并结合当前生命、完整牌组、遗物、药水、地图和近期精英/Boss，在回血与真实升级候选之间权衡。先确保玩家能活过近期已知威胁；升级时优先能产生降费、抽牌/能量、保留/消耗变化、倍率成长等质变且会在当前牌组中频繁兑现的牌。单卡 Tier 只是弱先验，不能覆盖升级前后差值、牌组协同和生存风险。判断卡费时只用 energyPerTurn / maxEnergy，不要把战斗残留能量当成这局费用。不要默认升级稀有牌，也不要默认永不升级起手牌。只从给定 candidates 中选择，不得发明卡牌、遗物、机制或数值。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明为什么回血更安全，或该升级如何改善当前牌组与近期战斗"}。',
      payload,
      'rest_site'
    ),
    completeEvent: payload => completeJson(
      '你是杀戮尖塔 2 的事件与开局祝福顾问。payload.kind 为 ancient 时，这是本层开局远古选择，不是地图路线。eventKnowledge 是当前 stable 版本的 Spire Codex 匹配信息；每个 option.analysis 是规则层从游戏当前显示文本和事件决策树提取的收益、代价、风险、可执行性与未知项。结合当前生命、金币、完整牌组、遗物和药水做取舍。只能返回 allowedIndexes 中的真实 index；不得选择 eligible=false 的锁定、资源不足或致命选项。随机结果只能按“随机”评价，不得发明具体卡牌、遗物或药水；unknown 非空时必须承认资料缺口，不得补造效果。不要改去建议地图路线或出牌。用 JSON 回答：{"index":0,"reason":"两句中文解释，明确当前局面下的主要收益、代价和风险"}。',
      payload,
      'event_choice'
    ),
    completeCardReward: payload => completeJson(
      '你是杀戮尖塔 2 的选牌顾问。逐张核对候选牌的知识库 rank、expertSummary、goodWhen、badWhen，再与实际完整牌组、升级状态、完整遗物效果、药水效果、金币、章节、生命、完整地图和敌人机制对照。每张牌的 costs 分别描述普通能量 energy/energyX 与星费 stars/starsX，source 标识 runtime、catalog 或 unavailable；不得把星费当作普通能量，也不得把 unavailable 猜成 0。descriptionSource=runtime 表示游戏实机文本，catalog 表示同版本目录回退；contextCompleteness=partial 时不得编造缺失效果、费用或数值。判断普通卡费和能否打出时只用 energyPerTurn / maxEnergy（每回合能量）；选牌发生在战斗外，不得把上一场残留能量说成这局费用，也不得因此把 3 费牌判成打不出。knownBoss 和 knownUpcomingElites 中 exact=true 的遭遇才是已确定身份；possibleBosses 和 possibleElites 只是当前区域的可能池，绝不能说成下一战确定会遇到。地图节点没有 encounterId/encounterName 时也不得猜测具体敌人。知识库评价只是单卡先验；条件不满足时必须降低价值，已有核心协同或能针对确定机制时应提高价值。候选 upgraded 为 true 或名称以 + 结尾时，必须按升级后效果评价；knowledgeEvaluation 的 rank/expertSummary 针对未升级版本，不得单独作为 SKIP 的充分理由。候选上的 trigger 是卡面触发条件，优先于 knowledgeEvaluation.goodWhen。若 trigger 是生成状态牌，必须按牌组里实际会生成伤口/灼伤等状态牌的能力判断（见 synergy 与 deck 描述），不得因为效果会生成充能球、或牌组充能球/集中偏少而否定。充能球种类只能依据该牌或遗物自己的 description/effect 和 orbGeneration：random 或「随机生成一个充能球」是任意种类，不得因为牌组另有电击或破损核心就说成只能生成闪电球；冷却剂按不同种类计数时，随机球可以贡献多种类，不能把随机球算作单一球种。允许选择 SKIP，避免为了拿牌而拿牌。只能从候选列表中选择，不能发明卡牌、遗物、药水、敌人、机制或数值。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明当前局面满足或不满足哪些拿取条件，以及相对其他选项的优势"}。',
      payload,
      'card_reward'
    )
  };
}

module.exports = {
  readLlmConfig,
  parseJsonObject,
  extractResponseText,
  createOpenAiClient,
  resolveChatTemperature,
  parseAllowedTemperature,
  stringifyLog,
  redactSecrets
};
