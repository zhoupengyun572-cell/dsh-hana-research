// 项目任务面板只读冒烟检查：打开真实项目抽屉，确认控件、截图并收集异常。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9335;
const base = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let sequence = 0;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-task-smoke-'));
  const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-proxy-server', '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets;
    for (let i = 0; i < 50; i += 1) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(250); }
    }
    if (!targets) throw new Error('CDP 未就绪');
    const target = targets.find(item => item.type === 'page' && !item.url.startsWith('devtools'));
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => reject(new Error(`${method} 超时`)), 20000);
      const onMessage = event => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timer); socket.removeEventListener('message', onMessage);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      };
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description || '').join(' ').slice(0, 240));
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text || 'runtime exception');
    });
    await call('Page.enable'); await call('Runtime.enable');
    await call('Page.navigate', { url: `${base}/ui/hana-research/projects` });
    for (let i = 0; i < 80; i += 1) {
      const ready = await call('Runtime.evaluate', { expression: "document.querySelector('[data-project-id]') !== null", returnByValue: true });
      if (ready.result.value) break;
      await sleep(250);
    }
    await call('Runtime.evaluate', { expression: "document.querySelector('[data-project-id]')?.click(); true", returnByValue: true });
    for (let i = 0; i < 80; i += 1) {
      const ready = await call('Runtime.evaluate', { expression: "document.querySelector('#project-tasks-section') !== null", returnByValue: true });
      if (ready.result.value) break;
      await sleep(250);
    }
    await sleep(500);
    const probe = await call('Runtime.evaluate', { expression: `(() => ({
      drawer: !!document.querySelector('#drawer-panel'),
      taskPanel: !!document.querySelector('#project-tasks-section'),
      filters: document.querySelectorAll('[data-task-filter]').length,
      taskRows: document.querySelectorAll('[data-task-status]').length,
      quickForm: !!document.querySelector('#task-quick-form'),
      agentButton: !!document.querySelector('[data-task-agent]'),
    }))()`, returnByValue: true });
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(here, 'shots', 'project-tasks-smoke.png'), Buffer.from(shot.data, 'base64'));
    console.log(JSON.stringify({ mounted: probe.result.value, consoleErrors: errors.slice(0, 10) }, null, 2));
    socket.close();
  } finally {
    try { proc.kill(); } catch { /* noop */ }
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* temp cleanup is best-effort */ }
  }
}

main().catch(error => { console.error('TASK SMOKE FAILED:', error); process.exit(1); });
