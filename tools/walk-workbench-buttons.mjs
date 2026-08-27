// 阅读工作台按钮步行（无头）：在隔离临时项目 + 改动副本 PDF 上逐个点击所有可用按钮，
// 捕获任何点击引发的运行时异常/控制台错误，并抽样记录可见状态变化。测后清理隔离数据。
// 用法：node tools/walk-workbench-buttons.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9359;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const API = BASE + '/api/hana-research';
const SRC_ATTACHMENT = '1e76fc37-7294-4a66-a6af-12d1e82b3d54';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

async function api(p, o = {}) {
  const opts = { ...o };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
    if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + p, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  return body;
}

const report = { clicked: 0, errors: [], samples: [] };

async function main() {
  let projectId = '', attachmentId = '';
  try {
    const project = await api('/projects', { method: 'POST', body: { title: 'UI 工作台按钮-临时' } });
    projectId = project.project.id;
    const src = await fetch(`${API}/attachments/${SRC_ATTACHMENT}/file`);
    const srcBytes = new Uint8Array(await src.arrayBuffer());
    const tweaked = new Uint8Array(srcBytes.length + 32);
    tweaked.set(srcBytes);
    tweaked.set([0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a, 0x25, 0x68, 0x61, 0x6e, 0x61, 0x2d, 0x62, 0x74, 0x6e, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], srcBytes.length);
    const form = new FormData();
    form.append('title', '工作台按钮步行（临时）');
    form.append('file', new Blob([tweaked], { type: 'application/pdf' }), 'wb-btn-walk.pdf');
    const upload = await api(`/projects/${projectId}/upload-pdf`, { method: 'POST', body: form });
    attachmentId = upload.attachment.id;
    await api(`/projects/${projectId}/notes`, { method: 'POST', body: { content: '临时任务', tags: ['研究任务', '状态:待办', '优先级:普通'] } });
  } catch (e) {
    console.log(JSON.stringify({ fatal: 'seed failed', error: e.message }, null, 2));
    for (const id of [projectId]) if (id) await api(`/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    process.exit(1);
  }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-wb-walk-'));
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--no-proxy-server', '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(300); } }
    const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    ws = new WebSocket(page.webSocketDebuggerUrl);
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
    let errors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160));
      if (d.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (d.params.exceptionDetails?.exception?.description || '').slice(0, 160));
    });
    await call('Page.enable'); await call('Runtime.enable');
    const drain = () => { const list = errors.slice(); errors = []; return list; };

    await call('Page.navigate', { url: `${BASE}/ui/hana-research/reader?projectId=${encodeURIComponent(projectId)}&attachmentId=${encodeURIComponent(attachmentId)}&from=project-detail` });
    let mounted = false;
    for (let i = 0; i < 120; i++) {
      mounted = await ev(`!!document.querySelector('.wb-workspace')`).catch(() => false);
      if (mounted) break;
      await sleep(400);
    }
    await sleep(3000);
    report.debug = await ev(`({ mounted: !!document.querySelector('.wb-workspace'), buttons: document.querySelectorAll('button').length, bootErr: (document.querySelector('.wb-boot-error')?.textContent || '').slice(0, 80), url: location.pathname })`);
    // 展开右侧（如折叠）与左侧批注面板，扩大按钮覆盖
    await ev(`(function(){ var c=document.querySelector('.wb-collapse-right.collapsed'); if(c)c.click(); return true; })()`);
    await sleep(300);
    await ev(`(function(){ var c=document.querySelector('.wb-collapse-left.collapsed'); if(c)c.click(); return true; })()`);
    await sleep(300);

    // 快照按钮指纹（class + 文本 + 禁用态）
    async function runWalk(tag) {
      const snap = await ev(`Array.from(document.querySelectorAll('button')).filter(b => !b.disabled).map(b => { const cls = (typeof b.className === 'string' ? b.className : b.className.baseVal || '').toString().slice(0, 60); return { fp: cls + '|' + (b.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24), cls: cls.split(' ')[0] || 'button' }; })`);
      const tagReport = { tag, snapCount: Array.isArray(snap) ? snap.length : -1, clicked: 0, found: 0, errors: [], samples: [] };
      for (const item of snap.slice(0, 80)) {
        const found = await ev(`(function(){ var fp=${JSON.stringify(item.fp)}; var list=Array.from(document.querySelectorAll('button')).filter(function(b){ if(b.disabled)return false; var cls=(typeof b.className==='string'?b.className:b.className.baseVal||'').toString().slice(0,60); var txt=(b.textContent||'').trim().replace(/\\s+/g,' ').slice(0,24); return (cls+'|'+txt)===fp; }); return { ok: list.length > 0 }; })()`).then((r) => r && r.ok === true).catch(() => false);
        if (!found) continue;
        tagReport.found += 1;
        errors = [];
        const clickErr = await (async () => {
          try { await ev(`(function(){ var fp=${JSON.stringify(item.fp)}; var list=Array.from(document.querySelectorAll('button')).filter(function(b){ if(b.disabled)return false; var cls=(typeof b.className==='string'?b.className:b.className.baseVal||'').toString().slice(0,60); var txt=(b.textContent||'').trim().replace(/\\s+/g,' ').slice(0,24); return (cls+'|'+txt)===fp; }); var b=list[0]; if(!b)return false; b.click(); return true; })()`);
            return null;
          } catch (e) { return String(e.message || e); }
        })();
        await sleep(260);
        const newErrors = drain();
        tagReport.clicked += 1;
        tagReport.samples.push(`${item.cls} :: ${item.fp.split('|')[1] || ''}`);
        if (clickErr || newErrors.length) {
          tagReport.errors.push({ button: item.fp.slice(0, 90), evalError: clickErr, console: newErrors.slice(0, 3) });
        }
        await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`).catch(() => {});
        await sleep(120);
      }
      return tagReport;
    }

    const pass1 = await runWalk('sentence-tab');
    // 第二遍：切到汇总笔记（编辑器工具栏 + 引文卡按钮）
    await ev(`(function(){ var t=Array.from(document.querySelectorAll('.wb-note-tab')).find(function(b){ return b.textContent.indexOf('汇总')>=0; }); if(t)t.click(); return true; })()`);
    await sleep(800);
    const pass2 = await runWalk('summary-tab');
    report.passes = [pass1, pass2];
    report.clicked = pass1.clicked + pass2.clicked;
    report.errors = pass1.errors.concat(pass2.errors);
    report.samples = pass1.samples.concat(pass2.samples).slice(0, 80);
    console.log(JSON.stringify(report, null, 2));
    ws.close();
  } finally {
    try { ws?.close(); } catch { /* noop */ }
    try { proc.kill(); } catch { /* noop */ }
    await sleep(500);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* best-effort */ }
    for (const id of [projectId]) if (id) await api(`/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    const cleaned = await (await import('./cleanup-temp-entities.mjs')).default();
    console.log('[cleanup]', JSON.stringify(cleaned));
  }
}

main().catch((e) => { console.error('WB WALK FAILED:', e); process.exit(1); });
