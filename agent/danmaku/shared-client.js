'use strict';

const crypto = require('node:crypto');
const { loadProjectEnv } = require('../llm/load-env');

// 安装包不带仓库 `.env`；默认指向线上共享弹幕服务，仍可用环境变量覆盖。
const DEFAULT_SHARED_DANMAKU_URL = 'https://gamebuddy-shared-danmaku-pages.pages.dev';

function cleanText(value, max = 80) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function resolveSharedDanmakuUrl(baseUrl) {
  if (baseUrl !== undefined) return String(baseUrl || '').trim();
  loadProjectEnv();
  return String(process.env.GAMEBUDDY_SHARED_DANMAKU_URL || DEFAULT_SHARED_DANMAKU_URL).trim();
}

class SharedDanmakuClient {
  constructor({ baseUrl, timeoutMs = 4000, clientId } = {}) {
    this.baseUrl = resolveSharedDanmakuUrl(baseUrl).replace(/\/+$/, '');
    this.timeoutMs = Math.max(1000, Math.min(15_000, Number(timeoutMs) || 4000));
    this.clientId = clientId || crypto.randomUUID();
  }

  get enabled() {
    return Boolean(this.baseUrl && typeof fetch === 'function');
  }

  async list({ sceneKey, phase = 'combat' } = {}) {
    if (!this.enabled || !sceneKey) return [];
    const url = new URL(`${this.baseUrl}/v1/danmaku`);
    url.searchParams.set('sceneKey', sceneKey);
    url.searchParams.set('phase', phase === 'death' ? 'death' : 'combat');
    const request = withTimeout(this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-gamebuddy-client': this.clientId },
        signal: request.signal
      });
      if (!response.ok) return [];
      const body = await response.json();
      return Array.isArray(body?.items) ? body.items.filter(item => item?.id && item?.text) : [];
    } catch {
      return [];
    } finally {
      request.clear();
    }
  }

  async submit({ sceneKey, phase = 'combat', character, gameVersion, text } = {}) {
    const content = cleanText(text);
    if (!this.enabled) return { accepted: false, reason: 'shared_service_not_configured' };
    if (!sceneKey || !content) return { accepted: false, reason: 'missing_scene_or_text' };
    const request = withTimeout(this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/danmaku`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-gamebuddy-client': this.clientId
        },
        body: JSON.stringify({
          sceneKey,
          phase: phase === 'death' ? 'death' : 'combat',
          character: cleanText(character, 32),
          gameVersion: cleanText(gameVersion, 32),
          text: content
        }),
        signal: request.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { accepted: false, reason: body.error || `http_${response.status}` };
      return { accepted: true, item: body.item || null };
    } catch (error) {
      return { accepted: false, reason: error.name === 'AbortError' ? 'timeout' : 'network_error' };
    } finally {
      request.clear();
    }
  }
}

module.exports = { SharedDanmakuClient, cleanText, DEFAULT_SHARED_DANMAKU_URL };
