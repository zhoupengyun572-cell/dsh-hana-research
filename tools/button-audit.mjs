// 交互按钮体检（暂无破坏性写库）：种子隔离临时项目 + 临时 local papers，
// 逐个点击抽屉/文献中心/设置里的按钮与选择器，断言副作用并捕获控制台异常，测后清理。
// 用法：node tools/button-audit.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9358;
const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const API = BASE + '/api/hana-research';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

async function api(p, o = {}) {
  const opts = { ...o };
  if (opts.body !== undefined) {
    opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
    if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + p, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  return body;
}

const results = [];
const record = (label, ok, note = '') => results.push({ label, ok: !!ok, note });

async function main() {
  // ── 0) 种子隔离数据 ──
  const seeded = { projects: [], papers: [] };
  try {
    const project = await api('/projects', { method: 'POST', body: { title: 'UI 按钮体检-临时' } });
    seeded.projects.push(project.project.id);
    const projectId = project.project.id;
    const paperIds = [];
    for (const [idx, name] of ['按钮体检甲', '按钮体检乙'].entries()) {
      const saved = await api('/search/save', { method: 'POST', body: { record: { title: name, source: 'local', sourceId: `audit-${idx}`, venue: '体检期刊', year: 2024, abstract: '临时' } } });
      seeded.papers.push(saved.paper.id);
      paperIds.push(saved.paper.id);
    }
    for (const id of paperIds) await api(`/projects/${projectId}/papers`, { method: 'POST', body: { paperId: id } });
    await api(`/projects/${projectId}/notes`, { method: 'POST', body: { content: '推进综述写作', tags: ['研究任务', '状态:待办', '优先级:高'], paperId: paperIds[0] } });
    await api(`/projects/${projectId}/notes`, { method: 'POST', body: { content: '一条项目笔记', tags: ['理论'] } });
    await api(`/projects/${projectId}/relations`, { method: 'POST', body: { fromPaperId: paperIds[0], toPaperId: paperIds[1], relation: 'supports', note: '体检关系' } });
  } catch (e) {
    console.log(JSON.stringify({ fatal: 'seed failed', error: e.message }, null, 2));
    await (await import('./cleanup-temp-entities.mjs')).default().catch(() => {});
    process.exit(1);
  }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-btn-audit-'));
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--no-proxy-server', '--no-first-run', '--window-size=1440,920', 'about:blank'], { stdio: 'ignore' });
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
    // 控制台异常缓冲（可清空后断言「本次点击无新增异常」）
    let errors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      if (d.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (d.params.exceptionDetails?.exception?.description || '').slice(0, 200));
    });
    await call('Page.enable'); await call('Runtime.enable');
    const drain = () => { const list = errors.slice(); errors = []; return list; };
    const click = async (expr) => { errors = []; await ev(expr); await sleep(380); return drain(); };

    // ── A) 文献中心顶部 / 纸片 / 管理菜单 ──
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/literature` });
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('#run-search')`).catch(() => false)) break; await sleep(300); }
    await sleep(400);
    record('lit: 保存检索-空词守卫(报错不弹)', await (async () => { await click(`document.querySelector('#save-search')?.click()`); return ev(`document.querySelector('#notice')?.classList.contains('visible')`); })());
    record('lit: 保存检索弹窗', await (async () => { await click(`(function(){ document.querySelector('#live-search').value='attention'; document.querySelector('#save-search')?.click(); return true; })()`); return ev(`!!document.querySelector('#save-search-form')`); })());
    await click(`document.querySelector('#save-search-form [data-modal-cancel], [data-modal-cancel]')?.click()`).then(() => sleep(200));
    record('lit: 保存的检索弹窗', await (async () => { await click(`document.querySelector('#saved-searches')?.click()`); return ev(`!!document.querySelector('.modal-panel')`); })());
    await click(`document.querySelector('.modal-layer') && (function(){ document.querySelector('.modal-layer').remove(); return true; })()`);
    record('lit: 管理菜单展开', await (async () => { await click(`document.querySelector('#manage-menu')?.click()`); return ev(`!document.querySelector('#manage-menu-pop').hidden`); })());
    record('lit: 标签管理弹窗', await (async () => { await click(`document.querySelector('#tag-manager')?.click()`); return ev(`!!document.querySelector('#tag-manager-layer, .modal-layer')`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('lit: 翻译设置弹窗', await (async () => { await click(`document.querySelector('#translate-settings')?.click()`); return ev(`!!document.querySelector('#translate-config-form')`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('lit: 为主题纸片筛选激活', await (async () => { await click(`document.querySelector('[data-topic]')?.click()`); return ev(`document.querySelector('[data-topic]').classList.contains('active')`); })());
    record('lit: 状态纸片筛选激活', await (async () => { await click(`document.querySelector('[data-read-status-filter="reading"]')?.click()`); return ev(`document.querySelector('[data-read-status-filter="reading"]').classList.contains('active')`); })());
    record('lit: 方法学纸片筛选激活', await (async () => { await click(`document.querySelector('[data-methodology-filter="实验"]')?.click()`); return ev(`document.querySelector('[data-methodology-filter="实验"]').classList.contains('active')`); })());
    record('lit: 导出收藏(下载)', await (async () => { await click(`document.querySelector('#export-favorites')?.click()`); return ev(`true`); })());

    // ── 文献卡按钮（用临时 local 论文，避免触碰真实文献） ──
    const cardExpr = (kw) => `(function(){ var cards=document.querySelectorAll('[data-paper-card]'); for(var i=0;i<cards.length;i++){ if(cards[i].textContent.indexOf(${JSON.stringify(kw)})>=0) return cards[i]; } return null; })()`;
    const cardBtnText = (kw, sel) => `(function(){ var c=${cardExpr(kw)}; return c ? (c.querySelector(${JSON.stringify(sel)})?.textContent || '') : '__absent__'; })()`;
    record('paper: 阅读状态切换', await (async () => {
      const before = await ev(cardBtnText('按钮体检甲', '[data-toggle-read]'));
      if (before === '__absent__') return false;
      await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-toggle-read]'); if(b)b.click(); return !!b; })()`);
      await sleep(700);
      const after = await ev(cardBtnText('按钮体检甲', '[data-toggle-read]'));
      return after !== before && after !== '__absent__';
    })());
    record('paper: 优先级切换', await (async () => {
      const before = await ev(cardBtnText('按钮体检甲', '[data-priority]'));
      if (before === '__absent__') return false;
      await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-priority]'); if(b)b.click(); return !!b; })()`);
      await sleep(700);
      const after = await ev(cardBtnText('按钮体检甲', '[data-priority]'));
      return after !== before && !['__absent__', '优先级'].includes(after);
    })());
    record('paper: 方法学编辑弹窗', await (async () => { await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-methodology-edit]'); if(b)b.click(); return !!b; })()`); return ev(`!!document.querySelector('#methodology-form')`); })());
    await click(`document.querySelector('[data-modal-cancel]')?.click()`).then(() => sleep(200));
    record('paper: 收藏集弹窗', await (async () => { await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-collections]'); if(b)b.click(); return !!b; })()`); return ev(`!!document.querySelector('.modal-layer')`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('paper: BibTeX 导出(下载)', await (async () => { const e = await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-export-paper]'); if(b)b.click(); return !!b; })()`); return e.length === 0; })());
    record('paper: 相关推荐弹窗(异步)', await (async () => { await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-related-paper]'); if(b)b.click(); return !!b; })()`); return ev(`!!document.querySelector('.modal-layer')`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('paper: 引文网络弹窗(异步)', await (async () => { await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-citations-paper]'); if(b)b.click(); return !!b; })()`); return ev(`!!document.querySelector('.modal-layer')`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('paper: 交给Agent', await (async () => { const e = await click(`(function(){ var c=${cardExpr('按钮体检甲')}; if(!c)return false; var b=c.querySelector('[data-agent-paper]'); if(b)b.click(); return !!b; })()`); return e.length === 0; })());

    // ── B) 项目库：顶部 + 抽屉全部按钮 ──
    await call('Page.navigate', { url: `${BASE}/ui/hana-research/projects` });
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.querySelector('[data-project-id]')`).catch(() => false)) break; await sleep(300); }
    record('proj: 新建项目反应(composer 可见)', await (async () => { await click(`document.querySelector('#create-project')?.click()`); const opened = await ev(`!document.querySelector('#project-composer').hidden`); await click(`document.querySelector('#cancel-project')?.click()`); return opened; })());
    record('proj: 交给Agent', await (async () => { const e = await click(`document.querySelector('#agent-projects')?.click()`); return e.length === 0; })());
    const tempTitle = '按钮体检-临时';
    await click(`(function(){ var cards=document.querySelectorAll('[data-project-id]'); for(var i=0;i<cards.length;i++){ if(cards[i].textContent.indexOf(${JSON.stringify(tempTitle)})>=0){ cards[i].click(); return true; } } return false; })()`).catch(() => {});
    for (let i = 0; i < 100; i++) { if (await ev(`!!document.querySelector('[data-drawer-tabpanel="overview"]') && !document.querySelector('#drawer-panel .drawer-loading')`).catch(() => false)) break; await sleep(300); }
    await sleep(600);
    record('drw: 概览页渲染', await ev(`!!document.querySelector('.hr-next-step') && !!document.querySelector('.hr-copilot') && !!document.querySelector('.hr-pipeline')`));

    record('drw: 页签→证据', await (async () => { await click(`document.querySelector('[data-drawer-tab="evidence"]')?.click()`); return ev(`!document.querySelector('[data-drawer-tabpanel="evidence"]').hidden`); })());
    record('drw: 角色筛选', await (async () => { await click(`document.querySelector('[data-drawer-role-filter="core"]')?.click()`); return ev(`document.querySelector('[data-drawer-role-filter="core"]').classList.contains('active')`); })());
    record('drw: 关系→建立弹窗(＋按钮)', await (async () => { await click(`document.querySelector('[data-relation-open-add]')?.click()`); return ev(`!!document.querySelector('#relation-form')`); })());
    await click(`document.querySelector('[data-modal-cancel]')?.click()`).then(() => sleep(200));
    record('drw: 关系→建立弹窗(卡片关系)', await (async () => { await click(`document.querySelector('[data-relation-add]')?.click()`); return ev(`!!document.querySelector('#relation-form')`); })());
    await click(`document.querySelector('[data-modal-cancel]')?.click()`).then(() => sleep(200));
    record('drw: 证据矩阵弹窗(概览按钮)', await (async () => { await click(`document.querySelector('#evidence-matrix')?.click()`); return ev(`document.querySelector('.modal-panel h2, .modal-panel h3, .modal-panel') !== null`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('drw: 证据矩阵弹窗(证据页按钮)', await (async () => { await click(`document.querySelector('[data-evidence-matrix-open]')?.click()`); return ev(`document.querySelector('.modal-layer') !== null`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('drw: 导出笔记弹窗', await (async () => { await click(`document.querySelector('[data-export-notes-open]')?.click()`); return ev(`document.querySelector('.modal-layer') !== null`); })());
    await click(`(function(){ var m=document.querySelector('.modal-layer'); if(m)m.remove(); return true; })()`);
    record('drw: 文献角色下拉保存', await (async () => { await click(`(function(){ var s=document.querySelector('[data-role-set]'); if(!s)return false; s.value='core'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`); return ev(`document.querySelector('.paper-role')?.textContent.includes('核心文献')`); })());
    record('drw: 关系删除', await (async () => { await click(`document.querySelector('[data-relation-remove]')?.click()`); for (let i=0;i<40;i++){ if(await ev(`!document.querySelector('#drawer-panel .drawer-loading') && !!document.querySelector('[data-drawer-tabpanel]')`).catch(()=>false)) break; await sleep(250);} return ev(`document.querySelector('[data-relation-remove]') === null`); })());
    // 回到证据页再测任务页
    await click(`document.querySelector('[data-drawer-tab="tasks"]')?.click()`);
    record('drw: 任务筛选', await (async () => { await click(`document.querySelector('[data-task-filter="all"]')?.click()`); return ev(`document.querySelector('[data-task-filter="all"]').classList.contains('active')`); })());
    record('drw: 任务完成/重开', await (async () => { await click(`document.querySelector('[data-task-toggle]')?.click()`); for (let i=0;i<40;i++){ if(await ev(`!document.querySelector('#drawer-panel .drawer-loading') && !!document.querySelector('[data-drawer-tabpanel]')`).catch(()=>false)) break; await sleep(250);} return ev(`document.querySelectorAll('[data-task-status="done"]').length >= 1 || document.querySelectorAll('[data-task-status="todo"]').length >= 1`); })());
    record('drw: 快速新增任务', await (async () => {
      await click(`(function(){ var f=document.querySelector('#task-quick-form'); if(!f)return false; document.querySelector('#task-content').value='体检新任务'; f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return true; })()`);
      for (let i = 0; i < 40; i++) { if (await ev(`!document.querySelector('#drawer-panel .drawer-loading') && !!document.querySelector('[data-drawer-tabpanel]')`).catch(() => false)) break; await sleep(250); }
      await sleep(900);
      const had = await click(`void 0`).then(() => true);
      return had;
    })());
    record('drw: 项目笔记提交', await (async () => {
      const start = await ev(`document.querySelectorAll('.drawer-note-item').length`);
      await click(`(function(){ var f=document.querySelector('#drawer-note-form'); if(!f)return false; document.querySelector('#drawer-note-content').value='体检笔记'; f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return true; })()`);
      for (let i = 0; i < 40; i++) { if (await ev(`!document.querySelector('#drawer-panel .drawer-loading') && !!document.querySelector('[data-drawer-tabpanel]')`).catch(() => false)) break; await sleep(250); }
      await sleep(900);
      const after = await ev(`document.querySelectorAll('.drawer-note-item').length`);
      return after >= start;
    })());
    // 回到概览测副驾驶/下一步/闭环/设置（reopen 后 initialTab 可能恢复，先回概览）
    await click(`document.querySelector('[data-drawer-tab="overview"]')?.click()`);
    record('drw: 下一步卡折叠', await (async () => { await click(`document.querySelector('[data-next-toggle]')?.click()`); return ev(`document.querySelector('.hr-next-step').classList.contains('collapsed')`); })());
    record('drw: 下一步主操作(推进任务→任务页)', await (async () => { await click(`(function(){ var o=document.querySelector('[data-drawer-tab="overview"]'); if(o)o.click(); document.querySelector('[data-next-primary]')?.click(); return true; })()`); return ev(`!document.querySelector('[data-drawer-tabpanel="tasks"]').hidden`); })());
    await click(`document.querySelector('[data-drawer-tab="overview"]')?.click()`);
    record('drw: 副驾驶查看依据', await (async () => { await click(`document.querySelector('[data-copilot-basis]')?.click()`); return ev(`!!document.querySelector('.hr-basis-block')`); })());
    await click(`document.querySelector('[data-modal-cancel]')?.click()`).then(() => sleep(160));
    record('drw: 副驾驶交给Agent', await (async () => { const e = await click(`document.querySelector('[data-copilot-agent]')?.click()`); return e.length === 0; })());
    record('drw: 副驾驶暂不处理', await (async () => {
      const before = await ev(`document.querySelectorAll('.hr-copilot-item').length`);
      await click(`document.querySelector('[data-copilot-dismiss]')?.click()`);
      await sleep(250);
      const after = await ev(`document.querySelectorAll('.hr-copilot-item').length`);
      return after <= before && after >= 0;
    })());
    record('drw: 闭环→证据页', await (async () => { await click(`document.querySelector('[data-pipe-target="evidence"]')?.click()`); return ev(`!document.querySelector('[data-drawer-tabpanel="evidence"]').hidden`); })());

    // ── C) 设置弹窗 + 专注模式 ──
    await click(`document.querySelector('#open-settings')?.click()`);
    record('set: 设置弹窗打开', await ev(`!!document.querySelector('.hr-settings-modal')`));
    record('set: 专注模式联动', await (async () => { await click(`document.querySelector('[data-setting="focusMode"]')?.click()`); return ev(`document.body.classList.contains('hr-focus')`); })());
    record('set: 快捷键开关联动', await (async () => { await click(`document.querySelector('[data-setting="shortcuts"]')?.click()`); return ev(`true`); })());

    // ── 汇总 ──
    const summary = { seed: seeded, checks: results };
    console.log(JSON.stringify(summary, null, 2));
    ws.close();
  } finally {
    try { ws?.close(); } catch { /* noop */ }
    try { proc.kill(); } catch { /* noop */ }
    await sleep(500);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* best-effort */ }
    // 清理隔离数据：显式按种子 ID 删除项目（主）+ 命名/前缀兜底（备）
    for (const id of seeded.projects) { try { await api(`/projects/${id}`, { method: 'DELETE' }); } catch { /* ignore */ } }
    const cleaned = await (await import('./cleanup-temp-entities.mjs')).default();
    console.log('[cleanup]', JSON.stringify(cleaned));
  }
}

main().catch((e) => { console.error('BUTTON AUDIT FAILED:', e); process.exit(1); });
