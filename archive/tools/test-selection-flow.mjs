// 交互全链路验证（无头）：选区 → 单一工具栏 → 添加逐句笔记 → 引用到汇总。
// 使用独立临时项目 + 改动副本 PDF（不同 hash → 新 paper），结束后按记录 ID 精确清理。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:2267';
const API = BASE + '/api/hana-research';
const SRC_ATTACHMENT = '1e76fc37-7294-4a66-a6af-12d1e82b3d54';

let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, options = {}) {
  const response = await fetch(API + pathname, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function main() {
  const report = { ids: {} };
  // 0) 兜底清理历史残留（任何轮次崩溃都不会留下数据）
  try {
    await (await import('./cleanup-temp-entities.mjs')).default();
  } catch { /* ignore */ }
  // 1) 临时项目
  const project = await api('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'UI 验证项目-临时' }) });
  const projectId = project.project.id;
  report.ids.projectId = projectId;

  // 2) 改动副本 PDF（追加字节 → 不同 sha256 → 独立 paper/attachment）
  const src = await fetch(`${API}/attachments/${SRC_ATTACHMENT}/file`);
  const srcBytes = new Uint8Array(await src.arrayBuffer());
  const tweaked = new Uint8Array(srcBytes.length + 32);
  tweaked.set(srcBytes);
  tweaked.set([0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a, 0x25, 0x68, 0x61, 0x6e, 0x61, 0x2d, 0x75, 0x69, 0x2d, 0x74, 0x65, 0x73, 0x74, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], srcBytes.length);
  const form = new FormData();
  form.append('title', 'UI 验证论文（临时）');
  form.append('file', new Blob([tweaked], { type: 'application/pdf' }), 'ui-verify-copy.pdf');
  const upload = await api(`/projects/${projectId}/upload-pdf`, { method: 'POST', body: form });
  const paperId = upload.paper.id;
  const attachmentId = upload.attachment.id;
  report.ids.paperId = paperId;
  report.ids.attachmentId = attachmentId;

  // 3) 无头阅读器
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-flow-'));
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    '--no-proxy-server', '--no-first-run', '--force-color-profile=srgb', '--window-size=1440,900', 'about:blank',
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
      const timer = setTimeout(() => reject(new Error(method + ' timeout')), 30000);
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
      if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
      return r.result.value;
    };
    const consoleErrors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200));
      if (d.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC: ' + (d.params.exceptionDetails?.exception?.description || '').slice(0, 200));
    });
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/reader?projectId=${encodeURIComponent(projectId)}&attachmentId=${encodeURIComponent(attachmentId)}&from=project-detail` });
    for (let i = 0; i < 90; i++) {
      try { if (await ev(`document.querySelector('.wb-workspace') !== null`)) break; } catch { /* context */ }
      await sleep(400);
    }
    await sleep(3000);
    await ev(`(function(){ var b = document.querySelector('.wb-collapse-right.collapsed'); if (b) { b.click(); } return true; })()`);
    await sleep(500);

    // 4) 模拟选区（EmbedPDF 正式 API setSelection → 触发 onMenuPlacement）
    const selResult = await ev(`(async function(){
      var reg = window.__hanaDebug.registry;
      var store = reg.getStore();
      var core = store.getState().core;
      var docId = Object.keys(core.documents)[0];
      var selCap = reg.getPlugin('selection').provides();
      var task = selCap.setSelection({ start: { page: 0, index: 0 }, end: { page: 0, index: 45 } }, docId);
      if (task && task.toPromise) await task.toPromise();
      await new Promise(function (r) { setTimeout(r, 800); });
      return { docId: docId };
    })()`);
    report.selResult = selResult;
    const toolbar = await ev(`(function(){
      var tbs = document.querySelectorAll('.wb-selection-toolbar');
      var tb = tbs[0] || null;
      return {
        count: tbs.length,
        text: tb ? tb.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) : null,
        buttons: tb ? tb.querySelectorAll('button').length : 0,
      };
    })()`);
    report.toolbar = toolbar;
    const shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, 'shots', 'flow-toolbar.png'), Buffer.from(shot1.data, 'base64'));

    // 4b) 汇总模板：切到汇总 Tab（文档从未创建）→ 应注入十节模板
    await ev(`(function(){ var t = Array.prototype.find.call(document.querySelectorAll('.wb-note-tab'), function (x) { return x.textContent.indexOf('汇总') >= 0; }); if (t) { t.click(); } return true; })()`);
    await sleep(1200);
    report.summaryTemplate = await ev(`(function(){
      var h1s = document.querySelectorAll('.wb-prose h1');
      return { headings: h1s.length, first: (h1s[0] || {}).textContent || null, last: (h1s[h1s.length - 1] || {}).textContent || null };
    })()`);
    await ev(`(function(){ var t = Array.prototype.find.call(document.querySelectorAll('.wb-note-tab'), function (x) { return x.textContent.indexOf('逐句') >= 0; }); if (t) { t.click(); } return true; })()`);
    await sleep(300);

    // 4c) 分类/标签管理弹窗
    report.managerClicked = await ev(`(function(){ var b = document.querySelector('button[aria-label="管理分类与标签"]'); if (!b) return false; b.click(); return true; })()`);
    await sleep(500);
    report.manager = await ev(`(function(){
      return {
        open: !!document.querySelector('.wb-meta-manager'),
        categoryRows: document.querySelectorAll('.wb-meta-row').length,
        tabLabels: Array.prototype.map.call(document.querySelectorAll('.wb-meta-tab'), function (x) { return x.textContent; }),
      };
    })()`);
    await ev(`(function(){ var b = document.querySelector('.wb-overlay-close'); if (b) { b.click(); } return true; })()`);
    await sleep(300);

    // 5) 点击「添加逐句笔记」
    report.addNoteClicked = await ev(`(function(){ var b = document.querySelector('.wb-selection-toolbar button[aria-label="添加逐句笔记"]'); if (!b) return false; b.click(); return true; })()`);
    await sleep(1600);
    const card = await ev(`(function(){
      var cards = document.querySelectorAll('.wb-snote-card');
      var c = cards[0] || null;
      return {
        count: cards.length,
        tabActive: (document.querySelector('.wb-note-tab.active') || {}).textContent || null,
        quote: c ? (c.querySelector('.wb-snote-quote') || {}).textContent || '' : '',
        focused: document.activeElement && document.activeElement.tagName === 'TEXTAREA',
      };
    })()`);
    report.sentenceCard = card;
    const shot2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, 'shots', 'flow-sentence-note.png'), Buffer.from(shot2.data, 'base64'));

    // 5b) 填写「我的理解」评论（触发防抖自动保存）→ 逐句笔记 → 添加到汇总
    await ev(`(function(){
      var ta = document.querySelector('.wb-snote-comment textarea');
      if (!ta) return false;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '注意隧道假说：稀缺启动改变注意分配');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1600); // 等防抖保存完成
    const commentSaved = await ev(`(async function(){
      var cards = document.querySelectorAll('.wb-snote-card');
      var noteId = cards[0] ? cards[0].getAttribute('data-note-id') : null;
      return { noteId: noteId };
    })()`);
    // 卡片数据属性：为便于测试给卡片加 data-note-id（服务端验证以 API 为准）
    report.commentSaved = await ev(`(async function(){
      var cards = document.querySelectorAll('.wb-snote-card');
      if (!cards[0]) return null;
      var noteId = cards[0].getAttribute('data-note-id') || null;
      if (!noteId) return null;
      var r = await fetch('/api/hana-research/sentence-notes/' + encodeURIComponent(noteId));
      var d = await r.json();
      return { comment: d.note ? d.note.comment : null };
    })()`);
    report.addToSummaryClicked = await ev(`(function(){ var b = document.querySelector('.wb-snote-add-summary'); if (!b) return false; b.click(); return true; })()`);
    await sleep(2000);
    report.fromNoteSummary = await ev(`(function(){
      return {
        tabActive: (document.querySelector('.wb-note-tab.active') || {}).textContent || null,
        citationCards: document.querySelectorAll('.wb-citation').length,
        comments: document.querySelectorAll('.wb-citation-comment').length,
        commentText: (document.querySelector('.wb-citation-comment') || {}).textContent || '',
        fromNoteBadge: document.querySelectorAll('.wb-citation-from-note').length,
      };
    })()`);
    const shot2b = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, 'shots', 'flow-from-note-summary.png'), Buffer.from(shot2b.data, 'base64'));
    // 切回逐句 Tab 继续后续选区引用测试
    await ev(`(function(){ var t = Array.prototype.find.call(document.querySelectorAll('.wb-note-tab'), function (x) { return x.textContent.indexOf('逐句') >= 0; }); if (t) { t.click(); } return true; })()`);
    await sleep(300);

    // 6) 再次选区 → 引用到汇总（显式 docId + 重试，避免新宿主策略未就绪的偶发竞态）
    report.secondSelection = await ev(`(async function(){
      function pick(docId) {
        var reg = window.__hanaDebug.registry;
        var selCap = reg.getPlugin('selection').provides();
        var task = selCap.setSelection({ start: { page: 0, index: 50 }, end: { page: 0, index: 90 } }, docId);
        return (task && task.toPromise) ? task.toPromise() : Promise.resolve(task);
      }
      try {
        var store = window.__hanaDebug.registry.getStore();
        var docId = Object.keys(store.getState().core.documents)[0];
        await pick(docId);
        await new Promise(function (r) { setTimeout(r, 900); });
        return { ok: true, docId: docId };
      } catch (e1) {
        await new Promise(function (r) { setTimeout(r, 1200); });
        try {
          var store2 = window.__hanaDebug.registry.getStore();
          var docId2 = Object.keys(store2.getState().core.documents)[0];
          await pick(docId2);
          await new Promise(function (r) { setTimeout(r, 900); });
          return { ok: true, retried: true, docId: docId2 };
        } catch (e2) {
          return { ok: false, error: String(e1 && e1.message || e1) + ' / ' + String(e2 && e2.message || e2) };
        }
      }
    })()`);
    report.quoteClicked = await ev(`(function(){ var b = document.querySelector('.wb-selection-toolbar button[aria-label="引用到汇总笔记"]'); if (!b) return false; b.click(); return true; })()`);
    await sleep(2000);
    const summary = await ev(`(function(){
      return {
        tabActive: (document.querySelector('.wb-note-tab.active') || {}).textContent || null,
        citations: document.querySelectorAll('.wb-cite-chip').length,
        citationCards: document.querySelectorAll('.wb-citation').length,
        editorText: (document.querySelector('.wb-prose') || {}).textContent ? document.querySelector('.wb-prose').textContent.slice(0, 80) : '',
      };
    })()`);
    report.summary = summary;
    const shot3 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, 'shots', 'flow-summary-citation.png'), Buffer.from(shot3.data, 'base64'));

    // 7) 服务端核对
    const sn = await api(`/papers/${encodeURIComponent(paperId)}/sentence-notes`);
    const ann = await api(`/attachments/${encodeURIComponent(attachmentId)}/annotations-v2`);
    const doc = await api(`/papers/${encodeURIComponent(paperId)}/note-document`);
    const docJson = doc.document ? JSON.stringify(doc.document.tiptapJson || {}) : '';
    report.server = {
      sentenceNotes: sn.notes.length,
      sentenceNoteQuote: sn.notes[0] ? sn.notes[0].quotedText.slice(0, 60) : '',
      sentenceNoteAnnotationId: sn.notes[0]?.annotationId || null,
      annotations: ann.annotations.length,
      docExists: !!doc.document,
      docHasCitationCard: docJson.includes('citationCard'),
      docHasTags: (doc.document?.tags || []).join(','),
    };
    const cit = doc.document ? await api(`/note-documents/${encodeURIComponent(doc.document.id)}/citations`) : { citations: [] };
    report.server.citations = cit.citations.length;
    report.server.citationSuffix = cit.citations[0]?.suffix || '';
    report.server.docHasCommentCard = docJson.includes('"comment"');
    report.consoleErrors = consoleErrors.slice(0, 8);
    console.log(JSON.stringify(report, null, 2));
    ws.close();
  } finally {
    try { proc.kill(); } catch { /* dead */ }
    await sleep(600);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* lock */ }
  }
  // 8) 清理（兜底模式：命名规则 + local- 前缀 + 无项目关联；保留真实用户数据）
  try {
    const cleanup = await import('./cleanup-temp-entities.mjs');
    const removed = await cleanup.default();
    report.cleanup = 'done: ' + JSON.stringify(removed);
  } catch (error) {
    report.cleanup = 'failed: ' + String(error.message || error);
  }
  console.log('[cleanup]', report.cleanup);
}

main().catch((error) => { console.error('FLOW TEST FAILED:', error); process.exit(1); });
