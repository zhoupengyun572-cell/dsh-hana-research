// 阅读工作区冒烟测试：加载 reader 页面，收集控制台错误，截图，检查关键 UI 元素。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const URL = BASE + '/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54&from=project-detail';

let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-wb-smoke-'));
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
    const consoleErrors = [];
    const exceptions = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        exceptions.push((m.params.exceptionDetails?.text || '') + ' ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 300));
      }
    });
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: URL });

    // 等待工作区挂载
    const t1 = Date.now();
    let mounted = false;
    while (Date.now() - t1 < 30000) {
      try {
        const r = await call('Runtime.evaluate', { expression: `document.querySelector('.wb-workspace') !== null || document.querySelector('.wb-boot-state') !== null`, returnByValue: true });
        if (r.result.value) { mounted = true; break; }
      } catch { /* context */ }
      await sleep(400);
    }
    await sleep(2500); // 等 EmbedPDF 就绪 + 数据加载
    // 展开被折叠的左右栏（真实保存状态可能折叠），再验证面板内容
    await call('Runtime.evaluate', {
      expression: `(function(){ var b = document.querySelector('.wb-collapse-left.collapsed'); if (b) b.click(); var b2 = document.querySelector('.wb-collapse-right.collapsed'); if (b2) b2.click(); return true; })()`, returnByValue: true,
    });
    await sleep(600);
    const report = {};
    if (!mounted) {
      report.mounted = false;
    } else {
      report.mounted = true;
      const probe = await call('Runtime.evaluate', {
        expression: `(function(){
          var nav = sessionStorage.getItem('hana-reader-nav');
          var out = {
            nav: nav ? JSON.parse(nav) : null,
            tabs: document.querySelectorAll('.wb-note-tab').length,
            sentenceTools: !!document.querySelector('.wb-sentence-tools'),
            summaryTab: !!document.querySelector('.wb-summary-tab'),
            noteCards: document.querySelectorAll('.wb-snote-card').length,
            backBusy: document.querySelector('.wb-back')?.getAttribute('aria-busy'),
            uiSchemaSelectionMenus: (window.__hanaDebug?.getUiSchema?.()?.selectionMenus) ? Object.keys(window.__hanaDebug.getUiSchema().selectionMenus).length : 'n/a',
            registryReady: !!window.__hanaDebug,
          };
          return out;
        })()`, returnByValue: true,
      });
      report.probe = probe.result.value;
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(HERE, 'shots', 'workbench-smoke-v14.png'), Buffer.from(shot.data, 'base64'));
    }
    report.consoleErrors = consoleErrors.slice(0, 10);
    report.exceptions = exceptions.slice(0, 10);
    console.log(JSON.stringify(report, null, 2));
    ws.close();
  } finally {
    try { proc.kill(); } catch { }
    await sleep(600);
    for (let i = 0; i < 5; i++) { try { fs.rmSync(userData, { recursive: true, force: true }); break; } catch { await sleep(400); } }
  }
}

main().catch((error) => { console.error('SMOKE FAILED:', error); process.exit(1); });
