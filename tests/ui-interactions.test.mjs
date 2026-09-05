import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from '../web/node_modules/happy-dom/lib/index.js';

function installWindow(workspace, responder) {
  const window = new Window({ url: `http://localhost/ui/hana-research/${workspace}` });
  window.document.body.dataset.workspace = workspace;
  window.document.body.innerHTML = '<main id="research-root"></main>';
  window.fetch = responder;
  window.scrollTo = () => {};
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    HTMLElement: window.HTMLElement,
    MutationObserver: window.MutationObserver,
    FormData: window.FormData,
    Blob: window.Blob,
    File: window.File,
    CSS: window.CSS,
    BroadcastChannel: class { addEventListener() {} postMessage() {} close() {} },
    fetch: responder,
  });
  return window;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function wait(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('literature controls disclose progressively and high-frequency actions update in place', async () => {
  const paper = { id: 'w1', title: '核心文献', topic: '情绪', venue: '心理学报', authors: [], importedProjectIds: [], readStatus: 'unread', priority: '', favorite: false, methodology: [], collectionIds: [] };
  const library = [paper, ...Array.from({ length: 74 }, (_, index) => ({
    ...paper,
    id: `bulk-${index + 1}`,
    title: `批量文献 ${index + 1}`,
  }))];
  let failNextStatus = false;
  let importCalls = 0;
  const responder = async (input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname;
    if (path.endsWith('/projects')) return json({ projects: [{ id: 'p1', title: '情绪调节' }] });
    if (path.endsWith('/papers/w1/status')) {
      if (failNextStatus) { failNextStatus = false; return json({ message: '模拟失败' }, 500); }
      Object.assign(paper, JSON.parse(init.body));
      return json({ paper: { ...paper } });
    }
    if (path.endsWith('/papers/w1/favorite')) {
      Object.assign(paper, JSON.parse(init.body));
      return json({ paper: { ...paper } });
    }
    if (path.endsWith('/search/web')) return json({ total: 1, results: [{ title: '新检索文献', authors: ['A'], venue: 'Journal', sourceName: 'OpenAlex', year: 2026, topic: '情绪', doi: '10.1/demo', pdfUrl: 'https://example.com/demo.pdf', canDownload: true }], failed: [] });
    if (path.endsWith('/search/save')) {
      const saved = { id: 'w2', title: '新检索文献', authors: ['A'], venue: 'Journal', year: 2026, topic: '情绪', doi: '10.1/demo', canDownload: true, importedProjectIds: [], readStatus: 'unread', priority: '', favorite: false, methodology: [], collectionIds: [] };
      if (!library.some(item => item.id === saved.id)) library.push(saved);
      return json({ paper: saved });
    }
    if (path.endsWith('/projects/p1/import-pdf')) {
      importCalls += 1;
      library.find(item => item.id === 'w2').importedProjectIds = ['p1'];
      return json({ reused: false });
    }
    if (path.endsWith('/papers')) {
      if (url.searchParams.get('paged') === '1') {
        const page = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 60);
        const q = String(url.searchParams.get('q') || '').toLowerCase();
        const filtered = q ? library.filter(item => `${item.title} ${item.venue} ${item.topic}`.toLowerCase().includes(q)) : library;
        const venueCounts = Object.fromEntries([...new Set(library.map(item => item.venue))].map(venue => [venue, library.filter(item => item.venue === venue).length]));
        return json({
          papers: filtered.slice((page - 1) * pageSize, page * pageSize).map(item => ({ ...item })),
          pagination: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)), hasMore: page * pageSize < filtered.length },
          facets: { topics: [...new Set(library.map(item => item.topic))], venueCounts, favoriteCount: library.filter(item => item.favorite).length, libraryTotal: library.length },
        });
      }
      return json({ papers: library.map(item => ({ ...item })) });
    }
    if (path.endsWith('/collections')) return json({ collections: [] });
    if (path.endsWith('/searches')) return json({ searches: [] });
    if (path.endsWith('/journals')) return json({ sources: [], logs: [], newCounts: {}, running: false });
    return json({});
  };
  const window = installWindow('literature', responder);
  await import(`../assets/research.js?literature-${Date.now()}`);
  await wait(40);

  assert.ok(window.document.querySelector('.native-literature-view'));
  assert.equal(window.document.querySelectorAll('[data-paper-card]').length, 60, 'large libraries render in bounded batches');
  assert.match(window.document.querySelector('#paper-count').textContent, /75 篇.*已显示 60/);
  window.document.querySelector('#paper-load-more button').click();
  await wait(30);
  assert.equal(window.document.querySelectorAll('[data-paper-card]').length, 75, 'load more reveals the next batch');
  const librarySearch = window.document.querySelector('#paper-search');
  librarySearch.value = '批量文献 74';
  librarySearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(240);
  assert.equal(window.document.querySelectorAll('[data-paper-card]').length, 1, 'server-side search returns only the matching page');
  assert.match(window.document.querySelector('#paper-count').textContent, /1 篇/);
  librarySearch.value = '';
  librarySearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(240);
  assert.equal(window.document.querySelectorAll('.native-page-actions > *').length, 1, '页眉动作区仅业务按钮，工具组已上移常驻顶栏');
  assert.equal(window.document.querySelectorAll('.app-bar .hr-head-tool').length, 2, '顶栏常驻命令面板/设置入口');
  assert.ok(window.document.querySelector('.workspace-switcher [data-route="literature"]'), 'v38 常驻工作区切换器已激活');
  assert.ok(window.document.querySelector('#manage-menu-pop #agent-literature'));
  const toggle = window.document.querySelector('#toggle-filters');
  const panel = window.document.querySelector('#filter-panel');
  assert.ok(toggle);
  assert.equal(panel.hidden, true);
  toggle.click();
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  window.document.querySelector('#agent-literature').click();
  const agentToastText = window.document.querySelector('.hana-toast .hana-toast-text');
  assert.ok(agentToastText, '通知已迁移到统一 toast 中心');
  assert.match(agentToastText.textContent, /Agent/);
  assert.equal(window.document.querySelector('#hana-toast-root').getAttribute('aria-live'), 'polite');
  assert.ok(window.document.querySelector('.journal-disclosure'));
  const more = window.document.querySelector('.paper-more');
  assert.ok(more);
  assert.ok(more.querySelector('[data-related-paper="w1"]'));

  const shellBefore = window.document.querySelector('.research-shell');
  const readButton = window.document.querySelector('[data-toggle-read="w1"]');
  readButton.click();
  assert.equal(readButton.textContent, '在读');
  await wait(20);
  assert.equal(window.document.querySelector('.research-shell'), shellBefore);
  assert.equal(readButton.getAttribute('aria-busy'), null);
  assert.equal(window.document.querySelector('[data-paper-status-badge]').textContent, '在读');

  const priorityButton = window.document.querySelector('[data-priority="w1"]');
  priorityButton.click();
  await wait(20);
  assert.equal(window.document.querySelector('[data-paper-priority-badge]').textContent, 'P0');
  assert.equal(window.document.querySelector('.research-shell'), shellBefore);

  const favoriteButton = window.document.querySelector('[data-favorite="w1"]');
  favoriteButton.click();
  await wait(20);
  assert.equal(favoriteButton.classList.contains('saved'), true);
  assert.equal(favoriteButton.getAttribute('aria-label'), '取消收藏');

  failNextStatus = true;
  readButton.click();
  assert.equal(readButton.textContent, '已读');
  await wait(20);
  assert.equal(readButton.textContent, '在读');
  assert.match(window.document.querySelector('.hana-toast.error .hana-toast-text').textContent, /模拟失败/);

  const liveSearch = window.document.querySelector('#live-search');
  liveSearch.value = '新文献';
  window.document.querySelector('#run-search').click();
  await wait(40);
  const searchImport = window.document.querySelector('[data-search-action="import"]');
  assert.ok(searchImport);
  searchImport.click();
  await wait(80);
  assert.equal(importCalls, 1);
  assert.equal(searchImport.disabled, true);
  assert.match(searchImport.textContent, /已导入/);
});

test('journal manager resolves before subscribe and keeps source actions responsive', async () => {
  const sources = [{ id: 'custom-demo', venue: 'Demo Psychology', issn: '1234-5679', topic: '测试', enabled: true, isCustom: true, lastSyncedAt: null, lastError: null }];
  let syncCalls = 0;
  const responder = async (input, init = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/projects')) return json({ projects: [] });
    if (path.endsWith('/papers')) return json({ papers: [] });
    if (path.endsWith('/collections')) return json({ collections: [] });
    if (path.endsWith('/searches')) return json({ searches: [] });
    if (path.endsWith('/journals/resolve')) return json({ journal: { venue: 'Journal of Happiness Studies', issn: '1389-4978', issns: ['1389-4978', '1573-7780'], worksCount: 3210, isOpenAccess: false, homepageUrl: 'https://example.com/journal', preview: [{ title: 'Recent article', publicationDate: '2026-08-01' }] }, existing: null });
    if (path.endsWith('/journals/custom')) {
      const body = JSON.parse(init.body);
      const source = { id: 'custom-happiness', ...body, enabled: true, isCustom: true, lastSyncedAt: null, lastError: null };
      sources.push(source);
      return json({ source }, 201);
    }
    if (path.endsWith('/journals/custom-happiness/sync')) { syncCalls += 1; return json({ started: true, result: { fetched: 3, inserted: 2, pruned: 0 } }); }
    if (path.endsWith('/journals/custom-demo') && init.method === 'PATCH') {
      Object.assign(sources[0], JSON.parse(init.body));
      return json({ source: sources[0] });
    }
    if (path.endsWith('/journals')) return json({ sources: sources.map(source => ({ ...source })), logs: [], newCounts: {}, running: false });
    return json({});
  };
  const window = installWindow('literature', responder);
  await import(`../assets/research.js?journal-manager-${Date.now()}`);
  await wait(40);

  window.document.querySelector('#add-journal-source').click();
  await wait(30);
  assert.ok(window.document.querySelector('.journal-manager-panel'));
  assert.match(window.document.querySelector('#journal-source-summary').textContent, /1 个启用/);

  const resolveInput = window.document.querySelector('#journal-resolve-form input[name="issn"]');
  resolveInput.value = '1389-4978';
  window.document.querySelector('#journal-resolve-form button[type="submit"]').click();
  await wait(30);
  assert.match(window.document.querySelector('.journal-verified-copy h4').textContent, /Happiness Studies/);
  assert.equal(window.document.querySelectorAll('.journal-preview li').length, 1);

  window.document.querySelector('#journal-subscribe-form button[type="submit"]').click();
  await wait(60);
  assert.equal(syncCalls, 1);
  assert.match(window.document.querySelector('#journal-source-summary').textContent, /2 个启用/);
  assert.equal(window.document.querySelector('#journal-subscribe-form button').disabled, true);

  window.document.querySelector('[data-toggle-source="custom-demo"]').click();
  await wait(30);
  assert.equal(sources[0].enabled, false);
  assert.equal(window.document.querySelector('[data-toggle-source="custom-demo"]').textContent, '启用');
});

test('project detail replaces the list at the same Harness content level and returns cleanly', async () => {
  const project = { id: 'p1', title: '情绪调节', status: 'active', projectType: '', updatedAt: '2026-08-21' };
  const responder = async input => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/projects')) return json({ projects: [{ ...project, paperCount: 0, noteCount: 0 }] });
    if (path.endsWith('/projects/p1/papers')) return json({ project, papers: [] });
    if (path.endsWith('/projects/p1/translations')) return json({ docs: [] });
    if (path.endsWith('/projects/p1/relations')) return json({ relations: [] });
    if (path.endsWith('/projects/p1/notes')) return json({ notes: [] });
    if (path.endsWith('/projects/p1/cockpit-stats')) return json({
      papers: { total: 0, read: 0, reading: 0, withPdf: 0 },
      evidence: { notes: 0 }, tasks: { total: 0, todo: 0 }, relations: { total: 0 },
    });
    return json({});
  };
  const window = installWindow('projects', responder);
  await import(`../assets/research.js?projects-${Date.now()}`);
  await wait(40);

  const card = window.document.querySelector('[data-project-id="p1"]');
  card.click();
  await wait(40);
  const drawer = window.document.querySelector('#project-drawer');
  assert.equal(drawer.hidden, false);
  assert.equal(window.document.querySelector('#project-list-view').hidden, true);
  assert.equal(window.document.querySelector('.native-page-head').hidden, true);
  assert.equal(window.document.querySelector('.project-context'), null, 'repeated project context rail is removed');
  assert.ok(window.document.querySelector('.evidence-method-hub'), 'optional research methods are explained in one hub');
  assert.equal(window.document.querySelectorAll('[data-evidence-method][open]').length, 0, 'complex research workbenches start collapsed');
  window.document.querySelector('.drawer-close').click();
  assert.equal(drawer.hidden, true);
  assert.equal(window.document.querySelector('#project-list-view').hidden, false);
  card.click();
  await wait(50);
  assert.equal(drawer.hidden, false);
  assert.ok(window.document.querySelector('.cockpit-disclosure'));
});

test('project navigation stays focused and task/note writes update the drawer in place', async () => {
  const project = { id: 'p1', title: '情绪调节', status: 'active', projectType: '综述', updatedAt: '2026-08-21' };
  const paper = { id: 'w1', title: '需要补证据的文献', venue: '心理学报', attachmentId: 'a1', readStatus: 'reading' };
  const notes = [
    { id: 't1', content: '核对样本量', tags: ['研究任务', '状态:待办', '优先级:高'], paperId: 'w1', paperTitle: paper.title },
    { id: 'n1', content: '初步研究判断', tags: [], paperId: null },
  ];
  let sequence = 2;
  const responder = async (input, init = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = String(init.method || 'GET').toUpperCase();
    if (path.endsWith('/projects') && method === 'GET') return json({ projects: [{ ...project, paperCount: 1, pdfCount: 1, noteCount: notes.length }] });
    if (path.endsWith('/projects/p1/papers')) return json({ project, papers: [paper] });
    if (path.endsWith('/projects/p1/translations')) return json({ docs: [] });
    if (path.endsWith('/projects/p1/relations')) return json({ relations: [] });
    if (path.endsWith('/projects/p1/notes') && method === 'GET') return json({ notes: notes.map(note => ({ ...note })) });
    if (path.endsWith('/projects/p1/notes') && method === 'POST') {
      const body = JSON.parse(init.body);
      const note = { id: `n${++sequence}`, content: body.content, tags: body.tags || [], paperId: body.paperId || null, linkedPaperId: body.linkedPaperId || null };
      notes.unshift(note);
      return json({ note }, 201);
    }
    if (/\/projects\/p1\/notes\/[^/]+$/.test(path) && method === 'PATCH') {
      const id = path.split('/').pop();
      const body = JSON.parse(init.body);
      const note = notes.find(item => item.id === id);
      Object.assign(note, body);
      return json({ note: { ...note } });
    }
    if (/\/projects\/p1\/notes\/[^/]+$/.test(path) && method === 'DELETE') {
      const id = path.split('/').pop();
      const index = notes.findIndex(item => item.id === id);
      if (index >= 0) notes.splice(index, 1);
      return json({ deleted: true });
    }
    if (path.endsWith('/projects/p1/cockpit-stats')) return json({
      papers: { total: 1, read: 0, reading: 1, withPdf: 1 }, evidence: { notes: 1 },
      tasks: { total: 1, todo: 1, done: 0, open: [{ id: 't1', content: '核对样本量', priority: '高' }] },
      relations: { total: 0 }, reading: [{ paperId: 'w1', title: paper.title, page: 4, attachmentId: 'a1' }],
      candidates: [{ id: 'w1', title: paper.title, attachmentId: 'a1' }],
    });
    return json({});
  };
  const window = installWindow('projects', responder);
  await import(`../assets/research.js?project-local-${Date.now()}`);
  await wait(40);

  assert.ok(window.document.querySelector('.workspace-switcher [data-route="projects"]'), 'v38 常驻切换器已激活');
  assert.equal(window.document.querySelector('.workspace-switcher [data-route="projects"]')?.getAttribute('aria-current'), 'page', '当前工作区在切换器中标亮');
  assert.ok(window.document.querySelector('.native-page-head'));
  window.document.querySelector('[data-project-id="p1"]').click();
  await wait(50);
  const panel = window.document.querySelector('#drawer-panel');
  assert.equal(panel.querySelectorAll('.project-snapshot .snapshot-card').length, 2);
  assert.ok(panel.querySelector('.project-more'));
  assert.equal(panel.querySelector('.project-context'), null, 'detail view uses the full content width');
  assert.ok(panel.querySelector('[data-project-agent]'), 'agent handoff remains available from the project menu');
  assert.equal(panel.querySelector('.drawer-paper-workflow')?.open, false, 'per-paper screening and coding stay collapsed until requested');
  const taskNoteBadge = panel.querySelector('[data-drawer-tab="tasks"] .tab-count');
  assert.equal(taskNoteBadge.textContent, '2', 'combined tab counts both tasks and project notes');
  assert.match(taskNoteBadge.title, /1 个待办任务，1 条项目笔记/);

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  await wait(20);
  assert.equal(window.document.querySelector('.command-palette'), null, 'plugin must not take over the Harness command shortcut');
  panel.querySelector('[data-drawer-tab="tasks"]').click();
  await wait(20);
  assert.equal(panel.querySelector('[data-drawer-tab="tasks"]').classList.contains('active'), true);
  assert.equal(panel.querySelectorAll('.drawer-note-item').length, 1, 'task notes should not be duplicated in regular notes');
  assert.equal(panel.querySelectorAll('.note-file').length, 1, 'unlinked legacy notes are collected into one general note file');
  assert.match(panel.querySelector('.note-library-head [data-note-count]').textContent, /1 份 · 1 条/);
  panel.querySelector('#task-content').value = '补充理论框架';
  panel.querySelector('#task-quick-form [type="submit"]').click();
  await wait(30);
  assert.equal(window.document.querySelector('#drawer-panel'), panel);
  const newTask = panel.querySelector('[data-task-id="n3"]');
  assert.ok(newTask);
  newTask.querySelector('[data-task-toggle]').click();
  await wait(30);
  assert.equal(newTask.dataset.taskStatus, 'done');
  assert.equal(window.document.querySelector('#drawer-panel'), panel);

  panel.querySelector('#drawer-note-content').value = '新的跨文献判断';
  panel.querySelector('#drawer-note-paper').value = 'w1';
  panel.querySelector('#drawer-note-form [type="submit"]').click();
  await wait(30);
  const newNote = panel.querySelector('[data-note-id="n4"]');
  assert.ok(newNote);
  assert.equal(panel.querySelectorAll('.note-file').length, 2, 'notes are grouped into one file per source paper');
  assert.match(newNote.closest('.note-file').querySelector('.note-file-title b').textContent, /需要补证据的文献/);
  assert.equal(window.document.querySelector('#drawer-panel'), panel);
  newNote.querySelector('[data-note-edit]').click();
  assert.equal(newNote.querySelector('[data-note-editor]').hidden, false, 'each note exposes an inline edit/annotation form');
  newNote.querySelector('[name="content"]').value = '新的跨文献判断（已批注）';
  newNote.querySelector('[name="tags"]').value = '关键发现，待核对';
  newNote.querySelector('[data-note-editor] [type="submit"]').click();
  await wait(30);
  const editedNote = panel.querySelector('[data-note-id="n4"]');
  assert.match(editedNote.querySelector('.note-entry-content').textContent, /已批注/);
  assert.match(editedNote.querySelector('.note-tags').textContent, /关键发现/);
  editedNote.querySelector('[data-note-remove]').click();
  await wait(30);
  assert.equal(panel.querySelector('[data-note-id="n4"]'), null);
  assert.equal(window.document.querySelector('#drawer-panel'), panel);
  const undoToast = window.document.querySelector('.hana-toast.action');
  assert.ok(undoToast, '撤销提示已迁移到统一通知中心');
  undoToast.querySelector('button').click();
  await wait(40);
  assert.ok(panel.querySelector('[data-note-id="n5"]'));
  assert.equal(window.document.querySelector('#drawer-panel'), panel);
});

test('systematic review screening keeps two-stage decisions and criteria in the evidence workspace', async () => {
  const project = { id: 'p-screen', title: '青少年情绪综述', status: 'active', projectType: '综述', updatedAt: '2026-08-25' };
  const paper = { id: 'w-screen', title: 'Emotion regulation in adolescence', venue: 'Journal', year: 2025, attachmentId: 'a-screen', role: '', titleAbstractDecision: 'pending', titleAbstractReason: '', fullTextDecision: 'pending', fullTextReason: '' };
  let criteria = [];
  const overview = () => ({
    criteria: criteria.map(item => ({ ...item })), total: 1, finalIncluded: paper.fullTextDecision === 'include' ? 1 : 0,
    titleAbstract: Object.fromEntries(['pending', 'include', 'maybe', 'exclude'].map(value => [value, paper.titleAbstractDecision === value ? 1 : 0])),
    fullText: Object.fromEntries(['pending', 'include', 'maybe', 'exclude'].map(value => [value, paper.fullTextDecision === value ? 1 : 0])),
    prisma: { batches: [], warnings: ['尚未登记检索批次；识别与去重数字无法从项目文献反推。'], identification: {}, screening: { screened: 0, awaiting: 1, excluded: 0 }, retrieval: {}, eligibility: { exclusionReasons: [] }, included: {} },
  });
  const responder = async (input, init = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = String(init.method || 'GET').toUpperCase();
    if (path.endsWith('/projects') && method === 'GET') return json({ projects: [{ ...project, paperCount: 1, pdfCount: 1, noteCount: 0 }] });
    if (path.endsWith('/projects/p-screen/papers') && method === 'GET') return json({ project, papers: [{ ...paper }] });
    if (path.endsWith('/projects/p-screen/translations')) return json({ docs: [] });
    if (path.endsWith('/projects/p-screen/relations')) return json({ relations: [] });
    if (path.endsWith('/projects/p-screen/notes')) return json({ notes: [] });
    if (path.endsWith('/projects/p-screen/screening') && method === 'GET') return json(overview());
    if (path.endsWith('/projects/p-screen/screening/criteria') && method === 'PUT') {
      criteria = JSON.parse(init.body).criteria.map((item, index) => ({ id: `c${index}`, ...item }));
      return json({ criteria });
    }
    if (path.endsWith('/projects/p-screen/papers/w-screen/screening') && method === 'PATCH') {
      const body = JSON.parse(init.body);
      if (body.stage === 'title_abstract') { paper.titleAbstractDecision = body.decision; paper.titleAbstractReason = body.reason || ''; }
      else { paper.fullTextDecision = body.decision; paper.fullTextReason = body.reason || ''; }
      return json({ paper: { ...paper } });
    }
    if (path.endsWith('/projects/p-screen/cockpit-stats')) return json({ papers: { total: 1, read: 0, reading: 0, withPdf: 1 }, evidence: { notes: 0 }, tasks: { total: 0, todo: 0 }, relations: { total: 0 }, reading: [], candidates: [] });
    return json({});
  };
  const window = installWindow('projects', responder);
  await import(`../assets/research.js?screening-${Date.now()}`);
  await wait(40);
  window.document.querySelector('[data-project-id="p-screen"]').click();
  await wait(60);
  let panel = window.document.querySelector('#drawer-panel');
  panel.querySelector('[data-drawer-tab="evidence"]').click();
  assert.ok(panel.querySelector('.screening-workbench'));
  panel.querySelector('[data-prisma-open]').click();
  assert.ok(window.document.querySelector('.prisma-modal'));
  assert.match(window.document.querySelector('.prisma-warning').textContent, /尚未登记检索批次/);
  window.document.querySelector('.prisma-modal [data-modal-cancel]').click();
  const titleSelect = panel.querySelector('[data-screening-stage="title_abstract"]');
  titleSelect.value = 'include';
  titleSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(90);
  panel = window.document.querySelector('#drawer-panel');
  assert.equal(panel.querySelector('[data-screening-stage="title_abstract"]').value, 'include');
  assert.equal(panel.querySelector('[data-screening-stage="full_text"]').disabled, false);
  assert.ok(panel.querySelector('[data-retrieval-set]'));

  panel.querySelector('[data-screening-criteria]').click();
  const modal = window.document.querySelector('.screening-criteria-modal');
  modal.querySelector('#screening-include').value = '目标人群｜12–18 岁';
  modal.querySelector('#screening-exclude').value = '非实证研究｜评论或社论';
  modal.querySelector('[type="submit"]').click();
  await wait(90);
  panel = window.document.querySelector('#drawer-panel');
  assert.match(panel.querySelector('[data-screening-criteria]').textContent, /2/);

  const fullTextSelect = panel.querySelector('[data-screening-stage="full_text"]');
  fullTextSelect.value = 'exclude';
  fullTextSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const decisionModal = window.document.querySelector('.screening-decision-modal');
  assert.ok(decisionModal);
  decisionModal.querySelector('[data-criterion-reason]').click();
  decisionModal.querySelector('[type="submit"]').click();
  await wait(90);
  assert.equal(paper.fullTextDecision, 'exclude', `backend fixture stage=${paper.titleAbstractDecision}/${paper.fullTextDecision}`);
  panel = window.document.querySelector('#drawer-panel');
  const renderedFullText = panel.querySelector('[data-screening-stage="full_text"]');
  assert.equal(renderedFullText.querySelector('option[value="exclude"]').hasAttribute('selected'), true, renderedFullText.outerHTML);
  assert.match(panel.querySelector('[data-screening-reason]').textContent, /非实证研究/);
});

test('project evidence coding applies templates as drafts and saves typed paper values', async () => {
  const project = { id: 'p-code', title: '结构化研究编码', status: 'active', projectType: '元分析', updatedAt: '2026-08-25' };
  const paper = { id: 'w-code', title: 'Adolescent coping study', venue: 'Journal', year: 2024, attachmentId: null, role: '', titleAbstractDecision: 'include', titleAbstractReason: '', fullTextDecision: 'pending', fullTextReason: '' };
  let fields = [
    { id: 'f-size', label: '样本量', type: 'number', options: [], description: '最终分析样本', required: true, position: 0 },
    { id: 'f-design', label: '研究设计', type: 'select', options: ['横断研究', '实验研究'], description: '', required: true, position: 1 },
  ];
  const values = { 'w-code': {} };
  const templates = [{ id: 'review', label: '系统综述 / 元分析', fields: [{ label: '偏倚风险', type: 'select', options: ['低风险', '高风险'], description: '', required: true }] }];
  const coding = () => {
    const paperValues = values['w-code'];
    const coded = fields.filter(field => paperValues[field.id] !== undefined && paperValues[field.id] !== null && paperValues[field.id] !== '').length;
    const complete = fields.length > 0 && fields.filter(field => field.required).every(field => paperValues[field.id] !== undefined && paperValues[field.id] !== null && paperValues[field.id] !== '');
    return { fields, templates, values, paperStats: { 'w-code': { coded, total: fields.length, complete } }, totalPapers: 1, papersCoded: coded ? 1 : 0, papersComplete: complete ? 1 : 0 };
  };
  const responder = async (input, init = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = String(init.method || 'GET').toUpperCase();
    if (path.endsWith('/projects') && method === 'GET') return json({ projects: [{ ...project, paperCount: 1, pdfCount: 0, noteCount: 0 }] });
    if (path.endsWith('/projects/p-code/papers')) return json({ project, papers: [{ ...paper }] });
    if (path.endsWith('/projects/p-code/translations')) return json({ docs: [] });
    if (path.endsWith('/projects/p-code/relations')) return json({ relations: [] });
    if (path.endsWith('/projects/p-code/notes')) return json({ notes: [] });
    if (path.endsWith('/projects/p-code/screening')) return json({ criteria: [], titleAbstract: { pending: 0, include: 1, maybe: 0, exclude: 0 }, fullText: { pending: 1, include: 0, maybe: 0, exclude: 0 }, total: 1, finalIncluded: 0 });
    if (path.endsWith('/projects/p-code/evidence-coding') && method === 'GET') return json(coding());
    if (path.endsWith('/projects/p-code/papers/w-code/evidence-coding') && method === 'PATCH') {
      Object.assign(values['w-code'], JSON.parse(init.body).values);
      return json({ paperId: 'w-code', values: values['w-code'], stats: coding().paperStats['w-code'] });
    }
    if (path.endsWith('/projects/p-code/evidence-fields') && method === 'PUT') {
      fields = JSON.parse(init.body).fields.map((field, index) => ({ id: field.id || `new-${index}`, ...field, position: index }));
      return json({ fields, coding: coding() });
    }
    if (path.endsWith('/projects/p-code/cockpit-stats')) return json({ papers: { total: 1, read: 0, reading: 0, withPdf: 0 }, evidence: { notes: 0 }, tasks: { total: 0, todo: 0 }, relations: { total: 0 }, reading: [], candidates: [] });
    return json({});
  };
  const window = installWindow('projects', responder);
  await import(`../assets/research.js?coding-${Date.now()}`);
  await wait(40);
  window.document.querySelector('[data-project-id="p-code"]').click();
  await wait(70);
  let panel = window.document.querySelector('#drawer-panel');
  panel.querySelector('[data-drawer-tab="evidence"]').click();
  assert.match(panel.querySelector('.coding-workbench').textContent, /2个字段/);
  const details = panel.querySelector('[data-paper-coding="w-code"]');
  details.open = true;
  details.querySelector('[data-evidence-field="f-size"]').value = '96';
  details.querySelector('[data-evidence-field="f-design"]').value = '横断研究';
  details.querySelector('[data-evidence-save]').click();
  await wait(100);
  assert.equal(values['w-code']['f-size'], '96');
  assert.equal(values['w-code']['f-design'], '横断研究');
  panel = window.document.querySelector('#drawer-panel');
  assert.match(panel.querySelector('.coding-workbench').textContent, /1 篇完成必填字段/);

  panel.querySelector('[data-evidence-fields]').click();
  const modal = window.document.querySelector('.coding-fields-modal');
  modal.querySelector('[data-coding-template]').value = 'review';
  modal.querySelector('[data-template-apply]').click();
  assert.equal(modal.querySelectorAll('[data-coding-field-id]').length, 1);
  assert.equal(modal.querySelector('[data-field-label]').value, '偏倚风险');
  assert.equal(fields.length, 2, 'template stays a draft until save');
  modal.querySelector('[data-modal-cancel]').click();
});

test('AI pre-screen panel runs, renders tiered suggestions, and adopts into manual screening', async () => {
  const project = { id: 'p1', title: '情绪调节', status: 'active', projectType: '', updatedAt: '2026-08-21' };
  const papers = [
    { id: 'w1', title: '正念干预对焦虑的效果', venue: '心理学报', year: '2023', attachmentId: null, readStatus: 'unread' },
    { id: 'w2', title: '一篇社论', venue: '评论', year: '2022', attachmentId: null, readStatus: 'unread' },
  ];
  const screeningOverview = {
    projectId: 'p1',
    criteria: [{ id: 'c1', kind: 'include', label: '实证研究', description: '', position: 0, enabled: true }],
    titleAbstract: { pending: 2, include: 0, maybe: 0, exclude: 0 },
    fullText: { pending: 2, include: 0, maybe: 0, exclude: 0 },
    total: 2,
    finalIncluded: 0,
    papers: [],
    dualScreening: { config: { enabled: false, reviewerAName: '审查者 A', reviewerBName: '审查者 B' }, byPaper: {}, conflicts: [], conflictCount: 0, stages: { titleAbstract: { total: 2, paired: 0, agreementCount: 0, agreementRate: null, kappa: null, counts: { unreviewed: 2, in_progress: 0, agreement: 0, conflict: 0, resolved: 0 } }, fullText: { total: 2, paired: 0, agreementCount: 0, agreementRate: null, kappa: null, counts: { unreviewed: 2, in_progress: 0, agreement: 0, conflict: 0, resolved: 0 } } } },
    prisma: { batches: [], warnings: [] },
  };
  const aiRun = { id: 'r1', projectId: 'p1', stage: 'title_abstract', criteriaHash: 'abcdef0123456789', criteriaSnapshot: [], targetPaperIds: [], model: 'deepseek-chat', promptVersion: 'ais-v1', status: 'running', total: 2, processed: 2, included: 1, excluded: 0, uncertain: 1, lastPaperId: 'w2', error: '', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z' };
  const aiResults = [
    { id: 'ar1', runId: 'r1', projectId: 'p1', paperId: 'w1', title: papers[0].title, stage: 'title_abstract', decision: 'include', confidence: 0.9, rationale: '两项纳入标准均满足', perCriteria: [], tier: 1, sentScope: 'metadata', createdAt: '2026-09-05T00:00:01Z' },
    { id: 'ar2', runId: 'r1', projectId: 'p1', paperId: 'w2', title: papers[1].title, stage: 'title_abstract', decision: 'uncertain', confidence: 0.4, rationale: '摘要信息不足', perCriteria: [], tier: 3, sentScope: 'metadata', createdAt: '2026-09-05T00:00:02Z' },
  ];
  let runs = [];
  let adopted = null;
  const agreement = { available: true, stage: 'title_abstract', runId: 'r1', runStatus: 'done', criteriaHash: 'abcdef0123456789', criteriaChanged: false, sampleSize: 2, aiDecisions: { include: 1, exclude: 0, uncertain: 1 }, counts: { tp: 1, fp: 0, tn: 1, fn: 0 }, sensitivity: 100, specificity: 100, agreementRate: 100, overrides: 0 };
  const responder = async (input, init = {}) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const method = String(init.method || 'GET').toUpperCase();
    if (path.endsWith('/projects')) return json({ projects: [{ ...project, paperCount: 2, noteCount: 0 }] });
    if (path.endsWith('/projects/p1/papers')) return json({ project, papers });
    if (path.endsWith('/projects/p1/translations')) return json({ docs: [] });
    if (path.endsWith('/projects/p1/relations')) return json({ relations: [] });
    if (path.endsWith('/projects/p1/notes')) return json({ notes: [] });
    if (path.endsWith('/projects/p1/cockpit-stats')) return json({ papers: { total: 2, read: 0, reading: 0, withPdf: 0 }, evidence: { notes: 0 }, tasks: { total: 0, todo: 0 }, relations: { total: 0 } });
    if (path.endsWith('/projects/p1/screening/ai-runs') && method === 'POST') {
      runs = [{ ...aiRun, status: 'done' }];
      return json({ run: { ...aiRun, status: 'queued' } }, 201);
    }
    if (path.endsWith('/projects/p1/screening/ai-runs')) return json({ runs: runs.map(run => ({ ...run })) });
    if (path.endsWith('/projects/p1/screening/ai')) return json({ results: aiResults.map(item => ({ ...item })) });
    if (path.endsWith('/projects/p1/screening/ai-agreement')) return json(agreement);
    if (/\/projects\/p1\/papers\/w1\/screening$/.test(path) && method === 'PATCH') {
      adopted = JSON.parse(init.body);
      return json({ paper: { id: 'w1', titleAbstractDecision: adopted.decision } });
    }
    if (path.endsWith('/projects/p1/screening')) return json(screeningOverview);
    return json({});
  };
  const window = installWindow('projects', responder);
  await import(`../assets/research.js?ai-screening-${Date.now()}`);
  await wait(40);
  window.document.querySelector('[data-project-id="p1"]').click();
  await wait(60);
  const panel = window.document.querySelector('#drawer-panel');
  const methodDetails = panel.querySelector('[data-evidence-method="screening"]');
  methodDetails.open = true;
  const aiPanel = panel.querySelector('[data-ai-panel]');
  assert.ok(aiPanel, 'AI pre-screen disclosure exists inside the screening workbench');
  assert.equal(aiPanel.open, false, 'AI panel starts collapsed');
  aiPanel.open = true;
  aiPanel.dispatchEvent(new window.Event('toggle'));
  await wait(60);
  const runButton = aiPanel.querySelector('[data-ai-run]');
  assert.ok(runButton, 'run button renders when idle');
  assert.match(aiPanel.querySelector('[data-ai-panel-badge]').textContent, /未运行/);
  runButton.click();
  await wait(40);
  const confirmButton = window.document.querySelector('[data-dialog-confirm]');
  assert.ok(confirmButton, 'run requires a quota confirmation dialog');
  confirmButton.click();
  await wait(120);
  assert.equal(runs.length, 1, 'POST ai-runs happened after confirmation');
  assert.match(aiPanel.querySelector('[data-ai-runs]').textContent, /已完成 2\/2/);
  const groups = aiPanel.querySelectorAll('.ai-tier-group');
  assert.equal(groups.length, 2, 'tier 1 and tier 3 groups render');
  assert.match(aiPanel.querySelector('[data-ai-results]').textContent, /高置信建议 · 1/);
  assert.match(aiPanel.querySelector('[data-ai-results]').textContent, /建议转人工 · 1/);
  assert.match(aiPanel.querySelector('[data-ai-agreement]').textContent, /一致率/);
  const adoptButton = aiPanel.querySelector('[data-ai-adopt="w1"]');
  assert.ok(adoptButton, 'include suggestion offers adopt action');
  assert.equal(aiPanel.querySelector('[data-ai-adopt="w2"]'), null, 'uncertain suggestions never offer adopt');
  adoptButton.click();
  await wait(80);
  assert.ok(adopted, 'adopt PATCHed the manual screening field');
  assert.equal(adopted.decision, 'include');
  assert.equal(adopted.stage, 'title_abstract');
  assert.match(adopted.reason, /AI 建议/);

  panel.querySelector('[data-prisma-open]').click();
  await wait(120);
  const prismaAi = window.document.querySelector('[data-prisma-ai]');
  assert.ok(prismaAi, 'PRISMA modal carries an independent AI statistics block');
  assert.match(prismaAi.textContent, /一致率/);
  assert.match(prismaAi.textContent, /不计入上方流程数字/);
});
