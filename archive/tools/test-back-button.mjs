// 返回按钮回归测试：加载 reader → 强制脏状态（批注同步）→ 点击返回 → 断言导航到项目库。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const URL = BASE + '/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54&from=project-detail';

let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-back-'));
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
    '--force-color-profile=srgb', '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const t0 = Date.now();
    let targets = null;
    while (Date.now() - t0 < 15000) {
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch { await sleep(300); }
    }
    if (!targets) throw new Error('cdp not ready');
    const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => reject(new Error(method + ' timeout')), 25000);
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== id) return;
        clearTimeout(timer);
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalInPage = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
      return r.result.value;
    };
    const consoleErrors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        consoleErrors.push('EXC: ' + (m.params.exceptionDetails?.text || '') + ' ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 300));
      }
    });
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: URL });
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      try {
        const r = await call('Runtime.evaluate', { expression: `document.querySelector('.wb-workspace') !== null`, returnByValue: true });
        if (r.result.value) break;
      } catch { /* context */ }
      await sleep(400);
    }
    await sleep(2500);
    const report = {};
    // 1) 强制脏状态：批注同步（真实用户场景：legacy 迁移/批注修改后 annDirty=true）
    report.dirtyForced = await evalInPage(`(function(){ try { window.__hanaDebug?.triggerAnnotationSync?.(); return true; } catch (e) { return String(e); } })()`);
    await sleep(1200); // 等队列进入 pending
    // 2) 验证 beforeunload 守卫确实会拦截（脏状态下，未经放行 → defaultPrevented=true）
    report.guardBlocksDirty = await evalInPage(`(function(){ var ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; })()`);
    // 3) 点击返回按钮
    report.clickFired = await evalInPage(`(function(){ var b = document.querySelector('.wb-back'); if (!b) return false; b.click(); return true; })()`);
    // 4) 等待导航（最长 12s）
    const t2 = Date.now();
    let finalUrl = '';
    while (Date.now() - t2 < 12000) {
      try {
        const u = await evalInPage(`location.href`);
        if (u.includes('/ui/hana-research/projects') || u.includes('/ui/hana-research/literature')) { finalUrl = u; break; }
        if (u !== URL) finalUrl = u; // 记录任何变化
      } catch { /* navigating */ }
      await sleep(400);
    }
    report.finalUrl = finalUrl;
    report.navigated = finalUrl.includes('/ui/hana-research/projects') || finalUrl.includes('/ui/hana-research/literature');
    report.consoleErrors = consoleErrors.slice(0, 10);
    console.log(JSON.stringify(report, null, 2));
    ws.close();
  } finally {
    try { proc.kill(); } catch { }
    await sleep(600);
    for (let i = 0; i < 5; i++) { try { fs.rmSync(userData, { recursive: true, force: true }); break; } catch { await sleep(400); } }
  }
}

main().catch((error) => { console.error('BACK TEST FAILED:', error); process.exit(1); });
