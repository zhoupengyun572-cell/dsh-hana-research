// 验证逐句 Tab：切换后展示真实用户笔记卡片（摘录/页码/分类/状态/评论框）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9336;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:2267';
const URL = BASE + '/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54&from=project-detail';

let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-sn-'));
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    '--no-proxy-server', '--no-first-run', '--force-color-profile=srgb', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(300); }
    }
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
    const ev = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200));
      return r.result.value;
    };
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: URL });
    for (let i = 0; i < 75; i++) {
      try { if (await ev(`document.querySelector('.wb-workspace') !== null`)) break; } catch { /* context */ }
      await sleep(400);
    }
    await sleep(2500);
    await ev(`(function(){ var b = document.querySelector('.wb-collapse-right.collapsed'); if (b) { b.click(); } return true; })()`);
    await sleep(400);
    await ev(`(function(){ var t = Array.prototype.find.call(document.querySelectorAll('.wb-note-tab'), function (x) { return x.textContent.indexOf('逐句') >= 0; }); if (t) { t.click(); } return true; })()`);
    await sleep(600);
    const out = await ev(`(function(){
      var cards = Array.prototype.slice.call(document.querySelectorAll('.wb-snote-card'));
      var first = cards[0] || null;
      return {
        cards: cards.length,
        first: first ? {
          quote: (first.querySelector('.wb-snote-quote') || {}).textContent ? first.querySelector('.wb-snote-quote').textContent.slice(0, 60) : null,
          page: (first.querySelector('.wb-snote-page') || {}).textContent || null,
          hasCategory: !!first.querySelector('.wb-snote-category'),
          hasTags: first.querySelectorAll('.wb-snote-tag').length,
          hasStar: !!first.querySelector('.wb-snote-star'),
          hasComment: !!first.querySelector('.wb-snote-comment textarea'),
          hasMore: !!first.querySelector('.wb-snote-more'),
        } : null,
      };
    })()`);
    console.log(JSON.stringify(out, null, 1));
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, 'shots', 'workbench-sentence-tab.png'), Buffer.from(shot.data, 'base64'));
    ws.close();
  } finally {
    try { proc.kill(); } catch { /* dead */ }
    await sleep(600);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* lock */ }
  }
}

main().catch((error) => { console.error('CHECK FAILED:', error); process.exit(1); });
