// P6 研究驾驶舱只读验证：页签抽屉 / 下一步卡 / 副驾驶 / 研究闭环 / 设置 / 专注模式。
// 不写入研究数据；截图输出 tools/shots/cockpit-*.png；打印 DOM 断言与控制台错误。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const port = 9341;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let sequence = 0;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-cockpit-'));
  const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-proxy-server', '--no-first-run', '--window-size=1440,920', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets;
    for (let i = 0; i < 60; i += 1) {
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
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map(arg => arg.value || arg.description || '').join(' ').slice(0, 240));
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text || 'runtime exception');
    });
    await call('Page.enable'); await call('Runtime.enable');
    await call('Page.navigate', { url: `${base}/ui/hana-research/projects` });
    // 等待项目卡
    for (let i = 0; i < 80; i += 1) {
      const ready = await call('Runtime.evaluate', { expression: "document.querySelector('[data-project-id]') !== null", returnByValue: true });
      if (ready.result.value) break;
      await sleep(250);
    }
    const gear = await call('Runtime.evaluate', { expression: "!!document.querySelector('#open-settings')", returnByValue: true });
    // 打开第一个项目抽屉
    await call('Runtime.evaluate', { expression: "document.querySelector('[data-project-id]')?.click(); true", returnByValue: true });
    for (let i = 0; i < 100; i += 1) {
      const ready = await call('Runtime.evaluate', { expression: "document.querySelector('[data-drawer-tabpanel=\"overview\"]') !== null && !document.querySelector('#drawer-panel .drawer-loading')", returnByValue: true });
      if (ready.result.value) break;
      await sleep(250);
    }
    await sleep(600);
    const overview = await call('Runtime.evaluate', { expression: `(() => {
      const txt = el => (el ? el.textContent.replace(/\\s+/g, ' ').trim() : '');
      return {
        drawer: !!document.querySelector('#drawer-panel'),
        tabs: Array.from(document.querySelectorAll('[data-drawer-tab]')).map(b => b.textContent.replace(/\\s+/g, ' ').trim()),
        nextStep: !!document.querySelector('.hr-next-step'),
        nextStepList: document.querySelectorAll('.hr-next-list li').length,
        copilot: !!document.querySelector('.hr-copilot'),
        copilotItems: document.querySelectorAll('.hr-copilot-item').length,
        copilotActions: ['查看依据','交给 Agent','暂不处理'].every(label => document.querySelector('.hr-copilot-item:first-child')?.textContent.includes(label)),
        pipeline: !!document.querySelector('.hr-pipeline'),
        pipeStages: Array.from(document.querySelectorAll('.hr-pipe-stage')).map(b => txt(b).slice(0, 40)),
        sourceNote: document.querySelector('.hr-copilot-foot') ? txt(document.querySelector('.hr-copilot-foot')).slice(0, 40) : '',
        overflow: (() => {
          const panelEl = document.querySelector('#drawer-panel');
          if (!panelEl) return null;
          let offenders = [];
          const r = panelEl.getBoundingClientRect();
          panelEl.querySelectorAll('*').forEach(el => {
            const er = el.getBoundingClientRect();
            if (er.width === 0) return;
            if (er.right > r.right + 0.5) offenders.push((el.className || el.tagName).toString().slice(0, 50));
          });
          return { panelScrollW: panelEl.scrollWidth, panelClientW: panelEl.clientWidth, offenders: offenders.slice(0, 8) };
        })(),
      };
    })()`, returnByValue: true });
    let shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, 'cockpit-overview.png'), Buffer.from(shot1.data, 'base64'));

    // 切证据页
    await call('Runtime.evaluate', { expression: "document.querySelector('[data-drawer-tab=\"evidence\"]')?.click(); true", returnByValue: true });
    await sleep(250);
    const evidence = await call('Runtime.evaluate', { expression: `(() => ({
      panelVisible: !document.querySelector('[data-drawer-tabpanel="evidence"]').hidden,
      papers: document.querySelectorAll('.drawer-paper').length,
      roleFilter: document.querySelectorAll('[data-drawer-role-filter]').length,
      matrixBtn: !!document.querySelector('[data-evidence-matrix-open]'),
      relationBlock: !!document.querySelector('#drawer-relations'),
    }))()`, returnByValue: true });
    shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, 'cockpit-evidence.png'), Buffer.from(shot1.data, 'base64'));

    // 切任务与笔记页
    await call('Runtime.evaluate', { expression: "document.querySelector('[data-drawer-tab=\"tasks\"]')?.click(); true", returnByValue: true });
    await sleep(250);
    const tasks = await call('Runtime.evaluate', { expression: `(() => ({
      panelVisible: !document.querySelector('[data-drawer-tabpanel="tasks"]').hidden,
      taskPanel: !!document.querySelector('#project-tasks-section'),
      taskFilters: document.querySelectorAll('[data-task-filter]').length,
      quickForm: !!document.querySelector('#task-quick-form'),
      noteForm: !!document.querySelector('#drawer-note-form'),
      noteList: document.querySelectorAll('.drawer-note-item').length,
    }))()`, returnByValue: true });
    shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, 'cockpit-tasks.png'), Buffer.from(shot1.data, 'base64'));

    // 设置弹窗 + 专注模式
    await call('Runtime.evaluate', { expression: "document.querySelector('#open-settings')?.click(); true", returnByValue: true });
    await sleep(300);
    const settings = await call('Runtime.evaluate', { expression: `(() => ({
      modal: !!document.querySelector('.hr-settings-modal'),
      rows: document.querySelectorAll('.hr-setting-row').length,
      shortcuts: document.querySelectorAll('.hr-shortcut-list li').length,
      policyNote: (document.querySelector('.hr-settings-note')?.textContent || '').slice(0, 40),
    }))()`, returnByValue: true });
    shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, 'cockpit-settings.png'), Buffer.from(shot1.data, 'base64'));
    // 专注模式联动
    await call('Runtime.evaluate', { expression: "(document.querySelector('[data-setting=\"focusMode\"]')?.click(), true)", returnByValue: true });
    await sleep(200);
    const focus = await call('Runtime.evaluate', { expression: "document.body.classList.contains('hr-focus')", returnByValue: true });
    // 还原设置（避免污染用户偏好：只影响本临时 profile）
    await call('Runtime.evaluate', { expression: "(document.querySelector('[data-setting=\"focusMode\"]')?.click(), true)", returnByValue: true });

    console.log(JSON.stringify({
      url: base,
      gear,
      settings,
      overview: overview.result.value,
      evidence: evidence.result.value,
      tasks: tasks.result.value,
      focusModeApplied: focus.result.value,
      consoleErrors: errors.slice(0, 12),
    }, null, 2));
    socket.close();
  } finally {
    try { proc.kill(); } catch { /* noop */ }
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

main().catch(error => { console.error('COCKPIT VERIFY FAILED:', error); process.exit(1); });
