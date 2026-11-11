'use strict';
// 手动试生成：仅合成素材，通过实际客户端和弹幕过滤，不读取玩家存档。
const fs = require('node:fs');
const path = require('node:path');
const { readLlmConfig, createOpenAiClient } = require('../agent/llm/openai');
const { DanmakuLlmAtmosphere } = require('../agent/danmaku/llm-atmosphere');

async function main() {
  const config = readLlmConfig();
  if (!config.enabled) throw new Error('未配置模型，未进行真实试生成');
  // 对齐main.js弹幕专用覆盖，不能沿用通用客户端可能只有120 token的配置。
  const previewConfig = { ...config, thinking: 'disabled', wireApi: 'chat', reasoningEffort: '', maxTokens: 800,
    temperature: Number.isFinite(config.temperature) ? config.temperature : 0.9 };
  const output = path.join(__dirname, '..', '.runtime', 'character-voices');
  fs.mkdirSync(output, { recursive: true });
  let now = 0;
  const engines = new Map();
  const results = [];
  for (const character of ['defect', 'necrobinder']) {
    let raw;
    const client = createOpenAiClient(previewConfig, { timeoutMs: 60_000 });
    const engine = new DanmakuLlmAtmosphere({ now: () => now, llm: {
      enabled: client.enabled,
      completeDanmaku: async (payload, options) => { raw = await client.completeDanmaku(payload, options); return raw; }
    } });
    engines.set(character, { engine, getRaw: () => raw });
  }
  const scenes = [
    { id: 'idle', facts: ['没有提供新的战斗事件，可自由闲谈，不虚构塔中发生的具体事情。'], moments: [] },
    { id: 'attack', facts: ['观察到攻击牌打出，不知道是否命中或造成多少伤害。'], moments: [{ id: 'attack-1', kind: 'attack_played', ageMs: 1000 }] },
    { id: 'hurt', facts: ['同场快照确认自身生命从60降到53，来源未知。'], moments: [{ id: 'hurt-1', kind: 'player_hurt', ageMs: 1000 }] }
  ];
  for (const scene of scenes) {
    now += 15000;
    await Promise.all([...engines].map(async ([character, { engine, getRaw }]) => {
      const started = Date.now();
      const accepted = await engine.generate({
        character, runId: 'synthetic-voice-comparison', batchId: scene.id, trigger: 'periodic',
        facts: scene.facts, moments: scene.moments, snapshot: {
          player: { hp: 53, maxHp: 80 }, enemies: [{ key: 'synthetic-enemy', name: '小啃兽', hp: 32, maxHp: 40 }], turn: 3
        }
      });
      results.push({ character, scene: scene.id, elapsedMs: Date.now() - started, raw: getRaw(), accepted });
    }));
  }
  const report = { at: new Date().toISOString(), synthetic: true, maxTokens: previewConfig.maxTokens, results };
  fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(results.map(({ character, scene, elapsedMs, accepted }) => ({ character, scene, elapsedMs, status: accepted.status, phrases: accepted.phrases })), null, 2));
  if (results.some(item => ['failed', 'unavailable'].includes(item.accepted.status))) process.exitCode = 1;
}
main().catch(() => { console.error('人格试生成未完成，检查本地模型连接配置。'); process.exitCode = 1; });
