// 快捷键首访验证（只读）：无需打开设置，Ctrl/⌘K 聚焦搜索、N 新建项目、Alt 1/2/3 切页签、Esc 关闭。
// 用法：node tools/verify-shortcuts.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9360;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

const main = async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-shortcut-'));
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--no-proxy-server', '--no-first-run', '--window-size=1400,880', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(300); } }
    const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000);
      const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id !== id) return; clearTimeout(timer); ws.removeEventListener('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const ev = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
      return r.result.value;
    };
    const errors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('E: ' + (d.params.args.map((a) => a.value || '').join(' ')).slice(0, 140));
      if (d.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (d.params.exceptionDetails?.exception?.description || '').slice(0, 140));
    });
    await call('Page.enable'); await call('Runtime.enable');
    const results = {};

    // 项目库页首访（不打开设置）
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/projects` });
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('#project-search')`).catch(() => false)) break; await sleep(300); }
    await ev(`document.querySelector('#project-search').blur()`).catch(() => {});
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await sleep(150);
    results.ctrlK_focusProjectSearch = await ev(`document.activeElement && document.activeElement.id === 'project-search'`);
    await ev(`document.activeElement && document.activeElement.blur()`).catch(() => {});
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))`);
    await sleep(180);
    results.n_opensComposer = await ev(`!document.querySelector('#project-composer').hidden`);
    await ev(`document.querySelector('#cancel-project')?.click()`);
    await sleep(200);

    // 打开抽屉 → Alt+2 → 证据页；Alt+1 → 概览；Esc 关闭
    await ev(`(function(){ var c=document.querySelector('[data-project-id]'); if(c)c.click(); return true; })()`);
    for (let i = 0; i < 100; i++) { if (await ev(`!!document.querySelector('[data-drawer-tabpanel="overview"]') && !document.querySelector('#drawer-panel .drawer-loading')`).catch(() => false)) break; await sleep(300); }
    await ev(`document.activeElement && document.activeElement.blur()`).catch(() => {});
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true }))`);
    await sleep(220);
    results.alt2_evidenceTab = await ev(`!document.querySelector('[data-drawer-tabpanel="evidence"]').hidden`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }))`);
    await sleep(200);
    results.alt1_overviewTab = await ev(`!document.querySelector('[data-drawer-tabpanel="overview"]').hidden`);
    await ev(`document.activeElement && document.activeElement.blur()`).catch(() => {});
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(600);
    const escState = await ev(`({ hidden: document.querySelector('#project-drawer').hidden, closing: document.querySelector('#project-drawer').classList.contains('closing') })`);
    results.esc_closesDrawer = escState.hidden === true;
    results.escDebug = escState;

    // 文献中心页：Ctrl+K 聚焦文献搜索
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/literature` });
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('#paper-search')`).catch(() => false)) break; await sleep(300); }
    await ev(`document.querySelector('#paper-search').blur()`).catch(() => {});
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await sleep(150);
    results.ctrlK_literatureSearch = await ev(`document.activeElement && document.activeElement.id === 'paper-search'`);

    results.consoleErrors = errors.slice(0, 8);

    // 保存偏好首访即应用：预置 focusMode + 紧凑密度 → 重载后 body 类即时生效
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/literature` });
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('#paper-search')`).catch(() => false)) break; await sleep(300); }
    await ev(`localStorage.setItem('hana-research-settings', JSON.stringify({ focusMode: true, infoDensity: 'compact', motion: 'reduced', shortcuts: false }))`);
    await call('Page.reload', {});
    for (let i = 0; i < 60; i++) { if (await ev(`!!document.querySelector('#paper-search')`).catch(() => false)) break; await sleep(300); }
    await sleep(300);
    const prefs = await ev(`({ focus: document.body.classList.contains('hr-focus'), density: document.body.classList.contains('hr-density-compact'), reduced: document.body.classList.contains('hr-motion-reduced') })`);
    results.savedPrefsAppliedOnLoad = prefs;
    results.consoleErrors = errors.slice(0, 8);
    console.log(JSON.stringify(results, null, 2));
    ws.close();
  } finally {
    try { ws?.close(); } catch { /* noop */ }
    try { proc.kill(); } catch { /* noop */ }
    await sleep(400);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
};
main().catch((e) => { console.error('SHORTCUT VERIFY FAILED:', e); process.exit(1); });
