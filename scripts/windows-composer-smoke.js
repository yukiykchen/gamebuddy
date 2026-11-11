'use strict';
// Runs the installed EXE, not a replacement Electron harness or a modified ASAR.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { WebSocket, WebSocketServer } = require('ws');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = 'Windows 原生输入回归';

async function poll(fn, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const result = await fn(); if (result) return result; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${label} timed out${last ? `: ${last.message}` : ''}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  socket.on('error', () => {});
  return {
    close: () => socket.close(),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const key = ++id;
        const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP ${method} timed out`)); }, 5000);
        pending.set(key, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: key, method, params }));
      });
    }
  };
}

async function run() {
  assert.equal(process.platform, 'win32', 'Native Windows is required; macOS/Wine results do not qualify');
  const executable = path.resolve(process.argv[2] || '');
  assert.ok(fs.existsSync(executable) && /GameBuddy\.exe$/i.test(executable), 'Pass the installed GameBuddy.exe path');
  const output = path.resolve('windows-composer-artifacts');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-windows-ui-'));
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../harness/fixtures/combat-run.json'), 'utf8'))[0];
  const posts = [];
  const service = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/v1/danmaku') && request.method === 'GET') {
      response.end(JSON.stringify({ items: [{ id: 'native-ui-seed', text: 'Windows 输入测试场景' }] }));
    } else if (request.url === '/v1/danmaku' && request.method === 'POST') {
      let body = '';
      request.on('data', data => { body += data; });
      request.on('end', () => {
        try { posts.push(JSON.parse(body)); response.end(JSON.stringify({ item: { id: 'native-ui-submitted' } })); }
        catch { response.statusCode = 400; response.end('{}'); }
      });
    } else { response.statusCode = 503; response.end('{}'); }
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const bridge = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => bridge.once('listening', resolve));
  const send = socket => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'state', data: { ...fixture, timestamp: Date.now() } }));
  };
  bridge.on('connection', socket => { send(socket); socket.on('message', () => send(socket)); });
  const replay = setInterval(() => { for (const socket of bridge.clients) send(socket); }, 500);
  let child, cdp;
  const runtimeLogs = [];
  try {
    const debugPort = await freePort();
    const local = `http://127.0.0.1:${service.address().port}`;
    const env = { ...process.env, GAMEBUDDY_BRIDGE_MODE: 'replay',
      GAMEBUDDY_BRIDGE_URL: `ws://127.0.0.1:${bridge.address().port}`,
      GAMEBUDDY_SHARED_DANMAKU_URL: local,
      GAMEBUDDY_LLM_BASE_URL: `${local}/v1`, GAMEBUDDY_LLM_API_KEY: 'ui-test-placeholder',
      OPENAI_API_KEY: 'ui-test-placeholder', TENCENT_TOKEN: 'ui-test-placeholder',
      GAMEBUDDY_LLM_MODEL: 'no-real-model', GAMEBUDDY_FACTS_DIR: path.join(userData, 'facts'),
      GAMEBUDDY_REVIEW_FILE: path.join(userData, 'review.json'), GAMEBUDDY_FACT_REVIEW_FILE: path.join(userData, 'facts-review.json') };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', error => runtimeLogs.push(error.message));
    child.stdout.on('data', data => runtimeLogs.push(data.toString()));
    child.stderr.on('data', data => runtimeLogs.push(data.toString()));
    const target = await poll(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return (await response.json()).find(item => /danmaku\.html\?surface=composer/.test(item.url));
    }, 'Installed Windows composer target');
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    // CDP only observes DOM state and captures screenshots. All input goes through user32.
    const observe = async expression => {
      const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    assert.equal(await observe(`getComputedStyle(document.documentElement).backgroundColor`), 'rgba(0, 0, 0, 0)');
    assert.equal(await observe(`getComputedStyle(document.body).backgroundColor`), 'rgba(0, 0, 0, 0)');
    const input = (action, extra) => {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'windows-native-input.ps1'), '-Action', action,
        '-TargetProcessId', String(child.pid), ...extra], { timeout: 15000, windowsHide: true });
    };
    const click = async selector => {
      const point = await observe(`(() => {
        const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return {x:Math.round((screenX+r.x+r.width/2)*devicePixelRatio),
          y:Math.round((screenY+r.y+r.height/2)*devicePixelRatio)};
      })()`);
      input('click', ['-X', String(point.x), '-Y', String(point.y)]);
    };
    const expanded = () => observe(`!document.querySelector('#shared-composer-panel').hidden && innerWidth===520 && !document.querySelector('#shared-composer-input').disabled`);
    const screenshot = async name => {
      const shot = await cdp.call('Page.captureScreenshot');
      fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, 'base64'));
    };
    // Wait for a real production scene and a flying message to show both native windows.
    await poll(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return bridge.clients.size && (await response.json()).some(item => /surface=overlay/.test(item.url));
    }, 'Replay connected');
    // Visibility itself is verified by WindowFromPoint in the OS click helper.
    await sleep(3500);
    await screenshot('01-collapsed.png');
    await click('#shared-composer-toggle');
    await poll(expanded, 'First Windows mouse click expands input');
    await poll(async () => await observe(`document.activeElement.id`) === 'shared-composer-input', 'Input receives focus');
    await screenshot('02-expanded.png');
    await click('#shared-composer-close');
    await poll(() => observe(`document.querySelector('#shared-composer-panel').hidden && innerWidth===128`), 'Windows mouse close');
    await click('#shared-composer-toggle');
    await poll(expanded, 'Windows mouse reopen');
    await click('#shared-composer-input');
    input('text', ['-TextBase64', Buffer.from(text).toString('base64')]);
    await poll(async () => await observe(`document.querySelector('#shared-composer-input').value`) === text, 'Native keyboard text');
    await screenshot('03-native-text.png');
    await click('#shared-composer-submit');
    await poll(() => posts.length === 1, 'Production IPC submits to local mock');
    assert.equal(posts[0].text, text);
    assert.ok(posts[0].sceneKey, 'Submitted message must carry production scene context');
    await poll(() => observe(`document.querySelector('#shared-composer-panel').hidden`), 'Composer closes after successful submit');
    await click('#shared-composer-toggle');
    await poll(expanded, 'Reopen after successful submit');
    const result = { platform: process.platform, executable, input: 'user32 SendInput',
      packagedEntry: true, firstClick: true, closeReopen: true, nativeText: true, localSubmitCount: posts.length,
      gameFullscreenTested: false, timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log('PASS: Native Windows installed EXE: OS click open/close/reopen, keyboard text, production IPC and local mock submission.');
    console.log('NOT TESTED: Actual game fullscreen, IME composition, real shared server or real AI calls.');
  } catch (error) {
    if (cdp) {
      try { const shot = await cdp.call('Page.captureScreenshot'); fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(shot.data, 'base64')); } catch {}
    }
    fs.writeFileSync(path.join(output, 'failure.txt'), error.stack);
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'runtime.log'), runtimeLogs.join(''));
    cdp?.close(); clearInterval(replay);
    if (child?.pid) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
    for (const socket of bridge.clients) socket.terminate();
    bridge.close(); service.closeAllConnections(); service.close();
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
