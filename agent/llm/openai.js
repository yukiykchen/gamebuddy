const { loadProjectEnv } = require('./load-env');
const { STRATEGY_REVIEW } = require('../knowledge/build-decision-guard');
const { danmakuIdentityPrompt } = require('../danmaku/language-profile');

const DEFAULT_BASE_URL = 'https://ai.gs88.shop';
const DEFAULT_MODEL = 'deepseek-flash';

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

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
  if (Number.isInteger(config.maxTokens)) body.max_tokens = config.maxTokens;
  if (config.stream) body.stream = true;
  if (config.thinking) body.thinking = { type: config.thinking };
  if (/deepseek-v4-pro/i.test(String(config.model)) && config.reasoningEffort) {
    body.reasoning = { effort: config.reasoningEffort };
  }
  return body;
}

function parseStream(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function readSseText(response) {
  if (!response.body) throw new Error('llm stream response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason = '';
  const consume = line => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let chunk;
    try { chunk = JSON.parse(payload); } catch { return; }
    const choice = chunk?.choices?.[0] || chunk?.data?.choices?.[0] || {};
    finishReason = choice.finish_reason || finishReason;
    const content = choice.delta?.content ?? choice.message?.content ?? chunk?.output_text ?? chunk?.text;
    if (typeof content === 'string') text += content;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach(consume);
    if (done) break;
  }
  if (buffer) consume(buffer);
  if (!text.trim()) throw new Error(`llm stream ended without final content${finishReason ? ` (${finishReason})` : ''}`);
  return { choices: [{ message: { content: text } }] };
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
  const maxTokens = parsePositiveInteger(env.GAMEBUDDY_LLM_MAX_TOKENS);
  const stream = parseStream(env.GAMEBUDDY_LLM_STREAM);
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
    maxTokens,
    stream,
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
  const message = body?.choices?.[0]?.message || {};
  return String(message.content || message.reasoning_content || '');
}

function stringifyLog(extra) {
  if (extra === undefined) return '';
  return typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2);
}

function authHeaders(config) {
  if (config?.authScheme === 'x-api-key') return { 'X-Api-Key': config.apiKey };
  return { Authorization: `Bearer ${config.apiKey}` };
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

  async function request(url, body, { signal } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(config)
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
      return await (body.stream === true ? readSseText(response) : response.json());
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
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
    const text = redactSecrets(stringifyLog(extra), config.apiKey);
    logLlm(label, extra === undefined ? undefined : text);
    try {
      onLog?.({
        requestId,
        task,
        phase,
        label,
        text,
        at: Date.now()
      });
    } catch {
      // UI logging must never interrupt the recommendation request.
    }
  }

  async function completeJson(system, payload, task, raw = false, options = {}) {
    if (!enabled) return null;
    const detail = { task, model: config.model, requestId: `${task}-${++requestSequence}` };
    const started = Date.now();
    notifyThinking(true, detail);
    emitLog(detail.requestId, task, 'start', '开始', {
      model: config.model,
      wireApi: config.wireApi,
      thinking: config.thinking || null,
      stream: Boolean(config.stream),
      maxTokens: config.maxTokens || null,
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
            chatCompletionsBody(config, system, user, temperature), options
          );
        } catch (error) {
          const allowed = parseAllowedTemperature(error.message);
          if (error.status === 400 && Number.isFinite(allowed) && allowed !== temperature) {
            emitLog(detail.requestId, task, 'note', `temperature 不被接受，改用 ${allowed}`);
            return request(
              `${config.baseURL}/chat/completions`,
              chatCompletionsBody(config, system, user, allowed), options
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
        if (Number.isInteger(config.maxTokens)) requestBody.max_output_tokens = config.maxTokens;
        try {
          body = await request(`${config.baseURL}/responses`, requestBody, options);
        } catch (error) {
          if (error.status !== 404 && error.status !== 405) throw error;
          emitLog(detail.requestId, task, 'note', 'Responses 不可用，改走 Chat Completions');
          body = await requestChat(resolveChatTemperature(config));
        }
      } else {
        body = await requestChat(resolveChatTemperature(config));
      }
      try { options.onUsage?.({ model: body?.model || config.model, usage: body?.usage || null }); } catch { /* Diagnostics cannot interrupt a model result. */ }
      const text = extractResponseText(body);
      emitLog(detail.requestId, task, 'output', `原始输出 ${Date.now() - started}ms`, text || JSON.stringify(body, null, 2));
      const parsed = parseJsonObject(text);
      if (!parsed) {
        emitLog(detail.requestId, task, 'error', '解析失败，未得到 JSON');
        return null;
      }
      emitLog(detail.requestId, task, 'parsed', '解析结果', parsed);
      if (raw) return parsed;
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
    model: config.model,
    cacheKey: require('node:crypto').createHash('sha256').update(JSON.stringify({ ...config, apiKey: config.apiKey ? require('node:crypto').createHash('sha256').update(config.apiKey).digest('hex') : '' })).digest('hex'),
    completeRecapTurn: (payload, options) => completeJson(
      payload?.stage === 'editorial_review' ? require('../../review/recap/editorial').REVIEW_PROMPT
        : payload?.stage === 'closing' ? require('../../review/recap/runner').CLOSING_PROMPT : require('../../review/recap/runner').PROMPT, payload, 'run_recap', true, options
    ),
    completeBuildGuidance: (payload, options) => completeJson(
      require('../knowledge/card-guidance-service').GUIDANCE_PROMPT, payload, 'build_guidance', true, options
    ),
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
    completeShop: payload => completeJson(
      STRATEGY_REVIEW + '你是杀戮尖塔 2 的商店顾问。只能从 candidates 中选择一个当前合法的完整购物清单；每个清单已经由规则层校验库存、运行时实际价格和当前金币，不得新增商品、改价或让总花费超过预算。结合完整牌组、已持有遗物和药水、药水槽、完整地图以及 threats 里的后续遭遇做取舍。knownBoss 和 knownUpcomingElites 中 exact=true 才是确定遭遇；possibleElites 只是本章可能池，不得说成下一战必遇。逐项使用 inventory.analysis 中的完整效果、优点、风险和删牌目标；卡牌 upgraded=true 时按升级后效果评价。不要为了花完金币而购物，SAVE_GOLD 是合法候选；也不要假设未知补货内容。必须一次决定本次商店要买的全部物品及删牌服务，items 的顺序就是建议购买顺序；不要要求玩家每买一件后再次分析。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明整份清单的牌组提升、后续威胁和金币机会成本"}。',
      payload,
      'shop_choice'
    ),
    completeCardReward: payload => completeJson(
      STRATEGY_REVIEW + '你是杀戮尖塔 2 的选牌顾问。逐张核对候选牌的知识库 rank、expertSummary、goodWhen、badWhen，再与实际完整牌组、升级状态、完整遗物效果、药水效果、金币、章节、生命、完整地图和敌人机制对照。每张牌的 costs 分别描述普通能量 energy/energyX 与星费 stars/starsX，source 标识 runtime、catalog 或 unavailable；不得把星费当作普通能量，也不得把 unavailable 猜成 0。descriptionSource=runtime 表示游戏实机文本，catalog 表示同版本目录回退；contextCompleteness=partial 时不得编造缺失效果、费用或数值。判断普通卡费和能否打出时只用 energyPerTurn / maxEnergy（每回合能量）；选牌发生在战斗外，不得把上一场残留能量说成这局费用，也不得因此把 3 费牌判成打不出。knownBoss 和 knownUpcomingElites 中 exact=true 的遭遇才是已确定身份；possibleBosses 和 possibleElites 只是当前区域的可能池，绝不能说成下一战确定会遇到。地图节点没有 encounterId/encounterName 时也不得猜测具体敌人。知识库评价只是单卡先验；条件不满足时必须降低价值，已有核心协同或能针对确定机制时应提高价值。候选 upgraded 为 true 或名称以 + 结尾时，必须按升级后效果评价；knowledgeEvaluation 的 rank/expertSummary 针对未升级版本，不得单独作为 SKIP 的充分理由。候选上的 trigger 是卡面触发条件，优先于 knowledgeEvaluation.goodWhen。若 trigger 是生成状态牌，必须按牌组里实际会生成伤口/灼伤等状态牌的能力判断（见 synergy 与 deck 描述），不得因为效果会生成充能球、或牌组充能球/集中偏少而否定。充能球种类只能依据该牌或遗物自己的 description/effect 和 orbGeneration：random 或「随机生成一个充能球」是任意种类，不得因为牌组另有电击或破损核心就说成只能生成闪电球；冷却剂按不同种类计数时，随机球可以贡献多种类，不能把随机球算作单一球种。允许选择 SKIP，避免为了拿牌而拿牌。只能从候选列表中选择，不能发明卡牌、遗物、药水、敌人、机制或数值。用 JSON 回答：{"index":0,"reason":"两句中文解释，说明当前局面满足或不满足哪些拿取条件，以及相对其他选项的优势"}。',
      payload,
      'card_reward'
    ),
    completeDanmaku: (payload, options) => completeJson(
      '你是《杀戮尖塔 2》的角色观战弹幕文案器，只表达感想，不负责决策。严格采用 characterName、style、tone、examples、scenarioExamples 指定的角色人格，不能默认使用铁甲战士口吻。只输出 JSON：{"phrases":[{"text":"第一句","enemyKeys":[],"momentId":null,"topic":"other","motif":"简短笑点或意思"},{"text":"第二句","enemyKeys":[],"momentId":null,"topic":"other","motif":"简短笑点或意思"}]}。enemyKeys 填这句针对的当前怪物 key，不涉及怪物可空；回顾 moments 中的已发生事件时填对应 momentId，不得发明标识。生成 2 句互不重复、各 6 到 48 个中文字符的自然短句，两句各有不同观察角度。\n\n事实规则：snapshot 和 facts 是请求发起时的 Mod 快照，recentEvents 是此前真实发生的 Mod 消息，ageMs 表示距采样时间的间隔。它们是唯一游戏事实，未提供的生命/防御等数值不要猜；怪物名称也不能证明它做了对应动作。台词可能稍晚展示，因此以对刚才局面的观察或感想表达，不宣称某个旧行动此刻仍未执行。不把意图说成已经命中，不猜伤害、胜负、机制或未提供的伙伴动作。攻击牌打出只证明出手，不证明命中；敌人掉血不证明是哪张牌的功劳；自己掉血不证明是哪只怪物所致。怪物快照只作为背景，不能把它的意图、数量或站位当成默认写作主题。\n\n主题规则：你像有自己脾气的旅伴，想到了有意思的话才开口，不是仪表盘或每回合播报员。moments、snapshot、recentEvents 都是可选素材，不是写作任务：发生攻击或受伤也可以完全不提，不要求每场覆盖出手、受伤、低血、防御；不要默认说“我没防御、我没血了”。自由选择自嘲、随口调侃、好奇、小观察、卡牌或兵器意象、对塔和旅途的感慨等角度；也可围绕有据可见的怪物开玩笑，不必逐只描述动作。允许不增加新游戏事实的想象性比喻，不要编造具体经历、环境事件或官方设定。两句可以说不同的事，没有“第一句反应、第二句心态”的固定分工，不要求第一人称或每句提自己，也不要逢句都总结战斗。禁止持续旁白“两个怪物在做什么、一个怪物在做什么”，不要复读怪物名字和行动列表；技能介绍已有独立弹幕承担。没有新事件也可以随口说点有趣的，但没有新意思就少说或不说；runMemories 是本局已确认的回忆，可自然联系当前遭遇，不重复背诵，不指认未知伤害来源。attention 是可选观察角度，reactions 仅在选择对应话题时参考，memoryVoice 指导回忆方式。mode 为 quiet 时保持克制，不制造不存在的新变化。只有确实引用某个moment才填momentId，普通闲谈填null；只有runMemories明确提供重逢事实才能写“又见面”。\n\n口吻规则：voice的rhythm、diction、humor、contradiction规定当前角色怎样开口、怎样形成笑点，它们不是每句要念出的关键词；avoid是该角色的表达禁忌。同一意思不能只换角色名，铁甲的省话、猎手的留白、机器人的生涩认真、储君的挑剔和契约师的亲切反差须体现在自然措辞里。style、examples 和 scenarioExamples 只帮助把握语感及不同情景反应，不能照抄示例。creativeAngles 是可选角度菜单，不必覆盖、逐项轮换或照着写。两句保持同一角色人格但不要同一个句式或笑点；铁甲不必句句伤疤、猎手不必句句呼吸、机器人不必句句自我修正、储君不必句句王冠礼数、契约师不必句句骨头。recentTopics 是最近已接受的内容和笑点，只用于避重，不是当前状态事实，avoidTopics 是暂时不要再说的主题，avoidMotifs 是已用过的表达梗（如still-standing是还站着、enemy-teeth是牙齿/磨牙、royal-etiquette是礼数王冠）；避免相同意思换词重述。topic从creativeAngles选择最贴近的一项，motif用简短中文概括该句核心意思或笑点，相同意思应沿用同一概括，不要为绕过去重换标签。recentTexts 中近期句子不得原句重复、换词复述或重复笑点。使用尖塔式克制、怪诞、冷幽默，避免现代网络热梗、客服腔、说教和过度卖萌。若确实无新内容可说，可少于两句或空数组，不要硬编。\n\n禁止出牌、目标或操作建议，禁止称呼“玩家”，不输出解释、推理、Markdown、广告、辱骂或链接。不加角色名、技能名等冒号前缀，只输出角色台词。' + danmakuIdentityPrompt(payload.character),
      payload,
      'danmaku',
      true,
      options
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
  readSseText,
  stringifyLog,
  redactSecrets,
  normalizeApiRoot,
  authHeaders
};
