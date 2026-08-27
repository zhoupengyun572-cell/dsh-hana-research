// 只读验证：阅读器「进入证据矩阵」→ 返回项目库 → 抽屉重开 + 证据矩阵弹窗自动打开。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9354;
const BASE = 'http://127.0.0.1:4754';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

const main = async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-closure-'));
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--no-proxy-server', '--no-first-run', '--window-size=1360,900', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(300); } }
    const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => reject(new Error(method + ' timeout')), 30000);
      const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id !== id) return; clearTimeout(timer); ws.removeEventListener('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const ev = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
      return r.result.value;
    };
    const consoleErrors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      if (d.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC: ' + (d.params.exceptionDetails?.exception?.description || '').slice(0, 200));
    });
    await call('Page.enable'); await call('Runtime.enable');
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/reader?projectId=${encodeURIComponent('project-adolescent-emotion')}&attachmentId=${encodeURIComponent('e7475223-6228-4871-8b36-5765277e8aeb')}&from=project-detail` });
    for (let i = 0; i < 90; i++) { try { if (await ev(`document.querySelector('.wb-workspace') !== null`)) break; } catch {} await sleep(400); }
    await sleep(2200);
    await ev(`(function(){ var m = document.querySelector('.wb-snote-more'); if (m) m.click(); return true; })()`);
    await sleep(200);
    const clicked = await ev(`(function(){
      var b = Array.from(document.querySelectorAll('.wb-snote-more-pop > button')).find(x => x.textContent.includes('证据矩阵'));
      if (b) { b.click(); return true; }
      return false;
    })()`);
    // 等待导航 → 项目库抽屉 + 证据矩阵弹窗
    let result = null;
    for (let i = 0; i < 50; i++) {
      const state = await ev(`(() => ({
        url: location.pathname,
        drawer: !!document.querySelector('#drawer-panel'),
        matrixModal: !!document.querySelector('.modal-panel'),
        matrixText: (document.querySelector('.modal-panel h2')?.textContent || '').slice(0, 20),
      }))()`).catch(() => null);
      if (state && state.drawer && state.matrixModal) { result = state; break; }
      await sleep(400);
    }
    if (!result) result = await ev(`(() => ({ url: location.pathname, drawer: !!document.querySelector('#drawer-panel'), matrixModal: !!document.querySelector('.modal-panel') }))()`);
    console.log(JSON.stringify({ clicked, result, consoleErrors: consoleErrors.slice(0, 8) }, null, 2));
    ws.close();
  } finally {
    try { proc.kill(); } catch { /* noop */ }
    await sleep(400);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* noop */ }
  }
};
main().catch((e) => { console.error('CLOSURE FAILED:', e); process.exit(1); });
