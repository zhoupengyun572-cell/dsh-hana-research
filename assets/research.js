const root = document.querySelector('#research-root');
let workspace = document.body.dataset.workspace === 'projects' ? 'projects' : 'literature';
const researchChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hana-research-reader-v1') : null;
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';
const sparkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>';
const researchMarkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>';
const bookmarkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>';
const pdfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg>';
const uploadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/></svg>';
const settingsIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>';
const translateIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5h9M8.5 3v2M12 5c-1 4-3.5 7-7.5 8.5M5.5 10c1.8 1.2 3.5 2.8 4.8 5"/><path d="M14 18l3-8 3 8M15 16h4"/></svg>';
const exportIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>';
const syncIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v6h-6"/></svg>';
const gripIcon = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2" r="1.3"/><circle cx="7.5" cy="2" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="12" r="1.3"/><circle cx="7.5" cy="12" r="1.3"/></svg>';
const thumbnailsIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>';

const state = {
  projects: [],
  papers: [],
  selectedProjectId: localStorage.getItem('hana-research-target-project') || '',
  activeTopic: '全部',
  activeVenue: '全部',
  activeReadStatus: '全部',
  activeCollection: '全部',
  collections: [],
  activeCustomTag: null,
  customTags: loadCustomTags(),
  // P2 增强：方法学标注筛选
  activeMethodology: '全部',
  // P2 增强：保存的检索
  savedSearches: [],
  searchNewIds: [],
  query: '',
  busyPaperId: null,
  reader: null,
  searchQuery: '',
  searchResults: [],
  searchFailed: [],
  searchAI: null,
  searchAIError: null,
  searchBusy: false,
  filtersOpen: localStorage.getItem('hana-research-filters-open') === '1',
  paperRenderLimit: 60,
  paperServerPaged: false,
  paperPagination: { page: 1, pageSize: 60, total: 0, totalPages: 1, hasMore: false },
  paperFacets: { topics: [], venueCounts: {}, favoriteCount: 0, libraryTotal: 0 },
  paperLoading: false,
};

const PAPER_RENDER_BATCH = 60;

let loadingSlowTimer = null;
let drawerCloseTimer = null;
let drawerRequestToken = 0;
let drawerOpenedAt = 0;
let paperRequestToken = 0;
let paperFilterTimer = null;

function handoffToAgent(prompt, label = '研究上下文已加入输入框') {
  const message = { type: 'hana-research.agent-handoff', prompt: String(prompt || '').trim(), label };
  if (!message.prompt) return;
  try {
    window.top.postMessage(message, window.location.origin);
  } catch {
    window.parent.postMessage(message, window.location.origin);
  }
  showNotice(label);
}

function loadCustomTags() {
  try {
    const parsed = JSON.parse(localStorage.getItem('hana-research-custom-tags') || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
}

// ── P6 设置与个性化（本地优先：全部存 localStorage，跟随主题/动效偏好） ──

const HANA_SETTINGS_KEY = 'hana-research-settings';

function defaultHanaSettings() {
  return {
    focusMode: false,       // 专注模式：隐藏次要按钮
    infoDensity: 'comfortable', // comfortable | compact | spacious
    motion: 'auto',         // auto | reduced | standard
    shortcuts: true,        // 全局快捷键
    defaultProjectId: '',   // 默认项目（与文献中心目标项目联动）
    openDefaultProject: true, // 打开项目库时自动展开默认项目
    agentWritePolicy: 'confirm', // Agent 写操作策略（描述性 + 写入接力指令）
  };
}

function loadHanaSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(HANA_SETTINGS_KEY) || '{}');
    return { ...defaultHanaSettings(), ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch {
    return defaultHanaSettings();
  }
}

let hanaSettings = loadHanaSettings();

function persistHanaSettings(patch) {
  hanaSettings = { ...hanaSettings, ...(patch || {}) };
  try { localStorage.setItem(HANA_SETTINGS_KEY, JSON.stringify(hanaSettings)); } catch { /* 忽略存储失败 */ }
  applyHanaSettings();
}

/** 应用设置到页面（body class 驱动 CSS；快捷键一次性注册）。 */
function applyHanaSettings() {
  const s = hanaSettings;
  document.body.classList.toggle('hr-focus', Boolean(s.focusMode));
  document.body.classList.remove('hr-density-comfortable', 'hr-density-compact', 'hr-density-spacious');
  document.body.classList.add('hr-density-' + (s.infoDensity || 'comfortable'));
  document.body.classList.toggle('hr-motion-reduced', s.motion === 'reduced');
  document.body.classList.toggle('hr-motion-standard', s.motion === 'standard');
  if (s.defaultProjectId) {
    try { localStorage.setItem('hana-research-target-project', s.defaultProjectId); } catch { /* ignore */ }
  }
  installHanaShortcuts(Boolean(s.shortcuts));
}

let hanaShortcutsInstalled = false;
let hanaShortcutsEnabled = true;

/** 插件内快捷键：不接管 Harness 的 Ctrl/⌘K；Alt 1/2/3 切换项目页签；N 新建项目。 */
// ── v38：客户端工作区路由（SPA）─────────────────────────────────────
// 文献中心 / 项目库在同一文档内切换：pushState + View Transitions。
// 深链接由服务端渲染的 data-workspace 初始化（旧书签完全兼容）；
// 阅读器保持整页跳转（编辑器窗口隐喻），不经此路由。

const HANA_ROUTE_PATHS = {
  literature: '/ui/hana-research/literature',
  projects: '/ui/hana-research/projects',
};
const routeScrollMemory = { literature: 0, projects: 0 };

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function routeFromLocation() {
  return /\/projects\/?$/.test(location.pathname) ? 'projects' : 'literature';
}

/** 等待视图真实内容出现后恢复滚动位置（骨架屏期间高度不足）。 */
function restoreRouteScroll(route, top) {
  if (!top) return;
  const marker = route === 'literature' ? '#paper-search' : '#project-list-view';
  const startedAt = Date.now();
  const tick = () => {
    if (workspace === route && document.querySelector(marker)) { window.scrollTo(0, top); return; }
    if (Date.now() - startedAt < 2500) window.setTimeout(tick, 120);
  };
  window.setTimeout(tick, 60);
}

function updateAppBarRoute() {
  document.querySelectorAll('.workspace-switcher [data-route]').forEach(link => {
    if (link.dataset.route === workspace) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

async function navigateWorkspace(route, { push = true } = {}) {
  if (!HANA_ROUTE_PATHS[route] || route === workspace) return;
  // 离开当前视图：收起项目抽屉、记忆滚动、保存文献筛选现场（复用 pagehide 保存器）。
  if (document.querySelector('#project-drawer:not([hidden])')) closeProjectDrawer();
  routeScrollMemory[workspace] = window.scrollY || 0;
  if (workspace === 'literature') persistLiteratureState();
  workspace = route;
  document.body.dataset.workspace = route;
  const savedScroll = routeScrollMemory[route] || 0;
  routeScrollMemory[route] = 0;
  const runSwap = () => {
    window.scrollTo(0, 0);
    (route === 'projects' ? loadProjects : loadLiterature)();
    updateAppBarRoute();
    restoreRouteScroll(route, savedScroll);
  };
  try {
    if (document.startViewTransition && !prefersReducedMotion()) document.startViewTransition(runSwap);
    else runSwap();
  } catch { runSwap(); }
  if (push) history.pushState({ hanaWorkspace: route }, '', HANA_ROUTE_PATHS[route]);
}

window.addEventListener('popstate', event => {
  navigateWorkspace(event.state?.hanaWorkspace || routeFromLocation(), { push: false });
});

// ── v38：右键上下文菜单（复用 .menu-pop 视觉语言；pointer 定位 + 视口钳制）──

let contextMenuEl = null;
let contextMenuDismiss = null;

function closeContextMenu() {
  if (contextMenuDismiss) { contextMenuDismiss(); return; }
}

function buildContextMenuDismiss(menu) {
  const onOutside = event => { if (!menu.contains(event.target)) closeContextMenu(); };
  const onEscape = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeContextMenu(); }
  };
  const onScrollKey = () => closeContextMenu();
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onEscape, true);
  window.addEventListener('resize', onScrollKey);
  contextMenuDismiss = () => {
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onEscape, true);
    window.removeEventListener('resize', onScrollKey);
    contextMenuDismiss = null;
    if (contextMenuEl === menu) contextMenuEl = null;
    menu.classList.add('closing');
    window.setTimeout(() => menu.remove(), 120);
  };
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotice('已复制到剪贴板。');
  } catch {
    showNotice('复制失败：浏览器未授权剪贴板访问。', true);
  }
}

function openContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'menu-pop context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((item, index) =>
    `<button type="button" role="menuitem" class="context-menu-item${item.danger ? ' danger' : ''}" data-ctx-index="${index}"><span>${escapeHtml(item.label)}</span>${item.hint ? `<small>${escapeHtml(item.hint)}</small>` : ''}</button>`).join('');
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 10));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 10));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  contextMenuEl = menu;
  menu.querySelectorAll('[data-ctx-index]').forEach(button => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.ctxIndex)];
      closeContextMenu();
      item?.onSelect?.();
    });
  });
  buildContextMenuDismiss(menu);
  // 首项聚焦，支持方向键/Enter 操作（客户端惯例）。
  menu.querySelector('.context-menu-item')?.focus({ preventScroll: true });
}

function bindContextMenus() {
  root.addEventListener('contextmenu', event => {
    if (event.target.closest('.modal-layer, .command-layer, input, textarea, select')) return;
    const paperCard = event.target.closest('[data-paper-id]');
    if (paperCard?.dataset.paperId) {
      event.preventDefault();
      const paper = state.papers.find(item => item.id === paperCard.dataset.paperId)
        || state.projectPapers?.find(item => item.id === paperCard.dataset.paperId);
      if (!paper) return;
      const items = [];
      const projectIdForReader = state.selectedProjectId || (state.drawerProjectId ?? '');
      if (paper.attachmentId && projectIdForReader) {
        items.push({ label: '在阅读器打开', hint: 'PDF 精读', onSelect: () => openPdfReader(projectIdForReader, paper.attachmentId) });
      }
      items.push({ label: '复制标题', onSelect: () => copyTextToClipboard(paper.title || '') });
      if (paper.doi) items.push({ label: '复制 DOI', hint: String(paper.doi), onSelect: () => copyTextToClipboard(String(paper.doi)) });
      if (!items.length) return;
      openContextMenu(event.clientX, event.clientY, items);
      return;
    }
    const projectCard = event.target.closest('[data-project-id]');
    if (projectCard?.dataset.projectId) {
      event.preventDefault();
      const project = state.projects.find(item => item.id === projectCard.dataset.projectId);
      if (!project) return;
      openContextMenu(event.clientX, event.clientY, [
        { label: '打开项目详情', hint: '概览 · 证据 · 任务', onSelect: () => openProjectDrawer(project.id) },
        { label: '复制项目名称', onSelect: () => copyTextToClipboard(project.title || '') },
      ]);
    }
  });
}
if (typeof root !== 'undefined') bindContextMenus();

// v38：视图每次重渲染都会重建顶栏，用轻量观察器保持切换器选中态。
const appBarSyncObserver = new MutationObserver(() => updateAppBarRoute());
if (typeof root !== 'undefined' && typeof appBarSyncObserver !== 'undefined') appBarSyncObserver.observe(root, { childList: true });


function installHanaShortcuts(enabled) {
  hanaShortcutsEnabled = Boolean(enabled);
  if (hanaShortcutsInstalled) return;
  hanaShortcutsInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (!hanaShortcutsEnabled) return;
    const active = document.activeElement;
    const tag = (active?.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(active?.isContentEditable);
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'k') {
        // Ctrl/⌘K 属于 Harness；插件不阻止宿主快捷键。
        return;
      }
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const tab = { '1': 'overview', '2': 'evidence', '3': 'tasks' }[event.key];
      if (tab) {
        const btn = document.querySelector(`[data-drawer-tab="${tab}"]`);
        if (btn) { event.preventDefault(); btn.click(); }
      }
      // v36：命令面板快捷键（Ctrl/⌘K 属于宿主 Harness，插件让位，故用 Alt P）。
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); renderCommandPalette(); return; }
      return;
    }
    // v36：Esc 必须先于「输入中」判断——弹层内自动聚焦输入框后，Esc 仍要能关层。
    if (event.key === 'Escape') { closeModalLayer(); closeProjectDrawer(); return; }
    if (typing) return;
    if (event.key.toLowerCase() === 'n' && workspace === 'projects') {
      const composer = document.querySelector('#project-composer');
      if (composer && composer.hidden) {
        composer.hidden = false;
        window.requestAnimationFrame(() => document.querySelector('#project-title')?.focus());
      }
    }
  });
}

/** 顶栏与页面动作入口（shell 渲染后由事件委托绑定）。 */
function ensureSettingsButtonBinding() {
  root.addEventListener('click', (event) => {
    if (event.target.closest('#open-settings, [data-open-settings]')) renderSettingsModal();
    if (event.target.closest('#open-command-palette, [data-open-command-palette]')) renderCommandPalette();
    const routeLink = event.target.closest('.workspace-switcher [data-route]');
    // 普通左键拦截为客户端路由；Ctrl/Cmd/Shift/中键交给浏览器原行为（新开标签等）。
    if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigateWorkspace(routeLink.dataset.route);
    }
  }, { signal: undefined });
}
if (typeof root !== 'undefined') ensureSettingsButtonBinding();
// 启动即应用已保存的偏好与快捷键（否则首次访问时快捷键不生效，专注/密度/动效不落地）
applyHanaSettings();

/** 「交给 Agent」写操作策略文案（Agent 只能拟计划，写入必须用户确认）。 */
function agentWritePolicyInstruction() {
  const policy = hanaSettings.agentWritePolicy === 'confirm-single'
    ? '任何创建、修改、完成任务或修改项目的写入，都必须在我明确确认之后逐条执行；未经确认一律只生成计划。'
    : '除非我明确确认，否则不要创建、完成任务或修改项目——Agent 只能生成拟执行计划，写入必须由我确认并经宿主审计。';
  return policy;
}

function renderSettingsModal() {
  closeModalLayer();
  const s = loadHanaSettings();
  const layer = openModalLayer();
  const projectOptions = state.projects.length
    ? state.projects.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === s.defaultProjectId ? 'selected' : ''}>${escapeHtml(p.title)}</option>`).join('')
    : '<option value="">（暂无项目）</option>';
  const selected = s.defaultProjectId ? '' : 'selected';
  layer.innerHTML = `<div class="modal-panel hr-settings-modal" role="dialog" aria-modal="true" aria-label="设置与个性化">
    <span class="composer-kicker">Research preferences</span>
    <h2>设置与个性化</h2>
    <p class="modal-copy">偏好保存在本浏览器（本地优先），不会改动研究数据库；可随时在顶栏齿轮重新调整。</p>
    <p class="hr-settings-note">当前运行版本：${escapeHtml(document.body.dataset.releaseVersion || '开发环境')}</p>
    <div class="hr-settings-section">
      <h3>界面</h3>
      <label class="hr-setting-row"><span><b>专注模式</b><small>隐藏次要按钮，只保留当前最重要的阅读与任务动作</small></span><input type="checkbox" data-setting="focusMode" ${s.focusMode ? 'checked' : ''}></label>
      <label class="hr-setting-row"><span><b>信息密度</b><small>列表与证据卡的字号与间距</small></span><select data-setting="infoDensity"><option value="compact" ${s.infoDensity === 'compact' ? 'selected' : ''}>紧凑</option><option value="comfortable" ${s.infoDensity === 'comfortable' ? 'selected' : ''}>舒适（默认）</option><option value="spacious" ${s.infoDensity === 'spacious' ? 'selected' : ''}>宽松</option></select></label>
      <label class="hr-setting-row"><span><b>动效强度</b><small>默认跟随系统 prefers-reduced-motion；可在此覆盖</small></span><select data-setting="motion"><option value="auto" ${s.motion === 'auto' ? 'selected' : ''}>跟随系统</option><option value="reduced" ${s.motion === 'reduced' ? 'selected' : ''}>减弱</option><option value="standard" ${s.motion === 'standard' ? 'selected' : ''}>标准</option></select></label>
    </div>
    <div class="hr-settings-section">
      <h3>研究偏好</h3>
      <label class="hr-setting-row"><span><b>默认项目</b><small>文献中心「一键导入目标」与项目库默认展开的项目</small></span><select data-setting="defaultProjectId"><option value="" ${selected}>未指定</option>${projectOptions}</select></label>
      <label class="hr-setting-row"><span><b>打开项目库时自动展开默认项目</b></span><input type="checkbox" data-setting="openDefaultProject" ${s.openDefaultProject ? 'checked' : ''}></label>
    </div>
    <div class="hr-settings-section">
      <h3>Agent 协作</h3>
      <label class="hr-setting-row"><span><b>写操作策略</b><small>Agent 创建 / 修改 / 完成任务均必须由你确认；该策略写入每次「交给 Agent」指令</small></span><select data-setting="agentWritePolicy"><option value="confirm" ${s.agentWritePolicy === 'confirm' ? 'selected' : ''}>确认后执行（推荐）</option><option value="confirm-single">每次逐条确认</option></select></label>
      <p class="hr-settings-note">DSH 的审批与审计机制不受此设置影响，始终生效；Agent 从不自动发送或自动修改数据。</p>
    </div>
    <div class="hr-settings-section">
      <h3>快捷键</h3>
      <label class="hr-setting-row"><span><b>启用快捷键</b></span><input type="checkbox" data-setting="shortcuts" ${s.shortcuts ? 'checked' : ''}></label>
      <ul class="hr-shortcut-list">
        <li><kbd>Ctrl / ⌘ K</kbd><span>Harness 快捷命令（由宿主处理）</span></li>
        <li><kbd>Alt P</kbd><span>打开命令面板</span></li>
        <li><kbd>Alt 1 · 2 · 3</kbd><span>项目内切换 概览 / 证据 / 任务与笔记</span></li>
        <li><kbd>N</kbd><span>新建项目（项目库页）</span></li>
        <li><kbd>Esc</kbd><span>关闭遮罩层</span></li>
      </ul>
    </div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelectorAll('[data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.dataset.setting;
      const patch = {};
      if (el.type === 'checkbox') patch[key] = el.checked;
      else patch[key] = el.value;
      persistHanaSettings(patch);
      if (key === 'defaultProjectId' && el.value) {
        try { localStorage.setItem('hana-research-target-project', el.value); } catch { /* ignore */ }
        state.selectedProjectId = el.value;
      }
    });
  });
  layer.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModalLayer);
}

function commandPaletteCommands() {
  const drawerOpen = Boolean(document.querySelector('#project-drawer:not([hidden])'));
  const commands = [
    { id: 'focus-search', label: '搜索当前工作区', hint: workspace === 'projects' ? '检索项目' : '检索文献库', keys: '搜索 查找 filter' },
    { id: 'goto-literature', label: '前往文献中心', hint: '找文献', keys: '文献 检索 literature' },
    { id: 'goto-projects', label: '前往项目库', hint: '做研究', keys: '项目 project' },
    { id: 'open-settings', label: '打开设置与个性化', hint: '界面与研究偏好', keys: '设置 偏好 settings' },
  ];
  if (workspace === 'projects') {
    commands.splice(1, 0,
      { id: 'new-project', label: '新建研究项目', hint: 'N', keys: '创建 项目 new' },
      { id: 'open-project', label: '打开默认项目', hint: state.projects.find(item => item.id === state.selectedProjectId)?.title || state.projects[0]?.title || '暂无项目', keys: '默认 最近 项目 open' },
    );
  }
  if (drawerOpen) commands.splice(1, 0,
    { id: 'project-evidence', label: '切换到项目证据', hint: 'Alt 2', keys: '证据 文献 evidence' },
    { id: 'project-tasks', label: '切换到任务与笔记', hint: 'Alt 3', keys: '任务 笔记 task note' },
  );
  return commands;
}

function executePaletteCommand(id) {
  const afterClose = action => { closeModalLayer(); window.setTimeout(action, 170); };
  if (id === 'goto-literature') { navigateWorkspace('literature'); return; }
  if (id === 'goto-projects') { navigateWorkspace('projects'); return; }
  if (id === 'open-settings') { afterClose(renderSettingsModal); return; }
  if (id === 'new-project') { afterClose(() => document.querySelector('#create-project')?.click()); return; }
  if (id === 'open-project') {
    const projectId = state.selectedProjectId || state.projects[0]?.id;
    if (projectId) afterClose(() => openProjectDrawer(projectId));
    return;
  }
  if (id === 'project-evidence' || id === 'project-tasks') {
    afterClose(() => {
      const panel = document.querySelector('#drawer-panel');
      if (!panel) return;
      switchDrawerTab(panel, id === 'project-evidence' ? 'evidence' : 'tasks');
      if (id === 'project-tasks') panel.querySelector('#task-content')?.focus();
    });
    return;
  }
  if (id === 'focus-search') {
    afterClose(() => {
      const input = document.querySelector('#project-search, #paper-search, #live-search, .search-field input');
      input?.focus();
      input?.select?.();
    });
  }
}

function renderCommandPalette() {
  closeModalLayer();
  const commands = commandPaletteCommands();
  const layer = document.createElement('div');
  layer.className = 'modal-layer command-layer';
  layer.innerHTML = `<div class="command-palette" role="dialog" aria-modal="true" aria-label="快捷命令">
    <label class="command-search">${searchIcon}<input id="command-search" autocomplete="off" placeholder="输入命令或功能名称…" aria-label="筛选快捷命令"><kbd>Esc</kbd></label>
    <div class="command-list" role="listbox">${commands.map((command, index) => `<button type="button" role="option" class="command-item ${index === 0 ? 'active' : ''}" data-command="${escapeAttr(command.id)}" data-command-search="${escapeAttr(`${command.label} ${command.hint} ${command.keys}`.toLowerCase())}"><span>${escapeHtml(command.label)}</span><small>${escapeHtml(command.hint)}</small></button>`).join('')}</div>
    <p class="command-foot">↑ ↓ 选择 · Enter 执行 · Esc 关闭</p>
  </div>`;
  document.body.append(layer);
  const input = layer.querySelector('#command-search');
  const visibleItems = () => [...layer.querySelectorAll('.command-item:not([hidden])')];
  const activate = item => {
    layer.querySelectorAll('.command-item').forEach(button => button.classList.toggle('active', button === item));
    item?.scrollIntoView?.({ block: 'nearest' });
  };
  layer.addEventListener('click', event => {
    if (event.target === layer) { closeModalLayer(); return; }
    const item = event.target.closest('[data-command]');
    if (item) executePaletteCommand(item.dataset.command);
  });
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    layer.querySelectorAll('[data-command]').forEach(item => { item.hidden = Boolean(query && !item.dataset.commandSearch.includes(query)); });
    activate(visibleItems()[0] || null);
  });
  input.addEventListener('keydown', event => {
    const items = visibleItems();
    const current = items.findIndex(item => item.classList.contains('active'));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      activate(items[(current + offset + items.length) % items.length]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[current >= 0 ? current : 0];
      if (item) executePaletteCommand(item.dataset.command);
    }
  });
  window.requestAnimationFrame(() => input.focus());
}

// P2 增强：方法学标注预设（研究设计维度，可自由补充测量工具/样本人群等）
const METHODOLOGY_PRESETS = ['实验', '相关', '纵向', '元分析', '质性', '量表开发', '干预研究'];
// P2 增强：项目内文献角色（P3）
const PAPER_ROLE_LABELS = { core: '核心文献', background: '背景', method: '方法参考', compare: '结果对比' };
const SCREENING_DECISION_LABELS = { pending: '待筛选', include: '纳入', maybe: '待定', exclude: '排除' };
const EVIDENCE_FIELD_TYPE_LABELS = { text: '文本', number: '数字', select: '单选', multi_select: '多选', boolean: '是 / 否' };
// P2 增强：文献关系（P5 论证链）
const RELATION_LABELS = { supports: '支持', refutes: '反驳', cites: '引用' };

researchChannel?.addEventListener('message', event => {
  if (event.data?.type === 'request-context' && state.reader) publishReaderContext();
  if (event.data?.type === 'go-page' && state.reader) setReaderPage(Number(event.data.pageNumber));
  if (event.data?.type === 'annotation-deleted' && state.reader) {
    state.reader.data.annotations = state.reader.data.annotations.filter(item => item.id !== event.data.annotationId);
    renderPageAnnotations();
  }
  if (event.data?.type === 'note-deleted' && state.reader && event.data.annotationId) {
    state.reader.data.annotations = state.reader.data.annotations.filter(item => item.id !== event.data.annotationId);
    renderPageAnnotations();
  }
});

function apiUrl(path) {
  // DSH 移植：插件业务 API 挂在宿主 webServer 的 /api/hana-research 前缀下。
  // OpenHanako 的 surface session 参数（pluginSurfaceSession/agentId）在 DSH
  // 中无对应语义，不再透传。
  return `/api/hana-research${path}`;
}

async function api(path, options = {}) {
  const hasFormBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body && !hasFormBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(body?.message || `请求失败（${response.status}）`);
    error.code = body?.error || 'REQUEST_FAILED';
    error.status = response.status;
    error.details = body?.details || null;
    throw error;
  }
  return body;
}

const activeActions = new Set();

/**
 * 统一异步按钮状态：防重复、即时 busy、3 秒慢操作提示、成功/失败收尾。
 * 返回 { ok, value?, error? }，业务函数可在失败时回滚乐观更新。
 */
async function runButtonAction(button, options, operation) {
  const config = options || {};
  const key = config.key || button?.dataset?.actionKey || operation;
  if (activeActions.has(key)) return { ok: false, duplicate: true };
  activeActions.add(key);
  const labelNode = button?.querySelector?.('[data-action-label]') || button?.querySelector?.('span') || null;
  const originalLabel = labelNode?.textContent;
  const originalTitle = button?.getAttribute?.('title');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.remove('action-success', 'action-error');
    button.classList.add('action-busy');
    if (config.pendingLabel && labelNode) labelNode.textContent = config.pendingLabel;
  }
  const slowTimer = window.setTimeout(() => {
    if (!button?.isConnected || !button.classList.contains('action-busy')) return;
    button.classList.add('action-slow');
    button.title = config.slowMessage || '仍在处理，请稍候…';
    if (config.slowMessage) showNotice(config.slowMessage);
  }, config.slowAfter ?? 3000);
  try {
    const value = await operation();
    window.clearTimeout(slowTimer);
    if (button?.isConnected) {
      button.classList.remove('action-busy', 'action-slow');
      button.classList.add('action-success');
      button.removeAttribute('aria-busy');
      button.disabled = Boolean(config.keepDisabled);
      if (labelNode && (config.successLabel || config.pendingLabel)) labelNode.textContent = config.successLabel || originalLabel;
      if (originalTitle == null) button.removeAttribute('title'); else button.title = originalTitle;
      window.setTimeout(() => button.isConnected && button.classList.remove('action-success'), 520);
    }
    if (config.successMessage) showNotice(config.successMessage);
    return { ok: true, value };
  } catch (error) {
    window.clearTimeout(slowTimer);
    if (button?.isConnected) {
      button.classList.remove('action-busy', 'action-slow');
      button.classList.add('action-error');
      button.removeAttribute('aria-busy');
      button.disabled = false;
      if (labelNode && originalLabel != null) labelNode.textContent = originalLabel;
      if (originalTitle == null) button.removeAttribute('title'); else button.title = originalTitle;
      window.setTimeout(() => button.isConnected && button.classList.remove('action-error'), 900);
    }
    showNotice(config.errorPrefix ? `${config.errorPrefix}：${error.message}` : error.message, true);
    return { ok: false, error };
  } finally {
    activeActions.delete(key);
  }
}

// v36：页眉常驻工具按钮（命令面板 + 设置）。此前两者是没有任何入口的孤儿功能。
const HR_ICON_PALETTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9V5a2 2 0 1 0-2 2h4Zm6 0V5a2 2 0 1 1 2 2h-4Zm-6 6v4a2 2 0 1 1-2-2h4Zm6 0v4a2 2 0 1 0 2-2h-4Z"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>';
const HR_ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';

const HR_ICON_BRAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

function shell(kicker, title, copy, body, topActions = '') {
  return `<div class="research-shell native-shell">
    <header class="app-bar">
      <div class="app-bar-brand"><span class="app-bar-mark" aria-hidden="true">${HR_ICON_BRAND}</span><span class="app-bar-title">文献研究台</span></div>
      <nav class="workspace-switcher" aria-label="工作区切换">
        <a href="/ui/hana-research/literature" data-route="literature">文献中心</a>
        <a href="/ui/hana-research/projects" data-route="projects">项目库</a>
      </nav>
      <span class="app-bar-spacer"></span>
      <span class="hr-head-utils app-bar-utils">
        <button type="button" class="hr-head-tool" data-open-command-palette title="命令面板（Alt P）" aria-label="打开命令面板">${HR_ICON_PALETTE}</button>
        <button type="button" class="hr-head-tool" data-open-settings title="设置与个性化" aria-label="打开设置与个性化">${HR_ICON_GEAR}</button>
      </span>
    </header>
    <main class="app-content">
      <header class="native-page-head">
        <div><span class="native-page-kicker">${kicker}</span><h1>${title}</h1><p class="workspace-copy">${copy}</p></div>
        ${topActions ? `<div class="native-page-actions">${topActions}</div>` : ''}
      </header>
      ${body}
    </main>
  </div>`;
}

function renderLoading(label) {
  root.innerHTML = `<div class="hr-skeleton" role="status" aria-label="${escapeAttr(label)}">
    <header class="hr-skel-bar"><span class="hr-skel-brand"></span><span class="hr-skel-pill"></span></header>
    <div class="hr-skel-content">
      <div class="hr-skel-title"></div>
      <div class="hr-skel-search"></div>
      <div class="hr-skel-cards"><span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span></div>
    </div>
    <p class="hr-skel-status">${escapeHtml(label)}</p>
  </div>`;
  // 超过 8 秒未完成：追加慢加载提示（不阻塞加载流程）
  loadingSlowTimer = window.setTimeout(() => {
    const status = document.querySelector('.hr-skel-status');
    if (status && document.body.contains(status)) {
      status.innerHTML = status.innerHTML + '<span class="loading-slow-hint">加载较慢，请稍候…（数据量大或磁盘较慢时属正常）</span>';
    }
  }, 8000);
}

function clearLoadingSlowTimer() {
  if (loadingSlowTimer) { window.clearTimeout(loadingSlowTimer); loadingSlowTimer = null; }
}

function paperPagePath(page = 1, extra = {}) {
  const params = new URLSearchParams({ paged: '1', page: String(page), pageSize: String(state.paperPagination.pageSize || PAPER_RENDER_BATCH) });
  if (state.query) params.set('q', state.query);
  if (state.activeTopic !== '全部') params.set('topic', state.activeTopic);
  if (state.activeVenue !== '全部') params.set('venue', state.activeVenue);
  if (state.activeReadStatus !== '全部') params.set('readStatus', state.activeReadStatus);
  if (state.activeCollection !== '全部') params.set('collection', state.activeCollection);
  if (state.activeMethodology !== '全部') params.set('methodology', state.activeMethodology);
  if (state.activeCustomTag) params.set('customTag', state.activeCustomTag);
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return `/papers?${params.toString()}`;
}

function applyPaperPageData(data, { append = false } = {}) {
  const incoming = Array.isArray(data?.papers) ? data.papers : [];
  state.paperServerPaged = Boolean(data?.pagination);
  state.papers = append ? state.papers.concat(incoming.filter(paper => !state.papers.some(existing => existing.id === paper.id))) : incoming;
  if (data?.pagination) state.paperPagination = { ...state.paperPagination, ...data.pagination };
  else state.paperPagination = { page: 1, pageSize: PAPER_RENDER_BATCH, total: incoming.length, totalPages: 1, hasMore: false };
  if (data?.facets) state.paperFacets = { ...state.paperFacets, ...data.facets };
  else state.paperFacets = {
    topics: [...new Set(incoming.map(paper => paper.topic).filter(Boolean))],
    venueCounts: incoming.reduce((counts, paper) => {
      if (paper.venue) counts[paper.venue] = Number(counts[paper.venue] || 0) + 1;
      return counts;
    }, {}),
    favoriteCount: incoming.filter(paper => paper.favorite).length,
    libraryTotal: incoming.length,
  };
}

async function reloadPaperPage({ render = true, message = '' } = {}) {
  const token = ++paperRequestToken;
  state.paperLoading = true;
  syncPaperCountAndPager();
  try {
    const data = await api(paperPagePath(1));
    if (token !== paperRequestToken) return false;
    applyPaperPageData(data);
    state.paperRenderLimit = PAPER_RENDER_BATCH;
    if (render) renderPaperGrid();
    if (message) showNotice(message);
    return true;
  } catch (error) {
    if (token === paperRequestToken) showNotice(`文献列表刷新失败：${error.message}`, true);
    return false;
  } finally {
    if (token === paperRequestToken) {
      state.paperLoading = false;
      syncPaperCountAndPager();
    }
  }
}

async function loadNextPaperPage() {
  if (state.paperLoading || !state.paperPagination.hasMore) return;
  const token = ++paperRequestToken;
  state.paperLoading = true;
  syncPaperCountAndPager();
  try {
    const data = await api(paperPagePath(state.paperPagination.page + 1));
    if (token !== paperRequestToken) return;
    applyPaperPageData(data, { append: true });
    renderPaperGrid();
  } catch (error) {
    if (token === paperRequestToken) showNotice(`加载下一页失败：${error.message}`, true);
  } finally {
    if (token === paperRequestToken) {
      state.paperLoading = false;
      syncPaperCountAndPager();
    }
  }
}

function schedulePaperPageReload(immediate = false) {
  if (paperFilterTimer) window.clearTimeout(paperFilterTimer);
  paperFilterTimer = window.setTimeout(() => {
    paperFilterTimer = null;
    reloadPaperPage();
  }, immediate ? 0 : 180);
}

function renderFailure(error, retry) {
  console.error('[hana-research] 页面加载失败：', error);
  root.innerHTML = `<div class="workspace-failure"><span>Research workspace</span><h1>暂时无法读取研究资料</h1><p>${escapeHtml(error?.message || '未知错误')}</p><p class="search-hint">请稍后重试；若持续失败，可重启 DeepSeek Harness 后再试。</p><button class="button primary" id="retry-workspace">重新加载</button></div>`;
  document.querySelector('#retry-workspace').addEventListener('click', retry);
}

async function loadLiterature() {
  renderLoading('正在整理文献与项目…');
  try {
    let restored = false;
    try {
      const raw = sessionStorage.getItem('hana-return-literature');
      if (raw) {
        sessionStorage.removeItem('hana-return-literature');
        const saved = JSON.parse(raw);
        if (saved.query !== undefined) state.query = String(saved.query);
        if (saved.activeTopic) state.activeTopic = String(saved.activeTopic);
        if (saved.activeVenue) state.activeVenue = String(saved.activeVenue);
        if (saved.activeReadStatus) state.activeReadStatus = String(saved.activeReadStatus);
        if (saved.activeMethodology) state.activeMethodology = String(saved.activeMethodology);
        restored = Boolean(saved.scrollY);
        window.__hanaReturnScrollY = saved.scrollY || 0;
      }
    } catch { /* 忽略恢复失败 */ }
    const [projectData, paperData, collectionData, searchData] = await Promise.all([
      api('/projects'),
      api(paperPagePath(1)),
      // 容错：宿主尚未提供 /collections 时降级为空集合（重启后自动启用）
      api('/collections').catch(() => ({ collections: [] })),
      // P2 增强：保存的检索（旧宿主 404 时降级为空列表）
      api('/searches').catch(() => ({ searches: [] })),
    ]);
    clearLoadingSlowTimer();
    state.projects = projectData.projects;
    applyPaperPageData(paperData);
    state.collections = collectionData.collections || [];
    state.savedSearches = searchData.searches || [];
    ensureSelectedProject();
    renderLiterature();
    if (restored && window.__hanaReturnScrollY) {
      window.setTimeout(() => {
        window.scrollTo(0, window.__hanaReturnScrollY);
        window.__hanaReturnScrollY = 0;
      }, 60);
    }
  } catch (error) {
    clearLoadingSlowTimer();
    renderFailure(error, loadLiterature);
  }
}

// 离开文献中心时保存筛选与滚动状态（供阅读器返回时恢复）
function persistLiteratureState() {
  try {
    sessionStorage.setItem('hana-literature-state', JSON.stringify({
      query: state.query || '',
      activeTopic: state.activeTopic || '',
      activeVenue: state.activeVenue || '',
      activeReadStatus: state.activeReadStatus || '',
      activeMethodology: state.activeMethodology || '',
      scrollY: window.scrollY || 0,
    }));
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistLiteratureState);
}

function ensureSelectedProject() {
  if (!state.projects.some(project => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || '';
  }
  if (state.selectedProjectId) localStorage.setItem('hana-research-target-project', state.selectedProjectId);
}

function renderLiterature(message = '') {
  const projectOptions = state.projects.map(project => `<option value="${escapeAttr(project.id)}" ${project.id === state.selectedProjectId ? 'selected' : ''}>${escapeHtml(project.title)}</option>`).join('');
  const topics = state.paperServerPaged ? (state.paperFacets.topics || []) : [...new Set(state.papers.map(paper => paper.topic).filter(Boolean))];
  const activeFilterCount = [
    state.activeTopic !== '全部', state.activeVenue !== '全部', state.activeReadStatus !== '全部',
    state.activeCollection !== '全部', state.activeMethodology !== '全部', Boolean(state.activeCustomTag),
  ].filter(Boolean).length;
  const customTagRow = state.customTags.length
    ? `<div class="topic-row custom-tag-row" id="custom-topics">${state.customTags.map(tag => `<button class="chip custom-chip ${state.activeCustomTag === tag ? 'active' : ''}" data-custom-tag="${escapeAttr(tag)}" title="按关键词筛选「${escapeAttr(tag)}」"># ${escapeHtml(tag)}<i class="chip-remove" data-remove-tag="${escapeAttr(tag)}" title="删除标签">×</i></button>`).join('')}</div>`
    : '';
  root.innerHTML = shell('文献中心', '聚焦发现，把文献变成证据。', '搜索、筛选并导入项目；其余工具按需展开。', `
    <section class="native-literature-view">
    <div class="search-desk research-command"><label class="search-field">${searchIcon}<input id="live-search" value="${escapeAttr(state.searchQuery)}" placeholder="检索 OpenAlex、Crossref、arXiv 与 PubMed"></label><button class="button primary" id="run-search" ${state.searchBusy ? 'disabled aria-busy="true"' : ''}>${state.searchBusy ? '检索中…' : '检索'}</button></div>
    <div class="literature-utility-row">
      <label class="search-field library-search">${searchIcon}<input id="paper-search" value="${escapeAttr(state.query)}" placeholder="筛选当前文献库"></label>
      <label class="compact-select" title="PDF 导入的目标项目"><span>导入到</span><select id="target-project" ${state.projects.length ? '' : 'disabled'}>${projectOptions || '<option>请先创建项目</option>'}</select></label>
      <button class="button filter-toggle ${state.filtersOpen ? 'active' : ''}" id="toggle-filters" aria-expanded="${state.filtersOpen}">筛选${activeFilterCount ? `<b>${activeFilterCount}</b>` : ''}</button>
      <button class="button quiet-button" id="save-search" title="保存当前全网检索">保存检索</button>
      <button class="button quiet-button" id="saved-searches">已保存${state.savedSearches.length ? ` <b>${state.savedSearches.length}</b>` : ''}</button>
    </div>
    <div id="search-results">${renderSearchResults()}</div>
    <div class="journal-bar" id="journal-bar"><span class="journal-bar-hint">期刊更新 · 正在读取期刊源状态…</span></div>
    <div class="notice ${message ? 'visible' : ''}" id="notice" role="status" aria-live="polite">${escapeHtml(message)}</div>
    <section class="filter-panel" id="filter-panel" ${state.filtersOpen ? '' : 'hidden'} aria-label="文献筛选">
      <div class="filter-panel-head"><strong>精细筛选</strong><label class="project-picker collection-picker"><select id="collection-filter"><option value="全部">全部收藏集</option>${state.collections.map(collection => `<option value="${escapeAttr(collection.id)}" ${state.activeCollection === collection.id ? 'selected' : ''}>${escapeHtml(collection.title)}（${collection.paperCount}）</option>`).join('')}</select></label><button class="button quiet-button" id="custom-topic">+自定义标签</button></div>
      <div class="topic-row" id="topics"><button class="chip ${state.activeTopic === '全部' ? 'active' : ''}" data-topic="全部">全部主题</button>${topics.map(topic => `<button class="chip ${state.activeTopic === topic ? 'active' : ''}" data-topic="${escapeAttr(topic)}">${escapeHtml(topic)}</button>`).join('')}</div>
      <div class="topic-row status-row" id="read-statuses"><button class="chip ${state.activeReadStatus === '全部' ? 'active' : ''}" data-read-status-filter="全部">全部状态</button>${[['unread', '未读'], ['reading', '在读'], ['read', '已读']].map(([value, label]) => `<button class="chip ${state.activeReadStatus === value ? 'active' : ''}" data-read-status-filter="${value}">${label}</button>`).join('')}</div>
      <div class="topic-row methodology-row" id="methodologies"><button class="chip ${state.activeMethodology === '全部' ? 'active' : ''}" data-methodology-filter="全部">全部方法</button>${METHODOLOGY_PRESETS.map(tag => `<button class="chip ${state.activeMethodology === tag ? 'active' : ''}" data-methodology-filter="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
      ${customTagRow}
    </section>
    <div class="section-heading"><h2>开放获取文献</h2><span id="paper-count"></span></div>
    <section class="paper-grid">${paperGridMarkup()}</section>
    <div class="paper-load-more" id="paper-load-more"></div>
    </section>
  `, `
    <span class="menu-anchor">
      <button class="button quiet-button" id="manage-menu" title="文献中心更多操作" aria-haspopup="menu" aria-expanded="false">更多 ···</button>
      <div class="menu-pop" id="manage-menu-pop" role="menu" hidden>
        <button type="button" id="agent-literature" role="menuitem" title="把当前文献库与筛选上下文加入 Agent 输入框">◆ 交给 Agent</button>
        <button type="button" id="duplicate-review" role="menuitem" title="检查 DOI 与题录信息相似的重复文献">◎ 重复文献检查</button>
        <button type="button" id="tag-manager" role="menuitem" title="管理笔记标签（改名/合并/删除/颜色）">${settingsIcon}标签管理</button>
        <button type="button" id="translate-settings" role="menuitem" title="配置 AI 翻译服务（全文翻译生成译文文档）">${translateIcon}翻译设置</button>
        <button type="button" id="export-favorites-2" role="menuitem" title="把全部收藏导出为 BibTeX / RIS 引用文件">${exportIcon}数据导出</button>
        <button type="button" id="sync-settings" role="menuitem" title="立即同步全部订阅期刊">${syncIcon}同步设置</button>
      </div>
    </span>
  `);

  document.querySelector('#paper-search').addEventListener('input', event => {
    state.query = event.target.value.trim().toLowerCase();
    applyPaperFilters();
  });
  document.querySelector('#agent-literature')?.addEventListener('click', () => {
    const target = state.projects.find(project => project.id === state.selectedProjectId);
    handoffToAgent(
      `请接手我当前的文献工作。先调用 hana_research_get_research_context 读取真实的本地研究库。当前目标项目：${target ? `「${target.title}」（projectId: ${target.id}）` : '未选择'}；库内搜索词：${state.query || '无'}；全网检索词：${state.searchQuery || '无'}；主题筛选：${state.activeTopic}；期刊筛选：${state.activeVenue}；阅读状态：${state.activeReadStatus}。请先概括当前上下文，再提出最值得执行的 2–3 个下一步；不要把只有元数据的文献说成已经阅读全文。`,
      '文献工作已交给 Agent'
    );
  });
  document.querySelector('#run-search')?.addEventListener('click', event => runSearch(event.currentTarget));
  document.querySelector('#live-search')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') runSearch(document.querySelector('#run-search'));
  });
  // P2 增强：保存的检索
  document.querySelector('#save-search')?.addEventListener('click', renderSaveSearchModal);
  document.querySelector('#saved-searches')?.addEventListener('click', renderSavedSearchesModal);
  document.querySelector('#duplicate-review')?.addEventListener('click', renderDuplicateReviewModal);
  document.querySelector('#toggle-filters')?.addEventListener('click', event => {
    state.filtersOpen = !state.filtersOpen;
    try { localStorage.setItem('hana-research-filters-open', state.filtersOpen ? '1' : '0'); } catch { /* ignore */ }
    const panel = document.querySelector('#filter-panel');
    if (panel) panel.hidden = !state.filtersOpen;
    event.currentTarget.classList.toggle('active', state.filtersOpen);
    event.currentTarget.setAttribute('aria-expanded', String(state.filtersOpen));
  });
  document.querySelectorAll('[data-search-save]').forEach(button => button.addEventListener('click', () => {
    saveSearchRecord(Number(button.dataset.searchSave), button.dataset.searchAction, button);
  }));
  document.querySelector('#topics')?.addEventListener('click', event => {
    const chip = event.target.closest('[data-topic]');
    if (!chip) return;
    state.activeTopic = chip.dataset.topic;
    document.querySelectorAll('[data-topic]').forEach(item => item.classList.toggle('active', item === chip));
    applyPaperFilters();
  });
  document.querySelector('#read-statuses')?.addEventListener('click', event => {
    const chip = event.target.closest('[data-read-status-filter]');
    if (!chip) return;
    state.activeReadStatus = chip.dataset.readStatusFilter;
    document.querySelectorAll('[data-read-status-filter]').forEach(item => item.classList.toggle('active', item === chip));
    applyPaperFilters();
  });
  // P2 增强：方法学标注筛选
  document.querySelector('#methodologies')?.addEventListener('click', event => {
    const chip = event.target.closest('[data-methodology-filter]');
    if (!chip) return;
    state.activeMethodology = chip.dataset.methodologyFilter;
    document.querySelectorAll('[data-methodology-filter]').forEach(item => item.classList.toggle('active', item === chip));
    applyPaperFilters();
  });
  document.querySelector('#custom-topics')?.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-tag]');
    if (remove) {
      const tag = remove.dataset.removeTag;
      state.customTags = state.customTags.filter(item => item !== tag);
      if (state.activeCustomTag === tag) state.activeCustomTag = null;
      localStorage.setItem('hana-research-custom-tags', JSON.stringify(state.customTags));
      renderLiterature(`已删除自定义主题「${tag}」。`);
      return;
    }
    const chip = event.target.closest('[data-custom-tag]');
    if (!chip) return;
    state.activeCustomTag = state.activeCustomTag === chip.dataset.customTag ? null : chip.dataset.customTag;
    document.querySelectorAll('[data-custom-tag]').forEach(item => item.classList.toggle('active', item === chip));
    applyPaperFilters();
  });
  document.querySelector('#target-project')?.addEventListener('change', event => {
    state.selectedProjectId = event.target.value;
    localStorage.setItem('hana-research-target-project', state.selectedProjectId);
    renderLiterature();
  });
  bindPaperCardActions();
  syncPaperCountAndPager();
  document.querySelector('#collection-filter')?.addEventListener('change', event => {
    state.activeCollection = event.target.value;
    applyPaperFilters();
  });
  document.querySelector('#custom-topic')?.addEventListener('click', renderCustomTagModal);
  /* 文献卡片动作由 bindPaperCardActions 统一绑定，增量渲染后可安全复用。 */
  // 顶部「管理 ▾」下拉菜单：挂到 <body> 直接子级 + position: fixed 视口坐标，
  // 避免在 app-bar（sticky + backdrop-filter 含块）内绝对定位造成的溢出/裁切；
  // resize / 页面滚动实时重算；Esc / 外部点击 / 选择菜单项后关闭，焦点回按钮。
  const menuToggle = document.querySelector('#manage-menu');
  let menuPop = document.querySelector('#manage-menu-pop');
  // 上一轮渲染可能遗留 body 级旧实例（先移除，避免重复 id），新实例立即移出页面流
  document.querySelectorAll('body > #manage-menu-pop').forEach(el => el.remove());
  if (menuPop) document.body.appendChild(menuPop);
  const MENU_WIDTH = 240;
  const VIEWPORT_GAP = 12;
  const MENU_GAP = 8;
  const positionManageMenu = () => {
    const rect = menuToggle.getBoundingClientRect();
    const menuW = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const menuH = menuPop.offsetHeight;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.right - menuW),
      Math.max(VIEWPORT_GAP, window.innerWidth - menuW - VIEWPORT_GAP)
    );
    let top = rect.bottom + MENU_GAP;
    if (top + menuH > window.innerHeight - VIEWPORT_GAP) {
      top = Math.max(VIEWPORT_GAP, window.innerHeight - menuH - VIEWPORT_GAP);
    }
    menuPop.style.left = `${left}px`;
    menuPop.style.top = `${top}px`;
    menuPop.style.right = 'auto';
    menuPop.style.maxWidth = `${window.innerWidth - VIEWPORT_GAP * 2}px`;
  };
  let viewportTrack = null;
  const stopViewportTracking = () => {
    if (viewportTrack) {
      window.removeEventListener('resize', viewportTrack);
      window.removeEventListener('scroll', viewportTrack, { capture: true });
      viewportTrack = null;
    }
  };
  const closeMenu = (returnFocus) => {
    menuPop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    stopViewportTracking();
    if (returnFocus) menuToggle.focus();
  };
  const openMenu = () => {
    menuPop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
    positionManageMenu();
    viewportTrack = () => {
      if (!menuPop.hidden) positionManageMenu();
    };
    window.addEventListener('resize', viewportTrack);
    window.addEventListener('scroll', viewportTrack, { capture: true, passive: true });
    menuPop.querySelector('button')?.focus();
  };
  menuToggle.addEventListener('click', event => {
    event.stopPropagation();
    menuPop.hidden ? openMenu() : closeMenu(true);
  });
  menuToggle.addEventListener('keydown', event => {
    if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && menuPop.hidden) {
      event.preventDefault();
      openMenu();
    }
  });
  menuPop.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...menuPop.querySelectorAll('button:not([hidden])')];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next].focus();
    }
  });
  menuPop.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => closeMenu(true));
  });
  document.addEventListener('click', event => {
    if (!menuPop.hidden && !menuPop.contains(event.target) && !menuToggle.contains(event.target)) closeMenu(false);
  }, true);
  document.querySelector('#tag-manager')?.addEventListener('click', renderTagManagerModal);
  document.querySelector('#translate-settings')?.addEventListener('click', renderTranslateSettings);
  document.querySelector('#export-favorites-2')?.addEventListener('click', exportFavorites);
  document.querySelector('#sync-settings')?.addEventListener('click', syncJournalsNow);
  refreshJournalBar();
}

// ── 期刊更新（定时同步最新文献） ──────────────

// 自动同步轮询防重入（DSH 增强：页面打开时同步进行中 → 完成后自动刷新列表）
let journalPolling = false;
let journalLastLogId = null;
let journalWatchTimer = null;

function scheduleJournalStatusWatch() {
  if (workspace !== 'literature' || journalWatchTimer) return;
  journalWatchTimer = window.setTimeout(async () => {
    journalWatchTimer = null;
    if (!document.querySelector('#journal-bar')) return;
    try {
      const latest = await api('/journals');
      const latestLogId = latest.logs?.[0]?.id ?? null;
      const completedWhileIdle = !latest.running && journalLastLogId !== null && latestLogId !== null && latestLogId !== journalLastLogId;
      if (latest.running) {
        await refreshJournalBar('期刊正在后台同步…');
      } else if (completedWhileIdle) {
        journalLastLogId = latestLogId;
        await reloadPaperPage({ render: false });
        renderLiterature('期刊同步完成，文献库已更新。');
        return;
      }
      journalLastLogId = latestLogId;
    } catch { /* 后台状态检查失败不打断当前页面 */ }
    scheduleJournalStatusWatch();
  }, 10_000);
}

async function refreshJournalBar(statusText = '') {
  const bar = document.querySelector('#journal-bar');
  if (!bar) return;
  try {
    const data = await api('/journals');
    const latestLogId = data.logs?.[0]?.id ?? null;
    if (journalLastLogId === null) journalLastLogId = latestLogId;
    const sources = data.sources || [];
    const lastLog = data.logs?.[0];
    const lastSyncAt = sources
      .map(source => source.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .pop();
    const timeText = lastSyncAt ? `上次同步 ${formatSyncTime(lastSyncAt)}` : '尚未同步';
    const running = data.running ? '<span class="journal-badge running">同步中…</span>' : '';
    const summary = lastLog
      ? `最近一次：抓取 ${lastLog.fetched} 篇 · 新增 ${lastLog.inserted} 篇${lastLog.pruned ? ` · 清理 ${lastLog.pruned} 篇旧刊期` : ''}${lastLog.error ? ` · ${escapeHtml(lastLog.error)}` : ''}`
      : '点击「立即更新」从期刊官网拉取最新文献';
    const sourceChip = (source) => {
      // DSH 增强：badge 显示该刊当前文献总数（而非最近一次新增数）
      const paperCount = state.paperServerPaged
        ? Number(state.paperFacets.venueCounts?.[source.venue] || 0)
        : state.papers.filter(paper => paper.venue === source.venue).length;
      const newCount = Number((data.newCounts || {})[source.id] || 0);
      const newBadge = newCount > 0 ? `<span class="journal-badge new" title="${newCount} 篇未读新文献">新 ${newCount}</span>` : '';
      // 同步状态进入 tooltip（标题只显示名称与新增数）
      const syncInfo = source.lastError
        ? `上次同步异常：${escapeAttr(source.lastError)}`
        : source.lastSyncedAt
          ? `上次同步 ${escapeAttr(source.lastSyncedAt)} · 库中 ${paperCount} 篇` + (source.issn ? ` · ISSN ${escapeAttr(source.issn)}` : '')
          : '尚未同步' + (source.issn ? ` · ISSN ${escapeAttr(source.issn)}` : '');
      const badge = source.lastError
        ? `<span class="journal-badge failed" title="${escapeAttr(source.lastError)}">异常</span>`
        : source.lastSyncedAt
          ? `<span class="journal-badge ok" title="${escapeAttr(syncInfo)}">${paperCount} 篇</span>`
          : '<span class="journal-badge idle">未同步</span>';
      // UI 合并：期刊筛选统一走期刊更新栏（原独立「全部期刊」行已移除）
      const active = state.activeVenue === source.venue ? ' active' : '';
      return `<button type="button" class="journal-source-chip${active}" data-journal-venue="${escapeAttr(source.venue)}" data-journal-id="${escapeAttr(source.id)}" title="点击筛选「${escapeAttr(source.venue)}」的文献 · ${escapeAttr(syncInfo)}">${escapeHtml(source.venue)}${newBadge}${badge}</button>`;
    };
    // 分组策略：有更新 > 我的常用（自定义/最近访问）> 全部期刊（国内/国外）
    // 默认最多展示 10 个期刊，其余经「展开全部」显示
    const withUpdate = sources.filter(source => Number((data.newCounts || {})[source.id] || 0) > 0);
    const favoriteList = sources.filter(source => (source.isCustom || source.lastViewedAt) && !withUpdate.includes(source));
    const restList = sources
      .filter(source => !withUpdate.includes(source) && !favoriteList.includes(source))
      .sort((a, b) => String(b.lastViewedAt || '').localeCompare(String(a.lastViewedAt || '')));
    const quota = 10;
    const shownRestCount = Math.max(0, quota - withUpdate.length - favoriteList.length);
    const shownRest = restList.slice(0, shownRestCount);
    const extraVenues = sources.filter(source => !shownRest.includes(source) && !withUpdate.includes(source) && !favoriteList.includes(source));
    const updatedGroup = withUpdate.length
      ? `<details class="journal-group journal-updated-group" open data-journal-group="updated"><summary><span class="journal-group-label">有更新</span><span class="journal-group-count">${withUpdate.length} 刊</span></summary><div class="journal-sources">${withUpdate.map(sourceChip).join('')}</div></details>`
      : '';
    const pinnedGroup = (favoriteList.length || shownRest.length)
      ? `<details class="journal-group" open data-journal-group="pinned"><summary><span class="journal-group-label">我的常用期刊</span><span class="journal-group-count">${favoriteList.length + shownRest.length} 刊</span></summary><div class="journal-sources">${[...favoriteList, ...shownRest].map(sourceChip).join('')}</div></details>`
      : '';
    // 其余期刊 → 国内/国外分组（收纳在「全部期刊」下，可折叠）
    const journalGroup = (label, key, list) => {
      if (!list.length) return '';
      const collapsed = localStorage.getItem(`hana-research-journal-group-${key}`) === '1';
      return `<details class="journal-group journal-extra-sources" ${collapsed ? '' : 'open'} data-journal-group="${key}"><summary><span class="journal-group-label">${label}</span><span class="journal-group-count">${list.length} 刊</span></summary><div class="journal-sources">${list.map(sourceChip).join('')}</div></details>`;
    };
    const cnExtra = extraVenues.filter(source => source.region === 'cn');
    const intlExtra = extraVenues.filter(source => source.region !== 'cn');
    const extraGroups = journalGroup('国内期刊', 'cn', cnExtra) + journalGroup('国外期刊', 'intl', intlExtra);
    const expandBtn = extraVenues.length
      ? `<button type="button" class="journal-expand-btn" id="journal-expand" aria-expanded="false" title="展开或收起其余期刊">展开全部（${extraVenues.length} 刊）</button>`
      : '';
    // UI 合并：「其他来源」组收纳文献库中存在但不在订阅期刊源列表的期刊（仅筛选，无同步状态）
    const sourceVenues = new Set(sources.map(source => source.venue));
    const libraryVenues = state.paperServerPaged
      ? Object.keys(state.paperFacets.venueCounts || {})
      : [...new Set(state.papers.map(paper => paper.venue).filter(Boolean))];
    const otherVenues = libraryVenues
      .filter(venue => !sourceVenues.has(venue))
      .sort((a, b) => a.localeCompare(b, 'zh'));
    const otherGroup = otherVenues.length
      ? journalGroup('其他来源', 'other', otherVenues.map(venue => ({ id: '', venue, region: 'other' })))
      : '';
    const allChip = `<div class="journal-filter-row"><button type="button" class="journal-source-chip ${state.activeVenue === '全部' ? 'active' : ''}" data-journal-venue="全部" title="显示全部期刊的文献">全部期刊</button></div>`;
    const groups = updatedGroup + pinnedGroup + extraGroups + otherGroup;
    const venueLabel = state.activeVenue === '全部' ? '全部期刊' : state.activeVenue;
    bar.innerHTML = `<details class="journal-disclosure" ${state.activeVenue !== '全部' ? 'open' : ''}><summary><span class="journal-bar-title">期刊更新</span><span class="journal-bar-time">${escapeHtml(timeText)}</span>${running}<span class="journal-active-venue">${escapeHtml(venueLabel)}</span><span class="disclosure-hint">查看期刊与同步</span></summary><div class="journal-disclosure-body"><div class="journal-bar-head"><span class="journal-bar-time">${escapeHtml(summary)}</span><button class="button" id="journal-brief" title="用 AI 生成最近期刊动态简报">AI 简报</button><button class="button" id="sync-journals">立即更新</button><button class="button" id="add-journal-source" title="查找、订阅和管理期刊源">管理期刊</button></div>${allChip}${groups}${expandBtn}${statusText ? `<span class="journal-bar-hint">${escapeHtml(statusText)}</span>` : ''}</div></details>`;
    // 「展开全部」切换：显示/隐藏额外期刊组
    const extraEls = Array.from(bar.querySelectorAll('.journal-extra-sources'));
    const expandBtnEl = bar.querySelector('#journal-expand');
    if (expandBtnEl && extraEls.length) {
      extraEls.forEach(details => { details.hidden = true; });
      expandBtnEl.addEventListener('click', () => {
        const expanded = expandBtnEl.getAttribute('aria-expanded') === 'true';
        extraEls.forEach(details => { details.hidden = expanded; });
        expandBtnEl.setAttribute('aria-expanded', String(!expanded));
        expandBtnEl.textContent = expanded ? `展开全部（${extraVenues.length} 刊）` : '折叠其余期刊';
      });
    }
    bar.querySelectorAll('details.journal-group').forEach(details => {
      details.addEventListener('toggle', () => {
        localStorage.setItem(`hana-research-journal-group-${details.dataset.journalGroup}`, details.open ? '0' : '1');
      });
    });
    bar.querySelector('#sync-journals')?.addEventListener('click', syncJournalsNow);
    bar.querySelector('#add-journal-source')?.addEventListener('click', renderJournalManagerModal);
    bar.querySelector('#journal-brief')?.addEventListener('click', renderJournalBrief);
    // DSH 增强：点击期刊源 chip → 标记已查看（新文献徽标归零）+ 筛选该刊（「全部期刊」仅清除筛选）
    bar.querySelectorAll('[data-journal-venue]').forEach(chip => {
      chip.addEventListener('click', () => {
        const venue = chip.dataset.journalVenue;
        const sourceId = chip.dataset.journalId;
        if (sourceId && venue !== '全部') {
          api(`/journals/${encodeURIComponent(sourceId)}/view`, { method: 'POST' }).catch(() => {});
        }
        state.activeVenue = venue;
        bar.querySelectorAll('[data-journal-venue]').forEach(item => item.classList.toggle('active', item.dataset.journalVenue === state.activeVenue));
        applyPaperFilters();
        const grid = document.querySelector('.paper-grid');
        if (grid) grid.scrollIntoView({ behavior: hanaSettings.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' });
      });
    });
    // DSH 增强：同步进行中 → 轮询直到完成，随后自动刷新文献列表
    if (data.running && !journalPolling) {
      journalPolling = true;
      const poll = async () => {
        try {
          const latest = await api('/journals');
          if (!latest.running) {
            journalPolling = false;
            await reloadPaperPage({ render: false });
            renderLiterature('期刊同步完成，文献库已更新。');
            return;
          }
          window.setTimeout(poll, 3000);
        } catch {
          journalPolling = false;
          refreshJournalBar();
        }
      };
      window.setTimeout(poll, 3000);
    }
    scheduleJournalStatusWatch();
  } catch (error) {
    // UI 合并：同步接口不可用时仍保留期刊筛选（基于文献库已有 venue）
    const fallbackVenues = (state.paperServerPaged
      ? Object.keys(state.paperFacets.venueCounts || {})
      : [...new Set(state.papers.map(paper => paper.venue).filter(Boolean))]).sort((a, b) => a.localeCompare(b, 'zh'));
    const fallbackChips = [`<button type="button" class="journal-source-chip ${state.activeVenue === '全部' ? 'active' : ''}" data-journal-venue="全部">全部期刊</button>`]
      .concat(fallbackVenues.map(venue => `<button type="button" class="journal-source-chip ${state.activeVenue === venue ? 'active' : ''}" data-journal-venue="${escapeAttr(venue)}">${escapeHtml(venue)}</button>`))
      .join('');
    bar.innerHTML = `<div class="journal-bar-head"><span class="journal-bar-title">期刊更新</span><span class="journal-bar-time">${escapeHtml(error.message)}</span></div><div class="journal-filter-row">${fallbackChips}</div>`;
    bar.querySelectorAll('[data-journal-venue]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.activeVenue = chip.dataset.journalVenue;
        bar.querySelectorAll('[data-journal-venue]').forEach(item => item.classList.toggle('active', item.dataset.journalVenue === state.activeVenue));
        applyPaperFilters();
      });
    });
    scheduleJournalStatusWatch();
  }
}

// P2 增强：AI 期刊简报（宿主模型汇总最近同步与新增文献）
async function renderJournalBrief() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Journal brief</span>
    <h2>AI 期刊简报</h2>
    <div id="journal-brief-body" class="journal-brief-body"><p class="search-hint">正在调用模型生成简报…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  try {
    const result = await api('/journals/brief', { method: 'POST' });
    const body = layer.querySelector('#journal-brief-body');
    body.innerHTML = `<pre class="journal-brief-text">${escapeHtml(result.text)}</pre>`;
  } catch (error) {
    const body = layer.querySelector('#journal-brief-body');
    body.innerHTML = `<p class="search-hint search-warn">简报生成失败：${escapeHtml(error.message)}</p>`;
  }
}

// P2 增强：AI 项目综述草稿（汇总项目笔记）
async function renderProjectSummary(projectId, projectTitle) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Draft</span>
    <h2>综述草稿 · ${escapeHtml(projectTitle)}</h2>
    <div id="summary-body" class="journal-brief-body"><p class="search-hint">正在调用模型汇总项目笔记…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  try {
    const result = await api(`/projects/${encodeURIComponent(projectId)}/summary`, { method: 'POST' });
    const body = layer.querySelector('#summary-body');
    body.innerHTML = `<pre class="journal-brief-text">${escapeHtml(result.text)}</pre>`;
  } catch (error) {
    const body = layer.querySelector('#summary-body');
    body.innerHTML = `<p class="search-hint search-warn">草稿生成失败：${escapeHtml(error.message)}</p>`;
  }
}

// P2 增强（P5）：文献关系标注 modal（A 支持/反驳/被 B 引用）
function renderRelationModal(projectId, fromPaperId, papers) {
  const from = papers.find(paper => paper.id === fromPaperId);
  if (!from || papers.length < 2) {
    showNotice('需要至少两篇项目文献才能建立关系。', true);
    return;
  }
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Argument chain</span>
    <h2>标注文献关系</h2>
    <p class="modal-copy">来源：<strong>${escapeHtml(from.title.slice(0, 50))}</strong>。选择关系类型与目标文献，构建项目内论证链。</p>
    <form id="relation-form" class="settings-form">
      <label>关系类型<select name="relation"><option value="supports">支持（来源文献支持目标文献）</option><option value="refutes">反驳（来源文献反驳目标文献）</option><option value="cites">被引用（目标文献引用了来源文献）</option></select></label>
      <label>目标文献<select name="toPaperId" required>${papers.filter(paper => paper.id !== fromPaperId).map(paper => `<option value="${escapeAttr(paper.id)}">${escapeHtml(paper.title.slice(0, 60))}</option>`).join('')}</select></label>
      <label>备注（可选）<input name="note" maxlength="500" placeholder="例如：与本文结果一致，但样本不同" autocomplete="off"></label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存关系</button></div>
    </form>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('#relation-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: `relation-create:${projectId}`,
      slowMessage: '正在保存文献关系…',
      errorPrefix: '关系保存失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/relations`, {
        method: 'POST',
        body: JSON.stringify({
          fromPaperId,
          toPaperId: formData.get('toPaperId'),
          relation: formData.get('relation'),
          note: formData.get('note'),
        }),
      }));
    if (!action.ok) return;
    closeModalLayer();
    openProjectDrawer(projectId);
    showNotice('文献关系已保存。');
  });
}

function evidenceCodingDisplay(field, value) {
  if (!evidenceValuePresent(value)) return '—';
  if (field.type === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.join('；');
  return String(value);
}

function markdownCell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ') || '—';
}

// P2 增强（P4）：证据矩阵 modal（表格式概览 + 原生 CSV/XLSX/Markdown 导出）
async function renderEvidenceMatrixModal(projectId, projectTitle) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Evidence matrix</span>
    <h2>证据矩阵 · ${escapeHtml(projectTitle)}</h2>
    <div id="evidence-body" class="journal-brief-body"><p class="search-hint">正在汇总项目笔记…</p></div>
    <div class="composer-actions"><button type="button" class="button" id="evidence-xlsx">导出 Excel</button><button type="button" class="button" id="evidence-csv">导出 CSV</button><button type="button" class="button" id="evidence-md">导出 Markdown</button><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  let matrix = null;
  try {
    matrix = await api(`/projects/${encodeURIComponent(projectId)}/evidence-matrix`);
    const body = layer.querySelector('#evidence-body');
    if (!matrix.papers.length) {
      body.innerHTML = '<p class="search-hint">项目还没有文献。导入文献并添加笔记后，这里将生成证据矩阵。</p>';
      layer.querySelector('#evidence-csv').disabled = true;
      layer.querySelector('#evidence-xlsx').disabled = true;
      layer.querySelector('#evidence-md').disabled = true;
      return;
    }
    const codingHeaders = (matrix.fields || []).map(field => `<th title="${escapeAttr(field.description || '')}">编码 · ${escapeHtml(field.label)}${field.required ? ' *' : ''}</th>`).join('');
    body.innerHTML = `<div class="evidence-scroll"><table class="evidence-table"><thead><tr><th>文献</th><th>设计</th><th>角色</th><th>题录筛选</th><th>全文筛选</th><th>排除理由</th><th>笔记数</th><th>笔记摘要</th><th>标签</th>${codingHeaders}</tr></thead><tbody>${matrix.papers.map(paper => `<tr><td><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.venue)}${paper.year ? ` · ${escapeHtml(paper.year)}` : ''}</small></td><td>${escapeHtml(paper.design || '—')}</td><td>${paper.role ? escapeHtml(PAPER_ROLE_LABELS[paper.role] || paper.role) : '—'}</td><td>${escapeHtml(SCREENING_DECISION_LABELS[paper.titleAbstractDecision] || '待筛选')}</td><td>${escapeHtml(SCREENING_DECISION_LABELS[paper.fullTextDecision] || '待筛选')}</td><td>${escapeHtml(paper.fullTextReason || paper.titleAbstractReason || '—')}</td><td>${paper.noteCount}</td><td class="evidence-notes">${escapeHtml(paper.notesSummary || '—').slice(0, 300)}</td><td>${escapeHtml(paper.tags || '—')}</td>${(matrix.fields || []).map(field => `<td>${escapeHtml(evidenceCodingDisplay(field, paper.codingValues?.[field.id]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${matrix.relations.length ? `<p class="evidence-relations">论证链：${matrix.relations.map(escapeHtml).join('；')}</p>` : ''}`;
  } catch (error) {
    layer.querySelector('#evidence-body').innerHTML = `<p class="search-hint search-warn">证据矩阵生成失败：${escapeHtml(error.message)}</p>`;
    return;
  }
  layer.querySelector('#evidence-xlsx').addEventListener('click', () => {
    window.location.href = apiUrl(`/projects/${encodeURIComponent(projectId)}/export?format=xlsx`);
    showNotice('正在生成原生 Excel 证据矩阵…');
  });
  layer.querySelector('#evidence-csv').addEventListener('click', () => {
    window.location.href = apiUrl(`/projects/${encodeURIComponent(projectId)}/export?format=csv`);
    showNotice('正在下载 CSV 证据矩阵…');
  });
  layer.querySelector('#evidence-md').addEventListener('click', () => {
    const headers = ['文献', '设计', '角色', '题录筛选', '全文筛选', '排除理由', '笔记数', '笔记摘要', '标签', ...(matrix.fields || []).map(field => `编码：${field.label}`)];
    const lines = [`# ${projectTitle} 证据矩阵`, '', `| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
    for (const paper of matrix.papers) {
      const cells = [paper.title, paper.design || '—', paper.role ? PAPER_ROLE_LABELS[paper.role] || paper.role : '—', SCREENING_DECISION_LABELS[paper.titleAbstractDecision] || '待筛选', SCREENING_DECISION_LABELS[paper.fullTextDecision] || '待筛选', paper.fullTextReason || paper.titleAbstractReason || '—', paper.noteCount, paper.notesSummary || '—', paper.tags || '—', ...(matrix.fields || []).map(field => evidenceCodingDisplay(field, paper.codingValues?.[field.id]))];
      lines.push(`| ${cells.map(markdownCell).join(' | ')} |`);
    }
    if (matrix.relations.length) lines.push('', '## 论证链', '', ...matrix.relations.map(line => `- ${line}`));
    downloadBlob(`${safeFileName(projectTitle)}-证据矩阵.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  });
}

// P2 增强（P8）：笔记导出（Markdown / 原生 DOCX / 原生 PDF）
function renderNoteExportModal(projectId, projectTitle) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Export notes</span>
    <h2>导出项目笔记</h2>
    <p class="modal-copy">项目笔记包含来源文献、页码、标签与跨文献关联。DOCX 与 PDF 均由 HanaResearch 直接生成，可离线打开和归档。</p>
    <div class="export-options">
      <button type="button" class="export-option" data-export-format="markdown"><b>Markdown</b><span>保留纯文本与结构，适合版本管理</span></button>
      <button type="button" class="export-option" data-export-format="docx"><b>Word 文档（.docx）</b><span>原生 Office 文档，保留标题层级、来源和页码</span></button>
      <button type="button" class="export-option" data-export-format="pdf"><b>PDF 文档（.pdf）</b><span>内嵌中文字体，可搜索、打印和长期归档</span></button>
    </div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-export-format]').forEach(button => {
    button.addEventListener('click', async () => {
      const format = button.dataset.exportFormat;
      try {
        closeModalLayer();
        if (format === 'markdown') {
          window.location.href = apiUrl(`/projects/${encodeURIComponent(projectId)}/notes/file`);
          showNotice('正在下载 Markdown 笔记…');
          return;
        }
        window.location.href = apiUrl(`/projects/${encodeURIComponent(projectId)}/export?format=${encodeURIComponent(format)}`);
        showNotice(format === 'docx' ? '正在生成原生 Word 笔记…' : '正在生成 PDF 笔记…');
      } catch (error) {
        showNotice(error.message, true);
      }
    });
  });
}

// ── 导出工具 ───────────────────────────

function safeFileName(value) {
  return String(value || '研究项目').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || '研究项目';
}

function downloadBlob(fileName, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// 期刊源管理器：先识别再订阅，并在一个低密度界面内完成同步、启停与维护。
async function renderJournalManagerModal() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel journal-manager-panel" role="dialog" aria-modal="true" aria-labelledby="journal-manager-title">
    <header class="journal-manager-head">
      <div><span class="composer-kicker">期刊来源</span><h2 id="journal-manager-title">管理期刊</h2><p class="modal-copy">通过 ISSN 准确识别期刊。订阅后会自动保留最近三期文献。</p></div>
      <button type="button" class="icon-button journal-manager-close" data-modal-cancel aria-label="关闭">×</button>
    </header>
    <section class="journal-discovery" aria-labelledby="journal-discovery-title">
      <div class="journal-section-title"><div><h3 id="journal-discovery-title">查找并订阅</h3><p>可从期刊官网的 About 页面找到 ISSN。</p></div></div>
      <form id="journal-resolve-form" class="journal-resolve-form">
        <label><span>ISSN</span><input name="issn" maxlength="16" placeholder="例如 1389-4978" inputmode="text" autocomplete="off" required></label>
        <button type="submit" class="button primary"><span data-action-label>识别期刊</span></button>
      </form>
      <div id="journal-resolve-result" class="journal-resolve-result" aria-live="polite"></div>
    </section>
    <section class="journal-library" aria-labelledby="journal-library-title">
      <div class="journal-section-title"><div><h3 id="journal-library-title">已订阅期刊</h3><p id="journal-source-summary">正在读取期刊源…</p></div>
        <div class="journal-manager-tools"><input id="journal-source-search" type="search" placeholder="筛选名称、主题或 ISSN" aria-label="筛选期刊源"><select id="journal-source-filter" aria-label="期刊源状态"><option value="all">全部</option><option value="custom">自定义</option><option value="paused">已暂停</option><option value="error">异常</option></select></div>
      </div>
      <div id="journal-source-list" class="journal-source-list"><p class="search-hint">正在读取…</p></div>
    </section>
    <footer class="journal-manager-foot"><span>数据来自 OpenAlex；移除订阅不会删除已入库文献。</span><button type="button" class="button" data-modal-cancel>完成</button></footer>
  </div>`;
  document.body.append(layer);
  layer.querySelectorAll('[data-modal-cancel]').forEach(button => button.addEventListener('click', closeModalLayer));

  let managerData = { sources: [], running: false };
  let resolvedJournal = null;
  const list = layer.querySelector('#journal-source-list');
  const summary = layer.querySelector('#journal-source-summary');
  const search = layer.querySelector('#journal-source-search');
  const filter = layer.querySelector('#journal-source-filter');

  const refreshManagerData = async () => {
    managerData = await api('/journals');
    renderSourceList();
  };

  const renderSourceList = () => {
    const query = search.value.trim().toLowerCase();
    const kind = filter.value;
    const sources = (managerData.sources || []).filter(source => {
      const text = `${source.venue} ${source.topic} ${source.issn}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (kind === 'custom' && !source.isCustom) return false;
      if (kind === 'paused' && source.enabled) return false;
      if (kind === 'error' && !source.lastError) return false;
      return true;
    });
    const enabledCount = (managerData.sources || []).filter(source => source.enabled).length;
    summary.textContent = `${enabledCount} 个启用 · ${(managerData.sources || []).length - enabledCount} 个暂停`;
    if (!sources.length) {
      list.innerHTML = '<div class="journal-manager-empty"><strong>没有符合条件的期刊</strong><span>调整筛选条件，或在上方按 ISSN 添加。</span></div>';
      return;
    }
    list.innerHTML = sources.map(source => {
      const statusClass = !source.enabled ? 'paused' : source.lastError ? 'error' : source.lastSyncedAt ? 'ok' : 'idle';
      const statusText = !source.enabled ? '已暂停' : source.lastError ? '同步异常' : source.lastSyncedAt ? `同步于 ${formatSyncTime(source.lastSyncedAt)}` : '等待首次同步';
      const editForm = source.isCustom ? `<form class="journal-source-edit" data-edit-form="${escapeAttr(source.id)}" hidden>
        <label>名称<input name="venue" maxlength="120" value="${escapeAttr(source.venue)}" required></label>
        <label>ISSN<input name="issn" maxlength="16" value="${escapeAttr(source.issn)}" required></label>
        <label>主题<input name="topic" maxlength="60" value="${escapeAttr(source.topic || '')}"></label>
        <div><button type="button" class="button" data-cancel-edit="${escapeAttr(source.id)}">取消</button><button type="submit" class="button primary"><span data-action-label>保存</span></button></div>
      </form>` : '';
      return `<article class="journal-source-row" data-source-id="${escapeAttr(source.id)}">
        <div class="journal-source-main"><span class="journal-status-dot ${statusClass}" aria-hidden="true"></span><div class="journal-source-copy"><strong>${escapeHtml(source.venue)}</strong><span>${escapeHtml(source.topic || '未分类')} · ISSN ${escapeHtml(source.issn || '未知')} · ${source.isCustom ? '自定义' : '内置'}</span><small title="${escapeAttr(source.lastError || '')}">${escapeHtml(statusText)}</small></div></div>
        <div class="journal-source-actions"><button type="button" class="button" data-sync-source="${escapeAttr(source.id)}" ${!source.enabled || managerData.running ? 'disabled' : ''}><span data-action-label>同步</span></button><button type="button" class="button" data-toggle-source="${escapeAttr(source.id)}">${source.enabled ? '暂停' : '启用'}</button>${source.isCustom ? `<button type="button" class="button" data-edit-source="${escapeAttr(source.id)}">编辑</button><button type="button" class="button danger-quiet" data-delete-source="${escapeAttr(source.id)}">移除</button>` : ''}</div>
        ${editForm}
      </article>`;
    }).join('');
    bindSourceActions();
  };

  const bindSourceActions = () => {
    list.querySelectorAll('[data-sync-source]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.syncSource;
      const action = await runButtonAction(button, { key: `journal-sync:${id}`, pendingLabel: '同步中', slowMessage: '正在抓取该刊最近三期文献…', errorPrefix: '同步失败' }, () => api(`/journals/${encodeURIComponent(id)}/sync`, { method: 'POST' }));
      if (!action.ok) return;
      const result = action.value.result;
      showNotice(result.error ? `同步未完成：${result.error}` : `同步完成：抓取 ${result.fetched} 篇，新增 ${result.inserted} 篇。`, Boolean(result.error));
      await reloadPaperPage();
      await refreshManagerData();
      refreshJournalBar();
    }));
    list.querySelectorAll('[data-toggle-source]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.toggleSource;
      const source = managerData.sources.find(item => item.id === id);
      const action = await runButtonAction(button, { key: `journal-toggle:${id}`, errorPrefix: source?.enabled ? '暂停失败' : '启用失败' }, () => api(`/journals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: !source.enabled }) }));
      if (action.ok) { await refreshManagerData(); refreshJournalBar(); }
    }));
    list.querySelectorAll('[data-edit-source]').forEach(button => button.addEventListener('click', () => {
      const form = list.querySelector(`[data-edit-form="${CSS.escape(button.dataset.editSource)}"]`);
      if (form) { form.hidden = false; form.querySelector('input')?.focus(); }
    }));
    list.querySelectorAll('[data-cancel-edit]').forEach(button => button.addEventListener('click', () => {
      const form = list.querySelector(`[data-edit-form="${CSS.escape(button.dataset.cancelEdit)}"]`);
      if (form) form.hidden = true;
    }));
    list.querySelectorAll('.journal-source-edit').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const id = form.dataset.editForm;
      const values = new FormData(form);
      const button = form.querySelector('[type="submit"]');
      const action = await runButtonAction(button, { key: `journal-edit:${id}`, pendingLabel: '保存中', errorPrefix: '保存失败' }, () => api(`/journals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ venue: values.get('venue').toString().trim(), issn: values.get('issn').toString().trim(), topic: values.get('topic').toString().trim() }) }));
      if (action.ok) { showNotice('期刊信息已更新。'); await refreshManagerData(); refreshJournalBar(); }
    }));
    list.querySelectorAll('[data-delete-source]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.deleteSource;
      const source = managerData.sources.find(item => item.id === id);
      if (!(await confirmDialog({ title: '移除期刊订阅', message: `移除「${source?.venue || '该期刊'}」的订阅？已同步到文献库的文章会保留。`, confirmLabel: '移除订阅', danger: true }))) return;
      const action = await runButtonAction(button, { key: `journal-delete:${id}`, errorPrefix: '移除失败' }, () => api(`/journals/${encodeURIComponent(id)}`, { method: 'DELETE' }));
      if (action.ok) { showNotice('订阅已移除，已有文献仍保留在文献库。'); await refreshManagerData(); refreshJournalBar(); }
    }));
  };

  const resultRoot = layer.querySelector('#journal-resolve-result');
  const renderResolvedJournal = (journal, existing) => {
    resolvedJournal = journal;
    const homepage = /^https?:\/\//i.test(journal.homepageUrl || '') ? `<a href="${escapeAttr(journal.homepageUrl)}" target="_blank" rel="noreferrer">期刊主页 ↗</a>` : '';
    const previews = (journal.preview || []).map(item => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.publicationDate || item.year || '日期未知')}</span></li>`).join('');
    resultRoot.innerHTML = `<article class="journal-verified-card">
      <div class="journal-verified-mark" aria-hidden="true">✓</div><div class="journal-verified-copy"><span class="journal-verified-label">已核对 OpenAlex 记录</span><h4>${escapeHtml(journal.venue)}</h4><p>ISSN ${escapeHtml(journal.issn)}${journal.issns?.length > 1 ? ` · 其他刊号 ${escapeHtml(journal.issns.filter(value => value !== journal.issn).join('、'))}` : ''}</p><div class="journal-verified-meta"><span>${Number(journal.worksCount || 0).toLocaleString('zh-CN')} 篇收录</span>${journal.isOpenAccess ? '<span>开放获取</span>' : ''}${homepage}</div></div>
      <form id="journal-subscribe-form" class="journal-subscribe-form"><label>归入主题<input name="topic" maxlength="60" placeholder="例如：积极心理学" value="自定义"></label><button type="submit" class="button primary" ${existing ? 'disabled' : ''}><span data-action-label>${existing ? '已在订阅列表' : '订阅并同步'}</span></button></form>
      ${previews ? `<details class="journal-preview"><summary>核对最近收录的文章</summary><ol>${previews}</ol></details>` : ''}
    </article>`;
    resultRoot.querySelector('#journal-subscribe-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (existing || !resolvedJournal) return;
      const topic = new FormData(event.currentTarget).get('topic').toString().trim();
      const button = event.currentTarget.querySelector('[type="submit"]');
      const action = await runButtonAction(button, { key: `journal-create:${resolvedJournal.issn}`, pendingLabel: '订阅中', slowMessage: '正在同步该刊最近三期文献…', errorPrefix: '订阅失败', keepDisabled: true }, async () => {
        const created = await api('/journals/custom', { method: 'POST', body: JSON.stringify({ venue: resolvedJournal.venue, issn: resolvedJournal.issn, topic }) });
        try {
          const synced = await api(`/journals/${encodeURIComponent(created.source.id)}/sync`, { method: 'POST' });
          return { created, synced, syncError: synced.result?.error || '' };
        } catch (error) {
          // 订阅已经成功时不让后续同步故障把整个操作伪装成失败，避免重试产生重复源。
          return { created, synced: null, syncError: error.message };
        }
      });
      if (!action.ok) return;
      const syncResult = action.value.synced?.result;
      showNotice(action.value.syncError
        ? `已订阅「${resolvedJournal.venue}」，首次同步稍后重试：${action.value.syncError}`
        : `已订阅「${resolvedJournal.venue}」，新增 ${syncResult.inserted} 篇文献。`, Boolean(action.value.syncError));
      await reloadPaperPage();
      await refreshManagerData();
      refreshJournalBar();
      renderResolvedJournal(resolvedJournal, action.value.created.source);
    });
  };

  layer.querySelector('#journal-resolve-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: `journal-resolve:${formData.get('issn')}`,
      pendingLabel: '识别中',
      slowMessage: '正在核对 OpenAlex 期刊记录…',
      errorPrefix: '识别失败',
    }, () => api('/journals/resolve', { method: 'POST', body: JSON.stringify({ issn: formData.get('issn').toString().trim() }) }));
    if (!action.ok) return;
    renderResolvedJournal(action.value.journal, action.value.existing);
  });

  search.addEventListener('input', renderSourceList);
  filter.addEventListener('change', renderSourceList);
  try {
    await refreshManagerData();
  } catch (error) {
    list.innerHTML = `<div class="journal-manager-empty"><strong>期刊源读取失败</strong><span>${escapeHtml(error.message)}</span></div>`;
    summary.textContent = '暂时无法读取';
  }
}

async function syncJournalsNow() {
  const bar = document.querySelector('#journal-bar');
  if (!bar) return;
  try {
    const result = await api('/journals/sync', { method: 'POST' });
    if (!result.started) {
      refreshJournalBar('已有同步正在进行，请稍候…');
      return;
    }
    refreshJournalBar('正在从期刊官网拉取最新文献…');
    let data = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      data = await api('/journals');
      if (!data.running) break;
    }
    const inserted = (data?.logs?.[0]?.inserted) || 0;
    const pruned = (data?.logs?.[0]?.pruned) || 0;
    const failed = (data?.sources || []).filter(source => source.lastError).length;
    showNotice(`期刊更新完成：新增 ${inserted} 篇文献${pruned ? `，清理 ${pruned} 篇超出近三期的旧文献` : ''}${failed ? `，${failed} 个期刊源异常` : ''}。`);
    // 刷新文献列表以显示新同步的文献
    await reloadPaperPage({ render: false });
    renderLiterature();
  } catch (error) {
    refreshJournalBar(`同步失败：${error.message}`);
  }
}

function formatSyncTime(iso) {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMinutes = Math.round((now - date) / 60000);
    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    if (diffMinutes < 24 * 60) return `${Math.round(diffMinutes / 60)} 小时前`;
    return `${Math.round(diffMinutes / (24 * 60))} 天前`;
  } catch {
    return String(iso || '');
  }
}

async function renderTranslateSettings() {
  closeModalLayer();
  let config = { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', sourceLang: 'en', targetLang: 'zh', hasKey: false };
  try {
    config = (await api('/translate/config')).config;
  } catch {
    /* 使用默认值 */
  }
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">AI translation</span>
    <h2>翻译设置</h2>
    <p class="modal-copy">配置用于「全文翻译生成译文文档」的 AI 服务（OpenAI 兼容接口）。API Key 只保存在本地，不会显示。服务域名须在插件网络白名单内。</p>
    <form id="translate-config-form" class="settings-form">
      <label>服务地址（baseURL）<input name="baseURL" value="${escapeAttr(config.baseURL)}" placeholder="https://api.deepseek.com"></label>
      <label>模型<input name="model" value="${escapeAttr(config.model)}" placeholder="deepseek-chat"></label>
      <label>API Key<input name="apiKey" type="password" placeholder="${config.hasKey ? '已配置（留空保持不变）' : 'sk-…'}" autocomplete="off"></label>
      <label>目标语言<input name="targetLang" value="${escapeAttr(config.targetLang)}" placeholder="zh"></label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存</button></div>
    </form>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('#translate-config-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const saved = await api('/translate/config', {
        method: 'POST',
        body: JSON.stringify({
          baseURL: form.get('baseURL'),
          model: form.get('model'),
          apiKey: form.get('apiKey'),
          targetLang: form.get('targetLang'),
        }),
      });
      closeModalLayer();
      showNotice(saved.config.hasKey ? '翻译设置已保存。' : '翻译设置已保存（尚未配置 API Key）。', !saved.config.hasKey);
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

function paperSearchHaystack(paper) {
  return `${paper.title || ''} ${paper.authors || ''} ${paper.topic || ''} ${paper.venue || ''} ${paper.abstract || ''}`.toLowerCase();
}

function filteredLibraryPapers() {
  if (state.paperServerPaged) return state.papers;
  return state.papers.filter(paper => {
    const topicMatch = state.activeTopic === '全部' || paper.topic === state.activeTopic;
    const venueMatch = state.activeVenue === '全部' || paper.venue === state.activeVenue;
    const readMatch = state.activeReadStatus === '全部' || (paper.readStatus || 'unread') === state.activeReadStatus;
    const collectionMatch = state.activeCollection === '全部' || (paper.collectionIds || []).includes(state.activeCollection);
    const haystack = paperSearchHaystack(paper);
    const tagMatch = !state.activeCustomTag || haystack.includes(state.activeCustomTag.toLowerCase());
    const methodMatch = state.activeMethodology === '全部' || (paper.methodology || []).includes(state.activeMethodology);
    const queryMatch = !state.query || haystack.includes(state.query);
    return topicMatch && venueMatch && readMatch && collectionMatch && tagMatch && methodMatch && queryMatch;
  });
}

function emptyPaperGridMarkup(filtered) {
  const libraryTotal = state.paperServerPaged ? Number(state.paperFacets.libraryTotal || 0) : state.papers.length;
  const filteredOut = libraryTotal > 0 && filtered.length === 0;
  return `<div class="state-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg><h3>${filteredOut ? '没有符合条件的文献' : '文献库还是空的'}</h3><p>${filteredOut ? '尝试清除关键词或减少筛选条件。' : '在上方「学术检索」输入关键词检索全网学术资源，或等待订阅期刊同步。'}</p></div>`;
}

function paperGridMarkup() {
  const filtered = filteredLibraryPapers();
  if (!filtered.length) return emptyPaperGridMarkup(filtered);
  if (state.paperServerPaged) return filtered.map((paper, index) => paperCard(paper, index)).join('');
  return filtered.slice(0, state.paperRenderLimit).map((paper, index) => paperCard(paper, index)).join('');
}

function countFilterDescription() {
  const parts = [];
  if (state.activeTopic !== '全部') parts.push(`主题「${state.activeTopic}」`);
  if (state.activeVenue !== '全部') parts.push(`期刊「${state.activeVenue}」`);
  if (state.activeReadStatus !== '全部') parts.push(`状态「${state.activeReadStatus}」`);
  if (state.activeCollection !== '全部') {
    const collection = state.collections.find(item => item.id === state.activeCollection);
    parts.push(`收藏集「${collection?.title || state.activeCollection}」`);
  }
  if (state.activeMethodology !== '全部') parts.push(`方法学「${state.activeMethodology}」`);
  if (state.activeCustomTag) parts.push(`标签「${state.activeCustomTag}」`);
  return parts.length ? ` · 筛选：${parts.join(' / ')}` : '';
}

function syncPaperCountAndPager() {
  const filtered = filteredLibraryPapers();
  const total = state.paperServerPaged ? Number(state.paperPagination.total || 0) : filtered.length;
  const shown = state.paperServerPaged ? state.papers.length : Math.min(filtered.length, state.paperRenderLimit);
  const count = document.querySelector('#paper-count');
  if (count) count.textContent = `${total} 篇${shown < total ? ` · 已显示 ${shown}` : ''}${countFilterDescription()}`;
  const pager = document.querySelector('#paper-load-more');
  if (!pager) return;
  if (state.paperServerPaged && state.paperPagination.hasMore) {
    const nextCount = Math.min(state.paperPagination.pageSize || PAPER_RENDER_BATCH, total - shown);
    pager.innerHTML = `<button type="button" class="button paper-load-button" ${state.paperLoading ? 'disabled aria-busy="true"' : ''}>${state.paperLoading ? '正在加载…' : `继续显示 ${nextCount} 篇`}</button><span>剩余 ${Math.max(0, total - shown)} 篇</span>`;
    pager.querySelector('button')?.addEventListener('click', loadNextPaperPage);
  } else if (!state.paperServerPaged && shown < filtered.length) {
    pager.innerHTML = `<button type="button" class="button paper-load-button">继续显示 ${Math.min(PAPER_RENDER_BATCH, filtered.length - shown)} 篇</button><span>剩余 ${filtered.length - shown} 篇</span>`;
    pager.querySelector('button')?.addEventListener('click', () => {
      state.paperRenderLimit += PAPER_RENDER_BATCH;
      renderPaperGrid();
    });
  } else {
    pager.innerHTML = total > PAPER_RENDER_BATCH ? `<span>已显示全部 ${total} 篇</span>` : '';
  }
}

function renderPaperGrid() {
  const grid = document.querySelector('.paper-grid');
  if (!grid) return;
  grid.innerHTML = paperGridMarkup();
  bindPaperCardActions(grid);
  syncPaperCountAndPager();
}

function bindPaperCardActions(scope = document) {
  scope.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', () => toggleFavorite(button.dataset.favorite, button)));
  scope.querySelectorAll('[data-agent-paper]').forEach(button => button.addEventListener('click', () => {
    const paper = state.papers.find(item => item.id === button.dataset.agentPaper);
    if (!paper) return;
    handoffToAgent(
      `请围绕这篇文献协助我：${paper.title}${paper.doi ? `（DOI: ${paper.doi}）` : ''}，${paper.venue || '期刊未知'}，${paper.year || '年份未知'}。本地 paperId: ${paper.id}。请先检查 HanaResearch 中已有的元数据、项目归属和笔记，再判断它与我的研究项目是否相关，并给出下一步建议。如果没有本地 PDF 或证据笔记，请明确说明，不要声称已读全文。`,
      `《${paper.title.slice(0, 18)}…》已交给 Agent`
    );
  }));
  scope.querySelectorAll('[data-import-pdf]').forEach(button => button.addEventListener('click', () => importPdf(button.dataset.importPdf, button)));
  scope.querySelectorAll('[data-toggle-read]').forEach(button => button.addEventListener('click', () => toggleReadStatus(button.dataset.toggleRead, button.dataset.readStatus, button)));
  scope.querySelectorAll('[data-priority]').forEach(button => button.addEventListener('click', () => cyclePriority(button.dataset.priority, button)));
  scope.querySelectorAll('[data-export-paper]').forEach(button => button.addEventListener('click', () => exportPaperCitations(button.dataset.exportPaper)));
  scope.querySelectorAll('[data-collections]').forEach(button => button.addEventListener('click', () => renderCollectionModal(button.dataset.collections)));
  scope.querySelectorAll('[data-methodology-edit]').forEach(button => button.addEventListener('click', () => renderMethodologyModal(button.dataset.methodologyEdit)));
  scope.querySelectorAll('[data-related-paper]').forEach(button => button.addEventListener('click', () => renderRelatedModal(button.dataset.relatedPaper)));
  scope.querySelectorAll('[data-citations-paper]').forEach(button => button.addEventListener('click', () => renderCitationsModal(button.dataset.citationsPaper)));
  scope.querySelectorAll('.paper-more').forEach(details => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      document.querySelectorAll('.paper-more[open]').forEach(other => { if (other !== details) other.open = false; });
    });
    details.querySelector('.paper-more-menu')?.addEventListener('click', event => {
      if (event.target.closest('button, a')) details.open = false;
    });
  });
}

function paperCard(paper, index) {
  const imported = paper.importedProjectIds.includes(state.selectedProjectId);
  const busy = state.busyPaperId === paper.id;
  const canDownload = paper.canDownload !== undefined
    ? paper.canDownload
    : Boolean(paper.pdfUrl || paper.doi);
  const importLabel = busy ? '正在解析并下载…' : imported ? '已在目标项目中' : '下载并导入';
  const sourceBadge = paper.pdfUrl ? '<span class="oa-badge">OPEN PDF</span>' : '<span class="source-pending">查找开放 PDF</span>';
  // P1 增强：阅读状态 / 优先级徽标
  const statusBadge = paper.readStatus === 'reading'
    ? '<span class="paper-status reading" data-paper-status-badge>在读</span>'
    : paper.readStatus === 'read'
      ? '<span class="paper-status read" data-paper-status-badge>已读</span>'
      : '';
  const priorityBadge = paper.priority
    ? `<span class="paper-priority ${escapeAttr(paper.priority)}" data-paper-priority-badge>${escapeHtml(paper.priority.toUpperCase())}</span>`
    : '';
  // P2 增强：OpenAlex 被引次数
  const citedBadge = Number(paper.citedByCount) > 0
    ? `<span class="paper-cited" title="OpenAlex 被引次数">被引 ${Number(paper.citedByCount)}</span>`
    : '';
  // P2 增强：方法学标注徽标
  const methodBadges = (paper.methodology || []).slice(0, 4).map(tag => `<span class="paper-method" data-paper-method-badge title="方法学标注">${escapeHtml(tag)}</span>`).join('');
  const priorityLabel = { p0: 'P0', p1: 'P1', p2: 'P2', '': '优先级' };
  return `<article class="paper-card" data-paper-card data-paper-id="${escapeAttr(paper.id)}" data-topic="${escapeAttr(paper.topic)}" data-venue="${escapeAttr(paper.venue)}" data-read-status="${escapeAttr(paper.readStatus || 'unread')}" data-collection-ids="${escapeAttr((paper.collectionIds || []).join(','))}" data-methodology="${escapeAttr((paper.methodology || []).join(','))}" data-search="${escapeAttr(`${paper.title} ${paper.authors} ${paper.topic} ${paper.venue} ${paper.abstract}`.toLowerCase())}">
    <span class="paper-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="paper-body">
      <div class="paper-meta"><span>${escapeHtml(paper.venue)}</span><span>·</span><span>${escapeHtml(paper.year || '')}</span>${sourceBadge}${citedBadge}${statusBadge}${priorityBadge}${methodBadges}</div>
      <h3>${escapeHtml(paper.title)}</h3>
    </div>
    <footer class="paper-actions"><span class="paper-authors">${escapeHtml(paper.authors)} · ${escapeHtml(paper.topic)}</span><div class="paper-buttons">
      ${canDownload ? `<button class="pdf-import-button ${imported ? 'imported' : ''}" data-import-pdf="${escapeAttr(paper.id)}" ${busy || imported || !state.selectedProjectId ? 'disabled' : ''} title="自动查找开放获取版本并下载">${pdfIcon}<span data-action-label>${importLabel}</span></button>` : ''}
      <button class="chip-small" data-toggle-read="${escapeAttr(paper.id)}" data-read-status="${escapeAttr(paper.readStatus || 'unread')}" title="切换阅读状态（未读/在读/已读）">${paper.readStatus === 'read' ? '已读' : paper.readStatus === 'reading' ? '在读' : '未读'}</button>
      <button class="save-button ${paper.favorite ? 'saved' : ''}" data-favorite="${escapeAttr(paper.id)}" aria-label="${paper.favorite ? '取消收藏' : '收藏文献'}">${bookmarkIcon}</button>
      <details class="paper-more"><summary aria-label="更多文献操作">更多</summary><div class="paper-more-menu">
        <button data-priority="${escapeAttr(paper.id)}"><span>优先级</span><b>${priorityLabel[paper.priority] || priorityLabel['']}</b></button>
        <button data-methodology-edit="${escapeAttr(paper.id)}"><span>方法学标注</span><b>${paper.methodology?.length || 0}</b></button>
        <button data-related-paper="${escapeAttr(paper.id)}">查找相关文献</button>
        <button data-citations-paper="${escapeAttr(paper.id)}">查看引文网络</button>
        <button data-collections="${escapeAttr(paper.id)}">${paper.collectionIds?.length ? `管理收藏集（${paper.collectionIds.length}）` : '加入收藏集'}</button>
        <button data-export-paper="${escapeAttr(paper.id)}">导出 BibTeX</button>
        <button class="agent-handoff-small" data-agent-paper="${escapeAttr(paper.id)}">◆ 交给 Agent</button>
        ${paper.sourceUrl ? `<a href="${escapeAttr(paper.sourceUrl)}" target="_blank" rel="noopener">在官网打开</a>` : ''}
      </div></details>
    </div></footer>
  </article>`;
}

function setPaperBadge(meta, selector, className, text) {
  let badge = meta?.querySelector(selector);
  if (!text) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.setAttribute(selector.slice(1, -1), '');
    meta?.appendChild(badge);
  }
  badge.className = className;
  badge.textContent = text;
}

/** 只更新一张文献卡，避免高频状态操作重建整个页面与全部事件监听。 */
function updatePaperCard(paper) {
  const card = document.querySelector(`[data-paper-card][data-paper-id="${cssEscape(paper.id)}"]`);
  if (!card) return;
  const meta = card.querySelector('.paper-meta');
  const readStatus = paper.readStatus || 'unread';
  card.dataset.readStatus = readStatus;
  card.dataset.collectionIds = (paper.collectionIds || []).join(',');
  card.dataset.methodology = (paper.methodology || []).join(',');
  const readButton = card.querySelector('[data-toggle-read]');
  if (readButton) {
    readButton.dataset.readStatus = readStatus;
    readButton.textContent = READ_STATUS_LABEL[readStatus] || '未读';
  }
  setPaperBadge(
    meta,
    '[data-paper-status-badge]',
    `paper-status ${readStatus === 'reading' ? 'reading' : 'read'}`,
    readStatus === 'reading' ? '在读' : readStatus === 'read' ? '已读' : ''
  );
  setPaperBadge(
    meta,
    '[data-paper-priority-badge]',
    `paper-priority ${paper.priority || ''}`,
    paper.priority ? paper.priority.toUpperCase() : ''
  );
  meta?.querySelectorAll('[data-paper-method-badge]').forEach(node => node.remove());
  for (const tag of (paper.methodology || []).slice(0, 4)) {
    const badge = document.createElement('span');
    badge.className = 'paper-method';
    badge.dataset.paperMethodBadge = '';
    badge.title = '方法学标注';
    badge.textContent = tag;
    meta?.appendChild(badge);
  }
  const priorityValue = card.querySelector('[data-priority] b');
  if (priorityValue) priorityValue.textContent = paper.priority ? paper.priority.toUpperCase() : '优先级';
  const methodValue = card.querySelector('[data-methodology-edit] b');
  if (methodValue) methodValue.textContent = String(paper.methodology?.length || 0);
  const collectionButton = card.querySelector('[data-collections]');
  if (collectionButton) collectionButton.textContent = paper.collectionIds?.length ? `管理收藏集（${paper.collectionIds.length}）` : '加入收藏集';
  const favoriteButton = card.querySelector('[data-favorite]');
  favoriteButton?.classList.toggle('saved', Boolean(paper.favorite));
  favoriteButton?.setAttribute('aria-label', paper.favorite ? '取消收藏' : '收藏文献');
  const importButton = card.querySelector('[data-import-pdf]');
  const imported = (paper.importedProjectIds || []).includes(state.selectedProjectId);
  if (importButton) {
    importButton.classList.toggle('imported', imported);
    importButton.disabled = imported || !state.selectedProjectId;
    const label = importButton.querySelector('[data-action-label]');
    if (label && !importButton.classList.contains('action-busy')) label.textContent = imported ? '已在目标项目中' : '下载并导入';
  }
  const filteredViewActive = Boolean(
    state.query || state.activeCustomTag || state.activeTopic !== '全部' || state.activeVenue !== '全部'
    || state.activeReadStatus !== '全部' || state.activeCollection !== '全部' || state.activeMethodology !== '全部'
  );
  if (filteredViewActive) applyPaperFilters({ reset: false });
  else syncPaperCountAndPager();
}

function applyPaperFilters({ reset = true } = {}) {
  if (reset) state.paperRenderLimit = PAPER_RENDER_BATCH;
  if (state.paperServerPaged) schedulePaperPageReload();
  else renderPaperGrid();
}

function renderCustomTagModal() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Custom topic</span>
    <h2>自定义主题</h2>
    <p class="modal-copy">添加自定义筛选标签（最多 12 个），之后可在文献中心一键过滤：按标签关键词匹配标题、作者、主题、期刊与摘要。已添加：${state.customTags.map(escapeHtml).join('、') || '无'}。</p>
    <form id="custom-tag-form" class="settings-form">
      <label>标签名称<input name="tag" maxlength="20" placeholder="例如：积极心理学 / 拖延 / 元分析" autocomplete="off" required></label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">添加</button></div>
    </form>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('#custom-tag-form').addEventListener('submit', event => {
    event.preventDefault();
    const tag = new FormData(event.currentTarget).get('tag').toString().trim();
    if (!tag) return;
    if (state.customTags.includes(tag)) {
      showNotice('该自定义主题已存在。', true);
      return;
    }
    if (state.customTags.length >= 12) {
      showNotice('自定义主题最多 12 个。', true);
      return;
    }
    state.customTags.push(tag);
    localStorage.setItem('hana-research-custom-tags', JSON.stringify(state.customTags));
    closeModalLayer();
    renderLiterature(`已添加自定义主题「${tag}」，点击标签即可按关键词筛选。`);
  });
}

// ── P1 增强：标签管理（笔记标签改名/合并/删除/颜色） ──

const TAG_COLORS = ['#8bb8e8', '#f0c94f', '#e88b8b', '#8be0b8', '#c98be8', '#e8a08b', '#8be0e0', '#b8b8b8'];

function loadTagColors() {
  try {
    return JSON.parse(localStorage.getItem('hana-research-tag-colors') || '{}');
  } catch {
    return {};
  }
}

function saveTagColors(colors) {
  localStorage.setItem('hana-research-tag-colors', JSON.stringify(colors));
}

async function renderTagManagerModal() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Tag manager</span>
    <h2>标签管理</h2>
    <p class="modal-copy">管理项目笔记的标签：改名（同名自动合并）、删除（从全部笔记移除）、设置颜色。颜色保存在本地并应用于摘录高亮。</p>
    <div id="tag-manager-list" class="tag-manager-list"><p class="search-hint">正在读取标签…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  try {
    const data = await api('/notes/tags');
    const colors = loadTagColors();
    const list = layer.querySelector('#tag-manager-list');
    if (!data.tags.length) {
      list.innerHTML = '<p class="search-hint">还没有笔记标签。在阅读 PDF 时选中文字并保存摘录即可创建标签。</p>';
      return;
    }
    list.innerHTML = data.tags.map(item => `
      <div class="tag-manager-row" data-tag="${escapeAttr(item.tag)}">
        <span class="tag-swatch" style="background:${escapeAttr(colors[item.tag] || TAG_COLORS[0])}" data-tag-swatch="${escapeAttr(item.tag)}" title="点击选择颜色"></span>
        <span class="tag-manager-name">${escapeHtml(item.tag)}</span>
        <span class="tag-manager-count">${item.count} 条</span>
        <input class="tag-rename-input" data-rename-input="${escapeAttr(item.tag)}" placeholder="新名称（改名=合并）" maxlength="30">
        <button class="button chip-button" data-tag-rename="${escapeAttr(item.tag)}">改名</button>
        <button class="button chip-button danger" data-tag-remove="${escapeAttr(item.tag)}">删除</button>
      </div>`).join('');
    // 改名
    list.querySelectorAll('[data-tag-rename]').forEach(button => {
      button.addEventListener('click', async () => {
        const oldTag = button.dataset.tagRename;
        const input = list.querySelector(`[data-rename-input="${cssEscape(oldTag)}"]`);
        const newTag = (input?.value || '').trim();
        if (!newTag) { showNotice('请输入新标签名', true); return; }
        try {
          const result = await api('/notes/tags/rename', { method: 'POST', body: JSON.stringify({ oldTag, newTag }) });
          const colors = loadTagColors();
          if (colors[oldTag] && !colors[newTag]) { colors[newTag] = colors[oldTag]; delete colors[oldTag]; saveTagColors(colors); }
          closeModalLayer();
          showNotice(`已将「${oldTag}」改名为「${newTag}」，影响 ${result.affected} 条笔记。`);
        } catch (error) {
          showNotice(error.message, true);
        }
      });
    });
    // 删除
    list.querySelectorAll('[data-tag-remove]').forEach(button => {
      button.addEventListener('click', async () => {
        const tag = button.dataset.tagRemove;
        if (!(await confirmDialog({ title: '删除标签', message: `确定从全部笔记中删除标签「${tag}」？此操作不可恢复。`, confirmLabel: '删除标签', danger: true }))) return;
        try {
          const result = await api('/notes/tags/remove', { method: 'POST', body: JSON.stringify({ tag }) });
          const colors = loadTagColors();
          delete colors[tag];
          saveTagColors(colors);
          closeModalLayer();
          showNotice(`已删除标签「${tag}」，影响 ${result.affected} 条笔记。`);
        } catch (error) {
          showNotice(error.message, true);
        }
      });
    });
    // 颜色
    list.querySelectorAll('[data-tag-swatch]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const tag = swatch.dataset.tagSwatch;
        const picker = document.createElement('div');
        picker.className = 'tag-color-picker';
        picker.innerHTML = TAG_COLORS.map(color => `<button type="button" class="tag-color-chip" data-color="${color}" style="background:${color}" aria-label="选择颜色"></button>`).join('');
        swatch.replaceWith(picker);
        picker.querySelectorAll('[data-color]').forEach(chip => {
          chip.addEventListener('click', () => {
            const colors = loadTagColors();
            colors[tag] = chip.dataset.color;
            saveTagColors(colors);
            closeModalLayer();
            showNotice(`已为标签「${tag}」设置颜色。`);
          });
        });
      });
    });
  } catch (error) {
    layer.querySelector('#tag-manager-list').innerHTML = `<p class="search-hint">读取标签失败：${escapeHtml(error.message)}</p>`;
  }
}

function duplicatePaperStrength(paper) {
  const stats = paper?.mergeStats || {};
  return Number(stats.attachments || 0) * 8 + Number(stats.noteDocuments || 0) * 6
    + Number(stats.sentenceNotes || 0) * 3 + Number(stats.notes || 0) * 2
    + Number(stats.codingValues || 0) * 2 + Number(stats.projects || 0)
    + (paper?.favorite ? 1 : 0) + (paper?.abstract ? 0.5 : 0);
}

function duplicateStatsHtml(paper) {
  const stats = paper?.mergeStats || {};
  const items = [
    ['项目', stats.projects], ['PDF', stats.attachments], ['笔记', Number(stats.notes || 0) + Number(stats.sentenceNotes || 0)],
    ['汇总', stats.noteDocuments], ['编码', stats.codingValues], ['关系', stats.relations],
  ].filter(([, value]) => Number(value) > 0);
  return items.length
    ? `<div class="duplicate-assets">${items.map(([label, value]) => `<span><b>${Number(value)}</b>${label}</span>`).join('')}</div>`
    : '<div class="duplicate-assets empty"><span>仅题录信息</span></div>';
}

function duplicatePaperChoiceHtml(paper, side, pairKey, preferred) {
  return `<label class="duplicate-paper-choice ${preferred ? 'preferred' : ''}">
    <input type="radio" name="keep-${escapeAttr(pairKey)}" value="${escapeAttr(paper.id)}" ${preferred ? 'checked' : ''}>
    <span class="duplicate-keep-mark">${preferred ? '建议保留' : '保留此条'}</span>
    <small>${side === 'left' ? '记录 A' : '记录 B'} · ${escapeHtml(paper.venue || '期刊未记录')}${paper.year ? ` · ${escapeHtml(paper.year)}` : ''}</small>
    <strong>${escapeHtml(paper.title)}</strong>
    <p>${escapeHtml(paper.authors || '作者未记录')}</p>
    <code>${paper.doi ? `DOI ${escapeHtml(paper.doi)}` : escapeHtml(paper.id)}</code>
    ${duplicateStatsHtml(paper)}
  </label>`;
}

function duplicateCandidateHtml(candidate) {
  const keepLeft = duplicatePaperStrength(candidate.left) >= duplicatePaperStrength(candidate.right);
  const confidence = candidate.confidence === 'exact' ? '精确匹配' : candidate.confidence === 'high' ? '高度疑似' : '需要核对';
  return `<article class="duplicate-candidate" data-duplicate-pair="${escapeAttr(candidate.pairKey)}">
    <header><div><span class="duplicate-confidence ${escapeAttr(candidate.confidence)}">${confidence}</span><b>${Math.round(candidate.score * 100)}%</b></div><p>${candidate.reasons.map(escapeHtml).join(' · ')}</p></header>
    <div class="duplicate-compare">
      ${duplicatePaperChoiceHtml(candidate.left, 'left', candidate.pairKey, keepLeft)}
      <span class="duplicate-versus">VS</span>
      ${duplicatePaperChoiceHtml(candidate.right, 'right', candidate.pairKey, !keepLeft)}
    </div>
    <footer><span>合并会迁移项目、PDF、笔记、筛选、编码和关系；有内容冲突时系统会拒绝操作。</span><div><button type="button" class="button quiet-button" data-duplicate-ignore>不是重复</button><button type="button" class="button primary" data-duplicate-merge>合并所选记录</button></div></footer>
  </article>`;
}

async function renderDuplicateReviewModal() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel duplicate-review-modal" role="dialog" aria-modal="true" aria-label="重复文献检查">
    <div class="duplicate-review-head"><div><span class="composer-kicker">Library integrity</span><h2>重复文献检查</h2><p class="modal-copy">先看系统依据，再决定保留哪一条。系统不会自动合并；存在 DOI、笔记或研究数据冲突时会直接阻止。</p></div><button type="button" class="modal-icon-close" data-modal-cancel aria-label="关闭">×</button></div>
    <div class="duplicate-review-summary" data-duplicate-summary><span class="duplicate-scan-pulse"></span>正在扫描本地文献库…</div>
    <div class="duplicate-undo" data-duplicate-undo hidden></div>
    <div class="duplicate-review-list" data-duplicate-list></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelectorAll('[data-modal-cancel]').forEach(button => button.addEventListener('click', closeModalLayer));
  const summary = layer.querySelector('[data-duplicate-summary]');
  const list = layer.querySelector('[data-duplicate-list]');
  const undo = layer.querySelector('[data-duplicate-undo]');

  const load = async () => {
    const data = await api('/papers/duplicates?limit=100');
    summary.innerHTML = `<strong>${data.total}</strong> 组待核对候选 <span>· 已扫描 ${data.scanned} 篇文献 · ${data.ignoredCount} 组已标记为非重复</span>`;
    list.innerHTML = data.candidates.length
      ? data.candidates.map(duplicateCandidateHtml).join('')
      : '<div class="duplicate-clean-state"><b>✓</b><h3>当前没有待处理的重复文献</h3><p>已检查 DOI、规范化标题、作者与年份。之后导入新文献时可以随时重新扫描。</p></div>';
    bindActions(data.candidates);
  };

  const bindActions = (candidates) => {
    list.querySelectorAll('[data-duplicate-pair]').forEach(card => {
      const candidate = candidates.find(item => item.pairKey === card.dataset.duplicatePair);
      if (!candidate) return;
      card.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change', () => {
        card.querySelectorAll('.duplicate-paper-choice').forEach(choice => {
          const selected = choice.querySelector('input').checked;
          choice.classList.toggle('preferred', selected);
          choice.querySelector('.duplicate-keep-mark').textContent = selected ? '将保留' : '保留此条';
        });
      }));
      card.querySelector('[data-duplicate-ignore]')?.addEventListener('click', async event => {
        const action = await runButtonAction(event.currentTarget, { key: `duplicate-ignore:${candidate.pairKey}`, errorPrefix: '标记失败' }, () => api('/papers/duplicates/ignore', {
          method: 'POST', body: JSON.stringify({ leftPaperId: candidate.left.id, rightPaperId: candidate.right.id }),
        }));
        if (action.ok) { card.remove(); await load(); }
      });
      card.querySelector('[data-duplicate-merge]')?.addEventListener('click', async event => {
        const targetPaperId = card.querySelector('input[type="radio"]:checked')?.value;
        const sourcePaperId = targetPaperId === candidate.left.id ? candidate.right.id : candidate.left.id;
        const target = targetPaperId === candidate.left.id ? candidate.left : candidate.right;
        const source = sourcePaperId === candidate.left.id ? candidate.left : candidate.right;
        if (!(await confirmDialog({ title: '合并文献记录', message: `确认把《${source.title}》合并到《${target.title}》？系统会保留所选记录，并迁移另一条记录的关联数据。`, confirmLabel: '确认合并', danger: true }))) return;
        const action = await runButtonAction(event.currentTarget, { key: `duplicate-merge:${candidate.pairKey}`, pendingLabel: '合并中…', slowMessage: '正在迁移文献关联数据…', errorPrefix: '安全合并失败' }, () => api('/papers/duplicates/merge', {
          method: 'POST', body: JSON.stringify({ targetPaperId, sourcePaperId }),
        }));
        if (!action.ok) return;
        undo.hidden = false;
        undo.innerHTML = `<div><b>已安全合并</b><span>“${escapeHtml(source.title)}”的关联数据已迁移。撤销只在下一次数据变更前有效。</span></div><button type="button" class="button" data-merge-undo>撤销本次合并</button>`;
        undo.querySelector('[data-merge-undo]').addEventListener('click', async undoEvent => {
          const undone = await runButtonAction(undoEvent.currentTarget, { key: `duplicate-undo:${action.value.mergeId}`, pendingLabel: '撤销中…', errorPrefix: '撤销失败' }, () => api(`/papers/duplicates/merges/${encodeURIComponent(action.value.mergeId)}/undo`, { method: 'POST' }));
          if (undone.ok) { undo.hidden = true; await load(); await reloadPaperPage(); showNotice('已撤销文献合并，两个原始记录均已恢复。'); }
        });
        await load();
        await reloadPaperPage();
      });
    });
  };

  try { await load(); }
  catch (error) {
    summary.textContent = '扫描失败';
    list.innerHTML = `<p class="search-hint search-warn">${escapeHtml(error.message)}</p>`;
  }
}

function renderSearchResults() {
  if (!state.searchQuery && !state.searchResults.length) {
    return '';
  }
  if (state.searchBusy) return '<p class="search-hint">正在检索全网学术资源…</p>';
  if (!state.searchResults.length) return '<p class="search-hint">没有找到匹配的文献。</p>';
  const recommended = new Set((state.searchAI?.recommendations || []).map(item => item.index));
  const aiPanel = state.searchAI
    ? `<section class="ai-summary-panel">${sparkIcon}<div class="ai-summary-body"><h3>AI 全网检索解读</h3>${state.searchAI.summary ? `<p class="ai-summary-text">${escapeHtml(state.searchAI.summary)}</p>` : ''}${state.searchAI.recommendations?.length ? `<ul class="ai-recommend-list">${state.searchAI.recommendations.map(item => `<li><b>#${item.index + 1}</b> ${escapeHtml(state.searchResults[item.index]?.title || '')} — ${escapeHtml(item.reason)}</li>`).join('')}</ul>` : ''}</div></section>`
    : '';
  const aiWarn = state.searchAIError
    ? `<p class="search-hint search-warn">AI 解读暂不可用：${escapeHtml(state.searchAIError.message)}（已展示纯多源检索结果）</p>`
    : (!state.searchAI
      ? '<p class="search-hint">提示：在「翻译设置」中配置 AI Key 后，检索结果将自动获得 AI 中文综述与重点推荐。</p>'
      : '');
  const cards = state.searchResults.map((record, index) => {
    const busy = state.busyPaperId === `search-${index}`;
    const pdf = record.pdfUrl ? '<span class="oa-badge">OPEN PDF</span>' : '<span class="source-pending">仅元数据</span>';
    const canImport = record.pdfUrl && state.selectedProjectId;
    const importLabel = busy ? '正在保存…' : '保存并导入';
    const rec = state.searchAI?.recommendations?.find(item => item.index === index);
    return `<article class="paper-card search-result-card ${recommended.has(index) ? 'ai-recommended' : ''}" data-search-result>
      <span class="paper-index">${String(index + 1).padStart(2, '0')}</span>
      ${rec ? `<span class="ai-rec-badge" title="${escapeAttr(rec.reason)}">AI 推荐</span>` : ''}
      <div class="paper-body">
        <div class="paper-meta"><span>${escapeHtml(record.sourceName)}</span><span>·</span><span>${escapeHtml(record.year || '')}</span>${pdf}</div>
        <h3>${escapeHtml(record.title)}</h3>
      </div>
      <footer class="paper-actions"><span class="paper-authors">${escapeHtml(record.authors || '作者未记录')}${record.doi ? ` · DOI ${escapeHtml(record.doi)}` : ''}</span><div class="paper-buttons">
        ${canImport ? `<button class="pdf-import-button" data-search-save="${index}" data-search-action="import" ${busy ? 'disabled' : ''}>${pdfIcon}<span>${importLabel}</span></button>` : ''}
        <button class="save-button" data-search-save="${index}" data-search-action="favorite" aria-label="收藏检索结果" ${busy ? 'disabled' : ''}>${bookmarkIcon}</button>
      </div></footer>
    </article>`;
  }).join('');
  const failedNote = state.searchFailed?.length
    ? `<p class="search-hint search-warn">部分检索源不可用：${state.searchFailed.map(item => `${escapeHtml(item.source)}（${escapeHtml(item.message)}）`).join('；')}</p>`
    : '';
  return `<div class="search-results-list">${aiPanel}${aiWarn}${cards}${failedNote}</div>`;
}

async function runSearch() {
  const input = document.querySelector('#live-search');
  const query = input?.value?.trim() || '';
  if (!query) {
    showNotice('请输入检索关键词。', true);
    return;
  }
  state.searchQuery = query;
  state.searchBusy = true;
  state.searchResults = [];
  state.searchFailed = [];
  state.searchAI = null;
  state.searchAIError = null;
  renderLiterature('正在从全网学术资源（OpenAlex / Crossref / arXiv / PubMed）检索…');
  try {
    const data = await api(`/search/web?q=${encodeURIComponent(query)}&perSource=8`);
    state.searchResults = data.results || [];
    state.searchFailed = data.failed || [];
    state.searchAI = data.ai || null;
    state.searchAIError = data.aiError || null;
    state.searchBusy = false;
    renderLiterature(data.total ? `检索到 ${data.total} 条全网文献（已按 DOI/标题去重）${data.ai ? '，AI 解读已完成。' : '。'}` : '没有找到匹配的文献。');
  } catch (error) {
    state.searchBusy = false;
    state.searchResults = [];
    state.searchAI = null;
    state.searchAIError = null;
    renderLiterature(error.message);
  }
}

// P2 增强：保存当前检索（名称 + 新结果提醒开关）
function renderSaveSearchModal() {
  const query = document.querySelector('#live-search')?.value?.trim() || state.searchQuery;
  if (!query) {
    showNotice('请先输入检索关键词，再保存检索。', true);
    return;
  }
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Saved search</span>
    <h2>保存检索</h2>
    <p class="modal-copy">保存后可在「保存的检索」中一键重跑，并开启「新结果提醒」——重跑时会高亮上次运行之后出现的新文献。</p>
    <form id="save-search-form" class="settings-form">
      <label>检索词<input name="query" value="${escapeAttr(query)}" readonly></label>
      <label>名称<input name="name" maxlength="60" placeholder="例如：青少年情绪调节 2026 追踪" autocomplete="off" required></label>
      <label class="check-row"><input type="checkbox" name="alert"> 开启新结果提醒（重跑时标记新增文献）</label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存</button></div>
    </form>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('#save-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: `search-create:${formData.get('query')}`,
      errorPrefix: '检索保存失败',
    }, () => api('/searches', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          query: formData.get('query'),
          sources: ['openalex', 'crossref', 'arxiv', 'pubmed'],
          perSource: 8,
          filters: {},
          alertEnabled: formData.get('alert') === 'on',
        }),
      }));
    if (!action.ok) return;
    state.savedSearches.unshift(action.value.search);
    closeModalLayer();
    showNotice(`已保存检索「${action.value.search.name}」。`);
  });
}

// P2 增强：保存的检索列表（一键重跑 / 提醒开关 / 删除）
async function renderSavedSearchesModal() {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Saved searches</span>
    <h2>保存的检索</h2>
    <div id="saved-search-list" class="journal-brief-body"><p class="search-hint">正在读取…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  try {
    const data = await api('/searches');
    state.savedSearches = data.searches || [];
    const list = layer.querySelector('#saved-search-list');
    if (!state.savedSearches.length) {
      list.innerHTML = '<p class="search-hint">还没有保存的检索。在文献中心输入关键词后点击「保存检索」即可。</p>';
      return;
    }
    list.innerHTML = `<div class="saved-search-list">${state.savedSearches.map(search => `
      <article class="saved-search-item" data-saved-search="${escapeAttr(search.id)}">
        <div class="saved-search-main"><strong>${escapeHtml(search.name)}</strong><span>${escapeHtml(search.query)}${search.lastRunAt ? ` · 上次运行 ${escapeHtml(String(search.lastRunAt).slice(0, 16).replace('T', ' '))} · 命中 ${search.lastResultCount} 条` : ' · 尚未运行'}</span></div>
        <div class="saved-search-actions">
          <button type="button" class="button" data-search-rerun="${escapeAttr(search.id)}">重跑</button>
          <label class="check-row" title="开启后重跑会高亮新增文献"><input type="checkbox" data-search-alert="${escapeAttr(search.id)}" ${search.alertEnabled ? 'checked' : ''}> 提醒</label>
          <button type="button" class="button danger-text" data-search-delete="${escapeAttr(search.id)}">删除</button>
        </div>
      </article>`).join('')}</div>`;
    list.querySelectorAll('[data-search-rerun]').forEach(button => {
      button.addEventListener('click', () => {
        closeModalLayer();
        runSavedSearch(button.dataset.searchRerun);
      });
    });
    list.querySelectorAll('[data-search-alert]').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        try {
          const result = await api(`/searches/${encodeURIComponent(toggle.dataset.searchAlert)}`, {
            method: 'PATCH',
            body: JSON.stringify({ alertEnabled: toggle.checked }),
          });
          const index = state.savedSearches.findIndex(item => item.id === toggle.dataset.searchAlert);
          if (index >= 0) state.savedSearches[index] = result.search;
          showNotice(result.search.alertEnabled ? '已开启新结果提醒。' : '已关闭新结果提醒。');
        } catch (error) {
          showNotice(error.message, true);
        }
      });
    });
    list.querySelectorAll('[data-search-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await api(`/searches/${encodeURIComponent(button.dataset.searchDelete)}`, { method: 'DELETE' });
          state.savedSearches = state.savedSearches.filter(item => item.id !== button.dataset.searchDelete);
          showNotice('已删除保存的检索。');
          closeModalLayer();
          renderSavedSearchesModal();
        } catch (error) {
          showNotice(error.message, true);
        }
      });
    });
  } catch (error) {
    layer.querySelector('#saved-search-list').innerHTML = `<p class="search-hint search-warn">读取失败：${escapeHtml(error.message)}</p>`;
  }
}

// P2 增强：重跑保存的检索 → 填充检索框并展示结果（新增文献标记）
async function runSavedSearch(searchId) {
  const search = state.savedSearches.find(item => item.id === searchId);
  if (!search) return;
  state.searchQuery = search.query;
  state.searchBusy = true;
  state.searchResults = [];
  state.searchFailed = [];
  state.searchAI = null;
  state.searchAIError = null;
  state.searchNewIds = [];
  renderLiterature(`正在重跑保存的检索「${search.name}」…`);
  try {
    const data = await api(`/searches/${encodeURIComponent(searchId)}/run`, { method: 'POST' });
    state.searchResults = data.papers || [];
    state.searchFailed = [];
    state.searchAI = null;
    state.searchAIError = null;
    state.searchNewIds = data.newIds || [];
    const index = state.savedSearches.findIndex(item => item.id === searchId);
    if (index >= 0) state.savedSearches[index] = data.search;
    state.searchBusy = false;
    const newNote = data.firstRun
      ? '（首次运行，全部结果作为基线）'
      : data.newCount > 0
        ? `（相较上次新增 ${data.newCount} 条，已高亮标记）`
        : '（相较上次无新增）';
    renderLiterature(`已重跑「${search.name}」：命中 ${data.total} 条${newNote}。`);
  } catch (error) {
    state.searchBusy = false;
    state.searchResults = [];
    state.searchAI = null;
    state.searchAIError = null;
    renderLiterature(`重跑失败：${error.message}`);
  }
}

// P2 增强：方法学标注 modal（预设研究设计标签 + 自定义测量工具/样本人群）
function renderMethodologyModal(paperId) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  const current = paper.methodology || [];
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Methodology</span>
    <h2>方法学标注</h2>
    <p class="modal-copy">标注研究设计、测量工具与样本人群，用于按方法学筛选文献。点击标签切换选择，可输入自定义标签。</p>
    <div class="method-tag-grid">${METHODOLOGY_PRESETS.map(tag => `<button type="button" class="method-tag-chip ${current.includes(tag) ? 'active' : ''}" data-method-preset="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
    <form id="methodology-form" class="settings-form">
      <label>自定义标签（逗号分隔，最多 12 个）<input name="custom" value="${escapeAttr(current.filter(tag => !METHODOLOGY_PRESETS.includes(tag)).join('，'))}" maxlength="200" placeholder="例如：眼动追踪，大学生样本，SCL-90" autocomplete="off"></label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary"><span data-action-label>保存标注</span></button></div>
    </form>
  </div>`;
  document.body.append(layer);
  const selected = new Set(current);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-method-preset]').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.methodPreset;
      if (selected.has(tag)) {
        selected.delete(tag);
        chip.classList.remove('active');
      } else {
        selected.add(tag);
        chip.classList.add('active');
      }
    });
  });
  layer.querySelector('#methodology-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const custom = String(formData.get('custom') || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
    const tags = [...selected, ...custom];
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const result = await runButtonAction(submit, {
      key: `methodology:${paperId}`,
      pendingLabel: '保存中…',
      errorPrefix: '方法学标注保存失败',
    }, () => api(`/papers/${encodeURIComponent(paperId)}/methodology`, {
        method: 'PATCH',
        body: JSON.stringify({ tags }),
      }));
    if (result.ok) {
      Object.assign(paper, result.value.paper);
      updatePaperCard(paper);
      closeModalLayer();
      showNotice(`已更新「${paper.title.slice(0, 30)}」的方法学标注。`);
    }
  });
}

async function saveSearchRecord(index, action, button = null) {
  const record = state.searchResults[index];
  if (!record) return;
  const isImport = action === 'import';
  const result = await runButtonAction(button, {
    key: `search-save:${index}`,
    pendingLabel: isImport ? '保存并导入中…' : null,
    successLabel: isImport ? '已导入' : null,
    keepDisabled: true,
    slowMessage: isImport ? '正在查找并校验开放 PDF，请稍候…' : '正在保存文献…',
    errorPrefix: isImport ? '保存并导入失败' : '保存文献失败',
  }, async () => {
    const saved = await api('/search/save', {
      method: 'POST',
      body: JSON.stringify({ record: { ...record, topic: record.topic || '未分类' } }),
    });
    if (isImport) {
      await api(`/projects/${encodeURIComponent(state.selectedProjectId)}/import-pdf`, {
        method: 'POST', body: JSON.stringify({ paperId: saved.paper.id }),
      });
    } else {
      await api(`/papers/${encodeURIComponent(saved.paper.id)}/favorite`, {
        method: 'PATCH', body: JSON.stringify({ favorite: true }),
      });
    }
    const [projectData, paperData] = await Promise.all([api('/projects'), api(paperPagePath(1))]);
    state.projects = projectData.projects;
    applyPaperPageData(paperData);
    return saved.paper;
  });
  if (result.ok) {
    renderPaperGrid();
    if (!isImport) {
      button?.classList.add('saved');
      button?.setAttribute('aria-label', '已收藏');
    }
    showNotice(isImport ? '文献已保存，PDF 已导入目标项目。' : '文献已保存并收藏。');
  }
}

// P2 增强：OpenAlex 网络文献条目（相似文献 / 引文网络共用）
function networkWorkCard(record, index) {
  const pdf = record.pdfUrl ? '<span class="oa-badge">OPEN PDF</span>' : '';
  const cited = Number(record.citedByCount) > 0 ? `<span class="paper-cited" title="被引次数">被引 ${Number(record.citedByCount)}</span>` : '';
  return `<article class="paper-card network-work-card" data-network-work="${index}">
    <span class="paper-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="paper-body">
      <div class="paper-meta"><span>${escapeHtml(record.venue || '未知期刊')}</span><span>·</span><span>${escapeHtml(record.year || '')}</span>${pdf}${cited}</div>
      <h3>${escapeHtml(record.title)}</h3>
    </div>
    <footer class="paper-actions"><span class="paper-authors">${escapeHtml(record.authors || '作者未记录')}${record.doi ? ` · DOI ${escapeHtml(record.doi)}` : ''}</span><div class="paper-buttons">
      ${record.sourceUrl ? `<a class="source-link" href="${escapeAttr(record.sourceUrl)}" target="_blank" rel="noopener" title="打开来源页面">原文链接</a>` : ''}
      <button class="save-button" data-network-save="${index}" aria-label="保存到文献库">${bookmarkIcon}</button>
    </div></footer>
  </article>`;
}

// P2 增强：相似文献推荐（L11）
async function renderRelatedModal(paperId) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Related works</span>
    <h2>相似文献 · ${escapeHtml(paper.title.slice(0, 40))}</h2>
    <div id="network-body" class="journal-brief-body"><p class="search-hint">正在从 OpenAlex 查询相似文献…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  const body = layer.querySelector('#network-body');
  try {
    const data = await api(`/papers/${encodeURIComponent(paperId)}/related?max=10`);
    if (!data.works?.length) {
      body.innerHTML = '<p class="search-hint">没有找到相似文献。</p>';
      return;
    }
    body.innerHTML = `<div class="network-list">${data.works.map((record, index) => networkWorkCard(record, index)).join('')}</div>`;
    bindNetworkSave(body, data.works);
  } catch (error) {
    body.innerHTML = `<p class="search-hint search-warn">相似文献查询失败：${escapeHtml(error.message)}</p>`;
  }
}

// P2 增强：引文网络（L12 参考文献 / 被引文献）
async function renderCitationsModal(paperId) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel modal-wide" role="dialog" aria-modal="true">
    <span class="composer-kicker">Citation network</span>
    <h2>引文网络 · ${escapeHtml(paper.title.slice(0, 40))}</h2>
    <div class="network-tabs"><button type="button" class="network-tab active" data-network-tab="references">参考文献</button><button type="button" class="network-tab" data-network-tab="citedBy">被引文献</button></div>
    <div id="network-body" class="journal-brief-body"><p class="search-hint">正在从 OpenAlex 展开引文网络…</p></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  const body = layer.querySelector('#network-body');
  let data = null;
  const renderTab = (tab) => {
    if (!data) return;
    const list = tab === 'citedBy' ? data.citedBy : data.references;
    body.innerHTML = !list?.length
      ? '<p class="search-hint">（暂无记录）</p>'
      : `<div class="network-list">${list.map((record, index) => networkWorkCard(record, index)).join('')}</div>`;
    bindNetworkSave(body, list);
  };
  layer.querySelectorAll('[data-network-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-network-tab]').forEach(item => item.classList.toggle('active', item === tab));
      renderTab(tab.dataset.networkTab);
    });
  });
  try {
    data = await api(`/papers/${encodeURIComponent(paperId)}/citations?max=12`);
    renderTab('references');
  } catch (error) {
    body.innerHTML = `<p class="search-hint search-warn">引文网络查询失败：${escapeHtml(error.message)}</p>`;
  }
}

// 网络文献列表：收藏（保存到文献库）
function bindNetworkSave(container, records) {
  container.querySelectorAll('[data-network-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const record = records[Number(button.dataset.networkSave)];
      if (!record || button.classList.contains('saved')) return;
      button.classList.add('saved');
      button.setAttribute('aria-label', '已保存');
      const action = await runButtonAction(button, {
        key: `network-save:${record.id || record.doi || record.title}`,
        keepDisabled: true,
        errorPrefix: '保存失败',
      }, () => api('/search/save', {
          method: 'POST',
          body: JSON.stringify({ record: { ...record, topic: record.topic || '未分类' } }),
        }));
      if (action.ok) {
        await reloadPaperPage();
        showNotice('已保存到文献库。');
      } else {
        button.classList.remove('saved');
        button.setAttribute('aria-label', '保存到文献库');
      }
    });
  });
}

async function toggleFavorite(paperId, button = null) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  const previous = Boolean(paper.favorite);
  const next = !previous;
  paper.favorite = next;
  if (state.paperServerPaged) {
    state.paperFacets.favoriteCount = Math.max(0, Number(state.paperFacets.favoriteCount || 0) + (next ? 1 : -1));
  }
  updatePaperCard(paper);
  const result = await runButtonAction(button || document.querySelector(`[data-favorite="${cssEscape(paperId)}"]`), {
    key: `favorite:${paperId}`,
    errorPrefix: '收藏操作失败',
  }, () => api(`/papers/${encodeURIComponent(paperId)}/favorite`, {
      method: 'PATCH', body: JSON.stringify({ favorite: next }),
    }));
  if (result.ok) {
    Object.assign(paper, result.value.paper);
  } else if (!result.duplicate) {
    paper.favorite = previous;
    if (state.paperServerPaged) {
      state.paperFacets.favoriteCount = Math.max(0, Number(state.paperFacets.favoriteCount || 0) + (next ? -1 : 1));
    }
  }
  updatePaperCard(paper);
}

// ── P1 增强：阅读状态 / 优先级 / 单篇导出 ──

const READ_STATUS_CYCLE = { unread: 'reading', reading: 'read', read: 'unread' };
const READ_STATUS_LABEL = { unread: '未读', reading: '在读', read: '已读' };

async function toggleReadStatus(paperId, currentStatus, button = null) {
  const next = READ_STATUS_CYCLE[currentStatus] || 'reading';
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  const previous = paper.readStatus || 'unread';
  paper.readStatus = next;
  updatePaperCard(paper);
  const result = await runButtonAction(button || document.querySelector(`[data-toggle-read="${cssEscape(paperId)}"]`), {
    key: `read-status:${paperId}`,
    errorPrefix: '阅读状态更新失败',
  }, () => api(`/papers/${encodeURIComponent(paperId)}/status`, {
      method: 'PATCH', body: JSON.stringify({ readStatus: next }),
    }));
  if (result.ok) {
    Object.assign(paper, result.value.paper);
  } else if (!result.duplicate) {
    paper.readStatus = previous;
  }
  updatePaperCard(paper);
}

async function cyclePriority(paperId, button = null) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  const previous = paper.priority || '';
  const next = paper.priority === '' ? 'p0' : paper.priority === 'p0' ? 'p1' : paper.priority === 'p1' ? 'p2' : '';
  paper.priority = next;
  updatePaperCard(paper);
  const result = await runButtonAction(button || document.querySelector(`[data-priority="${cssEscape(paperId)}"]`), {
    key: `priority:${paperId}`,
    errorPrefix: '优先级更新失败',
  }, () => api(`/papers/${encodeURIComponent(paperId)}/status`, {
      method: 'PATCH', body: JSON.stringify({ priority: next }),
    }));
  if (result.ok) {
    Object.assign(paper, result.value.paper);
  } else if (!result.duplicate) {
    paper.priority = previous;
  }
  updatePaperCard(paper);
}

async function exportPaperCitations(paperId) {
  try {
    const response = await fetch(apiUrl('/papers/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [paperId], format: 'bibtex' }),
    });
    if (!response.ok) throw new Error((await response.json())?.message || '导出失败');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
    const fileName = match ? decodeURIComponent(match[1]) : 'paper.bib';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    showNotice(error.message, true);
  }
}

// ── P1 增强：文献集合（Collections）与收藏批量导出 ──

async function refreshCollections() {
  try {
    const data = await api('/collections');
    state.collections = data.collections || [];
  } catch {
    // 宿主尚未提供 /collections（重启前）→ 保持现状，不阻塞 UI
    state.collections = state.collections || [];
  }
  return state.collections;
}

/** 把文献加入/移出集合的 modal（多选 + 新建）。 */
async function renderCollectionModal(paperId) {
  const paper = state.papers.find(item => item.id === paperId);
  if (!paper) return;
  closeModalLayer();
  const collections = await refreshCollections();
  const current = new Set(paper.collectionIds || []);
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">Collections</span>
    <h2>文献集合</h2>
    <p class="modal-copy">把《${escapeHtml(paper.title.slice(0, 40))}…》加入命名收藏集（可多选）。</p>
    <div id="collection-check-list" class="collection-check-list">
      ${collections.length ? collections.map(collection => `<label class="collection-check"><input type="checkbox" data-collection-check="${escapeAttr(collection.id)}" ${current.has(collection.id) ? 'checked' : ''}><span>${escapeHtml(collection.title)}</span><em>${collection.paperCount} 篇</em></label>`).join('') : '<p class="search-hint">还没有收藏集。在下方新建一个。</p>'}
    </div>
    <form id="collection-create-form" class="settings-form">
      <label>新建收藏集<input name="title" maxlength="80" placeholder="例如：写综述用的 / 方法学参考" autocomplete="off"></label>
      <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存</button></div>
    </form>
  </div>`;
  document.body.append(layer);
  const save = async () => {
    try {
      const checks = [...layer.querySelectorAll('[data-collection-check]')];
      for (const check of checks) {
        const collectionId = check.dataset.collectionCheck;
        const checked = check.checked;
        const wasChecked = current.has(collectionId);
        if (checked && !wasChecked) {
          await api(`/collections/${encodeURIComponent(collectionId)}/papers`, { method: 'POST', body: JSON.stringify({ paperId }) });
        } else if (!checked && wasChecked) {
          await api(`/collections/${encodeURIComponent(collectionId)}/papers/${encodeURIComponent(paperId)}`, { method: 'DELETE' });
        }
      }
      await refreshCollections();
      await reloadPaperPage();
      const updatedPaper = state.papers.find(item => item.id === paperId);
      if (updatedPaper) updatePaperCard(updatedPaper);
      closeModalLayer();
      showNotice('文献集合已更新。');
    } catch (error) {
      showNotice(error.message, true);
    }
  };
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('#collection-create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const title = new FormData(event.currentTarget).get('title').toString().trim();
    if (!title) return;
    try {
      const result = await api('/collections', { method: 'POST', body: JSON.stringify({ title }) });
      await refreshCollections();
      const newCollection = result.collection;
      await api(`/collections/${encodeURIComponent(newCollection.id)}/papers`, { method: 'POST', body: JSON.stringify({ paperId }) });
      await reloadPaperPage();
      const updatedPaper = state.papers.find(item => item.id === paperId);
      if (updatedPaper) updatePaperCard(updatedPaper);
      closeModalLayer();
      showNotice(`已创建收藏集「${newCollection.title}」并加入该文献。`);
    } catch (error) {
      showNotice(error.message, true);
    }
  });
  // 勾选即时保存（无独立保存按钮）
  layer.querySelectorAll('[data-collection-check]').forEach(check => {
    check.addEventListener('change', () => save());
  });
}

/** 导出全部收藏（favorite=true）为 BibTeX / RIS。 */
async function exportFavorites() {
  try {
    let favorites = state.papers.filter(paper => paper.favorite).map(paper => paper.id);
    if (state.paperServerPaged && Number(state.paperFacets.favoriteCount || 0) > 0) {
      favorites = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const data = await api(`/papers?paged=1&favorite=1&pageSize=100&page=${page}`);
        favorites.push(...(data.papers || []).map(paper => paper.id));
        hasMore = Boolean(data.pagination?.hasMore);
        page += 1;
      }
    }
    if (!favorites.length) {
      showNotice('还没有收藏任何文献。点击卡片上的书签图标收藏后即可导出。', true);
      return;
    }
    const format = await choiceDialog({
      title: '选择导出格式',
      message: `共 ${favorites.length} 篇收藏文献，请选择引文导出格式。`,
      choices: [
        { label: 'BibTeX（.bib）', value: 'bibtex' },
        { label: 'RIS（.ris）', value: 'ris' },
      ],
      cancelLabel: '取消导出',
    });
    if (!format) return;
    const response = await fetch(apiUrl('/papers/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: favorites, format }),
    });
    if (!response.ok) throw new Error((await response.json())?.message || '导出失败');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
    const fileName = match ? decodeURIComponent(match[1]) : `favorites.${format === 'ris' ? 'ris' : 'bib'}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    showNotice(`已导出 ${favorites.length} 篇收藏文献（${format === 'ris' ? 'RIS' : 'BibTeX'}）。`);
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function importPdf(paperId, button = null) {
  if (!state.selectedProjectId) return;
  const targetProjectId = state.selectedProjectId;
  const result = await runButtonAction(button || document.querySelector(`[data-import-pdf="${cssEscape(paperId)}"]`), {
    key: 'import-pdf',
    pendingLabel: '下载并校验中…',
    successLabel: '已导入目标项目',
    keepDisabled: true,
    slowMessage: '正在查找并校验开放 PDF，请稍候…',
    errorPrefix: 'PDF 导入失败',
  }, async () => {
    const result = await api(`/projects/${encodeURIComponent(targetProjectId)}/import-pdf`, {
      method: 'POST', body: JSON.stringify({ paperId }),
    });
    const [projectData, paperData] = await Promise.all([api('/projects'), api(paperPagePath(1))]);
    state.projects = projectData.projects;
    applyPaperPageData(paperData);
    return result;
  });
  if (result.ok) {
    const paper = state.papers.find(item => item.id === paperId);
    if (paper) updatePaperCard(paper);
    const importButton = document.querySelector(`[data-import-pdf="${cssEscape(paperId)}"]`);
    importButton?.classList.add('imported');
    const project = state.projects.find(item => item.id === targetProjectId);
    showNotice(`${result.value.reused ? '已复用本地 PDF 并关联到' : 'PDF 已下载、校验并导入'}“${project?.title || '目标项目'}”。`);
  }
}

async function loadProjects() {
  renderLoading('正在打开项目数据库…');
  try {
    const data = await api('/projects');
    clearLoadingSlowTimer();
    state.projects = data.projects;
    ensureSelectedProject();
    renderProjects();
  } catch (error) {
    clearLoadingSlowTimer();
    renderFailure(error, loadProjects);
  }
}

function renderProjects(message = '') {
  const cards = state.projects.length
    ? state.projects.map((project, index) => projectCard(project, index)).join('')
    : `<div class="state-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><h3>还没有研究项目</h3><p>新建一个项目，从文献中心导入 PDF 或直接上传本地文件，开始积累证据与笔记。</p><button class="button primary state-action" id="empty-create-2">＋ 新建项目</button></div>`;
  root.innerHTML = shell('项目库', '每个研究问题，都有自己的证据空间。', '直接上传 PDF，或接收文献中心下载的开放文献；在项目中阅读、勾画并持续积累逐页笔记。', `
    <section class="native-list-view" id="project-list-view">
      <div class="toolbar"><label class="search-field">${searchIcon}<input id="project-search" placeholder="检索项目或研究问题"></label></div>
      <div class="notice ${message ? 'visible' : ''}" id="notice" role="status" aria-live="polite">${escapeHtml(message)}</div>
      <div class="section-heading"><h2>研究项目</h2><span>${state.projects.length} 个项目 · 本地存储</span></div>
      <section class="project-grid" id="project-grid">${cards}<button class="project-card empty-project" id="empty-create"><span><b>建立新的研究空间</b><br>文献、PDF 与笔记将在这里汇合</span></button></section>
    </section>
    ${projectComposer()}
    <section class="project-detail-view" id="project-drawer" hidden><div class="drawer-panel" id="drawer-panel"></div></section>
  `, `
    <button class="button primary" id="create-project">＋ 新建项目</button>
  `);
  document.querySelector('#project-search').addEventListener('input', event => {
    const value = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-project-id]').forEach(card => card.hidden = value && !card.dataset.project.includes(value));
  });
  document.querySelector('#agent-projects')?.addEventListener('click', () => {
    handoffToAgent(`请调用 hana_research_list_research_projects 查看我的真实项目库，再用 hana_research_get_research_context 概括最近研究活动。请指出最值得继续推进的项目及理由，并列出 2–3 个可执行的下一步。${agentWritePolicyInstruction()}`.replace(/\s+/g, ' ').trim(), '项目库已交给 Agent');
  });
  const composer = document.querySelector('#project-composer');
  const titleInput = document.querySelector('#project-title');
  const openComposer = () => { composer.hidden = false; window.requestAnimationFrame(() => titleInput.focus()); };
  const closeComposer = () => { closeProjectComposer(); titleInput.value = ''; };
  document.querySelector('#create-project').addEventListener('click', openComposer);
  document.querySelector('#empty-create').addEventListener('click', openComposer);
  document.querySelector('#cancel-project').addEventListener('click', closeComposer);
  composer.addEventListener('click', event => { if (event.target === composer) closeComposer(); });
  document.querySelector('#project-form').addEventListener('submit', async event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: 'project-create',
      slowMessage: '正在建立研究空间…',
      errorPrefix: '项目创建失败',
    }, async () => {
      const result = await api('/projects', { method: 'POST', body: JSON.stringify({ title }) });
      state.projects = (await api('/projects')).projects;
      return result;
    });
    if (!action.ok) return;
    state.selectedProjectId = action.value.project.id;
    localStorage.setItem('hana-research-target-project', action.value.project.id);
    renderProjects(`已创建“${title}”，现在可以从文献中心一键导入 PDF。`);
  });
  document.querySelectorAll('[data-project-id]').forEach(card => {
    const open = () => openProjectDrawer(card.dataset.projectId);
    card.addEventListener('click', open);
    // 键盘支持：Enter / Space 打开
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
  document.querySelector('#empty-create-2')?.addEventListener('click', openComposer);
  // v13：从阅读器返回 → 自动重开原项目抽屉（恢复项目详情/文献列表）
  let openedFromReturn = false;
  try {
    const returnProjectId = sessionStorage.getItem('hana-return-project');
    if (returnProjectId) {
      sessionStorage.removeItem('hana-return-project');
      openedFromReturn = true;
      const target = state.projects.find(project => project.id === returnProjectId);
      if (target) {
        window.setTimeout(() => { openProjectDrawer(returnProjectId); }, 80);
      }
    }
  } catch { /* ignore */ }
  // P6：设置「打开项目库时自动展开默认项目」——无返回焦点时展开默认项目
  if (!openedFromReturn) {
    try {
      const settings = loadHanaSettings();
      if (settings.openDefaultProject && settings.defaultProjectId
        && state.projects.some(project => project.id === settings.defaultProjectId)) {
        window.setTimeout(() => { openProjectDrawer(settings.defaultProjectId); }, 140);
      }
    } catch { /* ignore */ }
  }
}

function formatProjectTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays <= 0) return '最近更新';
  if (diffDays < 7) return `${diffDays} 天前更新`;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function projectCard(project, index) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(project.color) ? project.color : '#806b8e';
  const updated = formatProjectTime(project.updatedAt);
  return `<article class="project-card" data-project-id="${escapeAttr(project.id)}" data-project="${escapeAttr(`${project.title} ${project.description}`.toLowerCase())}" tabindex="0" role="button" aria-label="打开项目「${escapeAttr(project.title)}」">
    <div class="project-mark" style="--project-color:${safeColor}"></div>
    <h3>${escapeHtml(project.title)}</h3>
    <p>${escapeHtml(project.description)}</p>
    <div class="project-stats"><span><strong>${project.paperCount}</strong> 篇文献</span><span><strong>${project.pdfCount}</strong> 份 PDF</span>${updated ? `<span class="project-meta-time">${escapeHtml(updated)}</span>` : `<span>${String(index + 1).padStart(2, '0')}</span>`}</div><span class="project-open-hint" aria-hidden="true">打开项目 →</span>
  </article>`;
}

function projectComposer() {
  return `<div class="project-composer" id="project-composer" hidden><form class="composer-panel" id="project-form"><span class="composer-kicker">New research space</span><h2>新建研究项目</h2><p>项目将保存在本地研究数据库中，并可直接接收文献 PDF。</p><label>项目名称<input id="project-title" maxlength="80" placeholder="例如：青少年情绪调节机制" autocomplete="off" required></label><div class="composer-actions"><button type="button" class="button" id="cancel-project">取消</button><button type="submit" class="button primary">创建项目</button></div></form></div>`;
}

let drawerOpeningLock = false;
let projectListScrollY = 0;

function projectTasksFromNotes(notes = []) {
  return notes.filter(note => Array.isArray(note.tags) && note.tags.includes('研究任务')).map(note => {
    const tags = note.tags || [];
    const tagValue = prefix => tags.find(tag => tag.startsWith(prefix))?.slice(prefix.length) || '';
    return {
      ...note,
      status: tags.includes('状态:完成') ? 'done' : 'todo',
      priority: tagValue('优先级:') || '普通',
      due: tagValue('截止:'),
    };
  });
}

function taskRowHtml(task) {
  return `<article class="project-task ${task.status}" data-task-id="${escapeAttr(task.id)}" data-task-status="${escapeAttr(task.status)}">
    <button class="task-check ${task.status === 'done' ? 'checked' : ''}" type="button" data-task-toggle="${escapeAttr(task.id)}" aria-label="${task.status === 'done' ? '重开任务' : '完成任务'}">${task.status === 'done' ? '✓' : ''}</button>
    <div class="task-copy"><p>${escapeHtml(task.content)}</p><div class="task-meta"><span class="task-priority ${escapeAttr(task.priority)}">${escapeHtml(task.priority)}</span>${task.due ? `<span>截止 ${escapeHtml(task.due)}</span>` : ''}${task.paperTitle ? `<span>· ${escapeHtml(task.paperTitle)}</span>` : ''}</div></div>
  </article>`;
}

function renderProjectTaskPanel(projectId, projectTitle, notes, papers) {
  const tasks = projectTasksFromNotes(notes);
  const todo = tasks.filter(task => task.status === 'todo');
  const done = tasks.filter(task => task.status === 'done');
  const taskRows = tasks.length ? tasks.map(taskRowHtml).join('') : '<p class="drawer-empty-hint task-empty">还没有待办。把下一步研究动作写下来，Agent 也会在同一份任务清单上协作。</p>';
  return `<section class="project-tasks-section" id="project-tasks-section">
    <div class="task-section-head"><h3>研究任务 <span>${todo.length} 待推进${done.length ? ` · ${done.length} 已完成` : ''}</span></h3></div>
    <div class="task-filter-row" role="group" aria-label="任务筛选"><button class="chip active" type="button" data-task-filter="todo">待推进 ${todo.length}</button><button class="chip" type="button" data-task-filter="all">全部 ${tasks.length}</button><button class="chip" type="button" data-task-filter="done">已完成 ${done.length}</button></div>
    <div class="project-task-list">${taskRows}</div>
    <form class="task-quick-form" id="task-quick-form"><label class="sr-only" for="task-content">新增研究任务</label><input id="task-content" maxlength="500" placeholder="下一步要推进什么？例如：核对 3 篇核心文献的样本量" required><div class="task-quick-row"><select id="task-priority" aria-label="优先级"><option value="高">高优先级</option><option value="普通" selected>普通</option><option value="低">低优先级</option></select><input id="task-due" type="date" aria-label="截止日期"><select id="task-paper" aria-label="关联文献"><option value="">关联文献（可选）</option>${papers.map(paper => `<option value="${escapeAttr(paper.id)}">${escapeHtml(paper.title.slice(0, 32))}</option>`).join('')}</select><button class="button primary" type="submit">添加任务</button></div></form>
  </section>`;
}

function bindProjectTaskPanel(panel, projectId, projectTitle, notes) {
  const taskById = new Map(projectTasksFromNotes(notes).map(task => [task.id, task]));
  const refreshTaskSummary = () => {
    const tasks = [...taskById.values()];
    const todo = tasks.filter(task => task.status === 'todo').length;
    const done = tasks.length - todo;
    const heading = panel.querySelector('.task-section-head h3 span');
    if (heading) heading.textContent = `${todo} 待推进${done ? ` · ${done} 已完成` : ''}`;
    const labels = { todo: `待推进 ${todo}`, all: `全部 ${tasks.length}`, done: `已完成 ${done}` };
    panel.querySelectorAll('[data-task-filter]').forEach(button => { button.textContent = labels[button.dataset.taskFilter]; });
    const activeFilter = panel.querySelector('[data-task-filter].active')?.dataset.taskFilter || 'todo';
    panel.querySelectorAll('[data-task-status]').forEach(item => { item.hidden = activeFilter !== 'all' && item.dataset.taskStatus !== activeFilter; });
    const tabCount = panel.querySelector('[data-drawer-tab="tasks"] .tab-count');
    if (tabCount) { tabCount.textContent = String(todo || tasks.length); tabCount.classList.toggle('attn', todo > 0); }
  };
  const bindTaskToggle = button => button.addEventListener('click', async () => {
    const task = taskById.get(button.dataset.taskToggle);
    if (!task) return;
    const done = task.status !== 'done';
    const tags = (task.tags || []).filter(tag => tag !== '状态:待办' && tag !== '状态:完成');
    tags.push(done ? '状态:完成' : '状态:待办');
    const action = await runButtonAction(button, {
      key: `task-toggle:${task.id}`,
      slowMessage: '正在更新任务状态…',
      errorPrefix: '任务更新失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/notes/${encodeURIComponent(task.id)}`, {
      method: 'PATCH', body: JSON.stringify({ content: task.content, quote: task.quote, tags, pageNumber: task.pageNumber }),
    }));
    if (!action.ok) return;
    const updated = { ...task, ...(action.value.note || {}), tags, status: done ? 'done' : 'todo' };
    taskById.set(task.id, updated);
    const row = button.closest('[data-task-id]');
    if (row) {
      row.classList.toggle('done', done);
      row.classList.toggle('todo', !done);
      row.dataset.taskStatus = updated.status;
      button.classList.toggle('checked', done);
      button.textContent = done ? '✓' : '';
      button.setAttribute('aria-label', done ? '重开任务' : '完成任务');
    }
    refreshTaskSummary();
    showNotice(done ? '任务已完成。' : '任务已重新打开。');
  });
  panel.querySelector('[data-task-agent]')?.addEventListener('click', () => {
    handoffToAgent(`请先调用 hana_research_list_project_tasks，projectId 为 ${projectId}，查看“${projectTitle}”的待推进任务；再调用 hana_research_get_project_brief。请按证据缺口和截止时间排序，给出一个今天可执行的研究计划。${agentWritePolicyInstruction()}`.replace(/\s+/g, ' ').trim(), '项目任务已交给 Agent');
  });
  panel.querySelectorAll('[data-task-filter]').forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.taskFilter;
    panel.querySelectorAll('[data-task-filter]').forEach(item => item.classList.toggle('active', item === button));
    panel.querySelectorAll('[data-task-status]').forEach(item => { item.hidden = filter !== 'all' && item.dataset.taskStatus !== filter; });
  }));
  panel.querySelector('#task-quick-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const taskForm = event.currentTarget;
    const content = panel.querySelector('#task-content').value.trim();
    if (!content) return;
    const priority = panel.querySelector('#task-priority').value;
    const due = panel.querySelector('#task-due').value;
    const paperId = panel.querySelector('#task-paper').value || null;
    const tags = ['研究任务', '状态:待办', `优先级:${priority}`];
    if (due) tags.push(`截止:${due}`);
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: `task-create:${projectId}`,
      slowMessage: '正在添加研究任务…',
      errorPrefix: '任务添加失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/notes`, { method: 'POST', body: JSON.stringify({ content, tags, paperId }) }));
    if (!action.ok) return;
    const task = projectTasksFromNotes([action.value.note])[0];
    if (task) {
      taskById.set(task.id, task);
      const list = panel.querySelector('.project-task-list');
      list.querySelector('.task-empty')?.remove();
      list.insertAdjacentHTML('afterbegin', taskRowHtml(task));
      bindTaskToggle(list.querySelector(`[data-task-toggle="${cssEscape(task.id)}"]`));
      taskForm.reset();
      panel.querySelector('#task-priority').value = '普通';
      refreshTaskSummary();
    }
    showNotice('研究任务已添加，Agent 也能立即看到它。');
  });
  panel.querySelectorAll('[data-task-toggle]').forEach(bindTaskToggle);
}

// ── P6 研究驾驶舱：页签 / 下一步 / 副驾驶 / 研究闭环（真实数据，不伪造进度） ──

function snippet(text, max = 24) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  return value.length > max ? value.slice(0, max) + '…' : value;
}

function taskMeta(task, prefix) {
  return (task.tags || []).find(tag => tag.startsWith(prefix))?.slice(prefix.length) || '';
}

/** 读取/尝试宿主 cockpit-stats；旧宿主（未重启）时前端兜底计算并保持可用。 */
async function loadCockpitData(projectId, papers, notes, relations, docs) {
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/cockpit-stats`);
    if (data && data.papers) return { ...data, source: 'host', complete: true };
  } catch { /* fall through → client fallback */ }
  const fallback = fallbackCockpitStats({ papers, notes, relations, docs });
  try {
    fallback.reading = await loadFallbackReading(papers);
  } catch { /* 阅读位置读取失败不阻塞 */ }
  return fallback;
}

function fallbackCockpitStats({ papers = [], notes = [], relations = [], docs = [] }) {
  const tasks = notes.filter(n => Array.isArray(n.tags) && n.tags.includes('研究任务'));
  const todoTasks = tasks.filter(t => !t.tags.includes('状态:完成'));
  const doneTasks = tasks.filter(t => t.tags.includes('状态:完成'));
  const relType = { supports: 0, refutes: 0, cites: 0 };
  for (const rel of relations) if (relType[rel.relation] !== undefined) relType[rel.relation] += 1;
  const notedPaperIds = new Set(notes.map(n => n.paperId).filter(Boolean));
  return {
    source: 'client', complete: false,
    projectStatus: 'active',
    papers: {
      total: papers.length,
      withPdf: papers.filter(p => p.attachmentId).length,
      metadataOnly: papers.filter(p => !p.attachmentId).length,
      read: papers.filter(p => p.readStatus === 'read').length,
      reading: papers.filter(p => p.readStatus === 'reading').length,
      star: papers.filter(p => p.favorite).length,
    },
    evidence: { sentenceNotes: null, notes: notes.length, researchQuestions: null, evidences: null, categories: null },
    writing: { noteDocuments: null, translations: docs.length, total: null },
    tasks: {
      todo: todoTasks.length, done: doneTasks.length, total: tasks.length,
      open: todoTasks.map(t => ({ id: t.id, content: String(t.content || '').slice(0, 120), priority: taskMeta(t, '优先级:') || '普通', due: taskMeta(t, '截止:') || '', paperTitle: t.paperTitle || null })),
    },
    relations: { total: relations.length, ...relType },
    reading: [],
    candidates: papers.filter(p => p.attachmentId && !notedPaperIds.has(p.id)).slice(0, 3).map(p => ({ id: p.id, title: p.title, attachmentId: p.attachmentId })),
    searches: { saved: null, hasSearches: null },
  };
}

async function loadFallbackReading(papers) {
  const targets = papers.filter(p => p.attachmentId).slice(0, 20);
  const results = await Promise.allSettled(targets.map(p =>
    api(`/papers/${encodeURIComponent(p.id)}/reading-state`).then(d => d.state)
  ));
  return results
    .map((r, i) => ({ state: r.status === 'fulfilled' ? r.value : null, paper: targets[i] }))
    .filter(x => x.state)
    .map(x => ({ paperId: x.paper.id, page: x.state.currentPage, title: x.paper.title, attachmentId: x.paper.attachmentId, updatedAt: x.state.updatedAt || '' }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 5);
}

function taskTopFor(ctx) {
  const open = ctx.stats?.tasks?.open || [];
  if (!open.length) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueTime = t => {
    if (!t.due) return Infinity;
    const d = new Date(t.due);
    return Number.isNaN(d.getTime()) ? Infinity : d.getTime();
  };
  const overdue = open.filter(t => t.due && !Number.isNaN(new Date(t.due).getTime()) && new Date(t.due) < today);
  if (overdue.length) return overdue.slice().sort((a, b) => a.due.localeCompare(b.due))[0];
  const high = open.filter(t => t.priority === '高');
  if (high.length) return high.slice().sort((a, b) => dueTime(a) - dueTime(b))[0];
  return open.slice().sort((a, b) => dueTime(a) - dueTime(b))[0];
}

function gapTopFor(ctx) {
  return (ctx.stats?.candidates || [])[0] || null;
}

function nextStepCollapsedKey(projectId) { return `hana-nextstep-${projectId}`; }
function isNextStepCollapsed(projectId) { try { return localStorage.getItem(nextStepCollapsedKey(projectId)) === '1'; } catch { return false; } }

function renderNextStepCard(ctx) {
  const { project, papers, stats } = ctx;
  const topTask = taskTopFor(ctx);
  const gap = gapTopFor(ctx);
  const readingPos = (stats.reading || [])[0];
  let action = null;
  if (readingPos && readingPos.attachmentId) action = { label: `继续阅读 · 第 ${readingPos.page} 页`, type: 'reader', attachmentId: readingPos.attachmentId, hint: readingPos.title };
  else if (topTask) action = { label: '推进任务', type: 'tasks', hint: topTask.content };
  else if (gap && gap.attachmentId) action = { label: '精读补证据', type: 'reader', attachmentId: gap.attachmentId, hint: gap.title };
  else if (!papers.length) action = { label: '上传 PDF', type: 'upload', hint: '从本地或文献中心开始积累证据' };
  else action = { label: '查看证据', type: 'evidence', hint: '标记角色或建立论证关系' };
  const primaryNote = readingPos
    ? `上次读到《${snippet(readingPos.title, 24)}》第 ${readingPos.page} 页`
    : gap
      ? `填补证据缺口：${snippet(gap.title, 24)}`
      : topTask
        ? `${topTask.priority === '高' ? '高优先级' : ''}任务待推进`
        : '开始积累第一条证据';
  return `<section class="hr-next-step" data-next-step>
    <h3 class="native-section-title">下一步</h3>
    <div class="hr-next-body">
      <div class="hr-next-primary">
        <span class="hr-next-kicker">继续推进</span>
        <strong>${escapeHtml(action.hint)}</strong>
        <p>${escapeHtml(primaryNote)}</p>
        <button type="button" class="button primary" data-next-primary data-action="${escapeAttr(action.type)}" ${action.attachmentId ? `data-attachment="${escapeAttr(action.attachmentId)}"` : ''}>${escapeHtml(action.label)}</button>
      </div>
    </div>
  </section>`;
}

function renderProjectSnapshot(ctx) {
  const readingPos = (ctx.stats?.reading || [])[0];
  const gap = gapTopFor(ctx);
  const topTask = taskTopFor(ctx);
  const recentTitle = readingPos ? snippet(readingPos.title, 28) : '尚无阅读记录';
  const recentMeta = readingPos ? `上次读到第 ${readingPos.page} 页` : '打开一篇 PDF 后，这里会保留阅读位置';
  const gapTitle = gap ? snippet(gap.title, 28) : '当前没有明确缺口';
  const gapMeta = gap ? 'PDF 已就绪，但还没有形成项目笔记' : '继续阅读或建立文献关系后自动更新';
  return `<div class="project-snapshot" aria-label="项目当前状态">
    <article class="snapshot-card"><span>最近活动</span><strong>${escapeHtml(recentTitle)}</strong><p>${escapeHtml(recentMeta)}</p>${readingPos?.attachmentId ? `<button type="button" class="chip-small" data-snapshot-reader="${escapeAttr(readingPos.attachmentId)}">继续阅读</button>` : ''}</article>
    <article class="snapshot-card ${gap ? 'needs-attention' : ''}"><span>证据缺口</span><strong>${escapeHtml(gapTitle)}</strong><p>${escapeHtml(gapMeta)}</p>${gap?.attachmentId ? `<button type="button" class="chip-small" data-snapshot-reader="${escapeAttr(gap.attachmentId)}">开始补证据</button>` : topTask ? `<button type="button" class="chip-small" data-snapshot-tasks>查看待办</button>` : ''}</article>
  </div>`;
}

// ── 研究副驾驶：≤3 条可执行建议（真实数据驱动） ──

function copilotDismissKey(projectId, id) { return `hana-copilot-dismiss-${projectId}_${id}`; }
function isCopilotDismissed(projectId, id) { try { return localStorage.getItem(copilotDismissKey(projectId, id)) === '1'; } catch { return false; } }
function dismissCopilot(projectId, id) { try { localStorage.setItem(copilotDismissKey(projectId, id), '1'); } catch { /* ignore */ } }

function buildCopilotSuggestions(ctx) {
  const { project, stats } = ctx;
  const out = [];
  const open = stats?.tasks?.open || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = open.filter(t => t.due && !Number.isNaN(new Date(t.due).getTime()) && new Date(t.due) < today);
  const high = open.filter(t => t.priority === '高');
  const top = overdue[0] || high[0] || null;
  if (top) {
    const isOverdue = !!overdue[0];
    out.push({
      id: 'task-' + top.id,
      kind: 'task',
      title: `任务「${snippet(top.content, 22)}」${isOverdue ? '已超过截止日期' : '优先级高'}`,
      detail: `${isOverdue ? '逾期任务可能阻塞后续工作' : '建议尽早推进'}${top.due ? ' · 截止 ' + top.due : ''}${top.paperTitle ? ' · ' + top.paperTitle : ''}`,
      basis: `来自项目「${project.title}」的任务清单：「${top.content}」${top.due ? '（截止 ' + top.due + '）' : ''}${top.paperTitle ? '，关联《' + top.paperTitle + '》' : ''}。当前共 ${stats.tasks.todo} 个待推进任务，该任务${isOverdue ? '已超过它的截止时间，先处理可避免阻塞后续环节' : '为最高优先级'}。`,
      action: { type: 'tasks' },
    });
  }
  const candidates = stats?.candidates || [];
  if (candidates.length) {
    const c = candidates[0];
    out.push({
      id: 'gap-' + c.id,
      kind: 'gap',
      title: `「${snippet(c.title, 22)}」有 PDF 但尚无笔记`,
      detail: '补一条逐句笔记或结构化证据卡即可进入证据矩阵。',
      basis: `该项目含 ${stats.papers.total} 篇文献、${stats.evidence.sentenceNotes ?? '—'} 条逐句笔记。${c.title} 的 PDF 已就绪但没有任何笔记，属于可直接补强的证据缺口。`,
      action: { type: 'reader', attachmentId: c.attachmentId, paperId: c.id },
    });
  } else if (!stats?.relations?.total) {
    out.push({
      id: 'rel-gap',
      kind: 'gap',
      title: '还没有建立任何文献论证关系',
      detail: '在两篇文献间标注 支持 / 反驳 / 被引用，论证链才会出现。',
      basis: `该项目当前 ${stats.relations?.total ?? 0} 条关系，已有 ${stats.papers.total} 篇文献等待组织成论证链。`,
      action: { type: 'relations' },
    });
  }
  // 今日顺序：基于 高优任务 + 最近阅读 + 证据缺口 的真实顺序建议
  const steps = [];
  if (top) steps.push(`先处理任务「${snippet(top.content, 16)}」`);
  const readingPos = (stats.reading || [])[0];
  if (readingPos) steps.push(`接着续读《${snippet(readingPos.title, 14)}》第 ${readingPos.page} 页`);
  if (candidates.length) steps.push(`再为《${snippet(candidates[0].title, 14)}》补一条证据`);
  out.push({
    id: 'order-today',
    kind: 'order',
    title: '今天的推进顺序',
    detail: steps.length ? steps.join(' → ') : '暂无明确的顺序（先上传或导入一篇文献开始）',
    basis: `今天建议按以下顺序推进（依据当前真实状态）：${steps.length ? steps.join('；') : '暂无待办、进行中阅读或证据缺口候选。'}。你可在确认后把这份计划交给 Agent 细化。`,
    action: { type: steps.length ? 'tasks' : 'upload' },
  });
  return out.filter(s => !isCopilotDismissed(project.id, s.id)).slice(0, 3);
}

function renderCopilot(ctx) {
  const suggestions = buildCopilotSuggestions(ctx);
  const rows = suggestions.map(s => `<article class="hr-copilot-item" data-copilot-id="${escapeAttr(s.id)}" data-kind="${escapeAttr(s.kind)}">
      <div class="hr-copilot-title">${s.kind === 'order' ? '· ' : s.kind === 'task' ? '◆ ' : '▣ '}${escapeHtml(s.title)}</div>
      <p class="hr-copilot-detail">${escapeHtml(s.detail)}</p>
      <div class="hr-copilot-actions">
        <button type="button" class="chip-small" data-copilot-basis>查看依据</button>
        <button type="button" class="chip-small" data-copilot-agent>交给 Agent</button>
        <button type="button" class="chip-small quiet" data-copilot-dismiss title="暂不处理，此后不再提示该项">暂不处理</button>
      </div>
    </article>`).join('');
  const body = suggestions.length
    ? rows
    : '<p class="drawer-empty-hint">基于真实数据暂未发现需要提示的事项——完成阅读、把下一步写进任务清单、或建立论证关系后再来看看。</p>';
  const hint = suggestions.length ? '<span class="hr-copilot-muted">基于真实数据给出最多 3 条建议</span>' : '';
  return `<section class="hr-copilot" aria-label="研究副驾驶"><h3>研究副驾驶 ${hint}</h3>
    <div class="hr-copilot-list">${body}</div>
    <p class="hr-copilot-foot">Agent 只生成拟执行计划；创建 / 修改任务等写入操作一律在你确认后执行，并保留宿主审计。</p>
  </section>`;
}

function renderSuggestionBasis(sug, ctx) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true" aria-label="建议依据">
    <span class="composer-kicker">Suggestion basis · 真实数据</span>
    <h2>${escapeHtml(sug.title)}</h2>
    <div class="hr-basis-block">${escapeHtml(sug.basis)}</div>
    <p class="modal-copy">以上依据来自本地项目库，未由 AI 推测：项目「${escapeHtml(ctx.project.title)}」当前 ${ctx.stats.papers.total} 篇文献 · ${ctx.stats.tasks.todo} 个待推进任务 · ${ctx.stats.relations.total} 条论证关系。</p>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModalLayer);
}

function copilotHandoffPrompt(ctx, sug) {
  const { project } = ctx;
  return `关于项目「${project.title}」的一条副驾驶建议：${sug.title}。依据：${sug.basis}\n请先调用 hana_research_get_project_brief（projectId: ${ctx.projectId}）与 hana_research_list_project_tasks 读取真实上下文，再结合这条建议给出具体可执行的计划。${agentWritePolicyInstruction()}`;
}

// ── 研究闭环可视化：研究问题 → 检索 → 候选文献 → 精读证据 → 论证链 → 任务 → 写作产出 ──

function pipelineStages(ctx) {
  const { stats, project, notes } = ctx;
  const hasQuestion = Boolean(project.description) || (notes || []).some(n => (n.tags || []).some(t => t.startsWith('研究问题')));
  const savedSearches = stats.searches?.saved ?? null;
  const sentenceNotes = stats.evidence?.sentenceNotes ?? null;
  const writingTotal = stats.writing?.total ?? null;
  const writingMeta = stats.writing != null && stats.writing.total != null
    ? `${stats.writing?.noteDocuments ?? 0} 篇汇总 · ${stats.writing?.translations ?? 0} 篇译文`
    : '尚未建立关联';
  const st = (key, label, count, ok, target, meta, na = false) => ({ key, label, count: na ? null : count, ok, target, meta: na ? '尚未建立关联' : meta, na });
  return [
    st('question', '研究问题', hasQuestion ? 1 : 0, hasQuestion, 'overview', hasQuestion ? '已建立' : '尚未建立关联', false),
    st('search', '检索', savedSearches ?? 0, (savedSearches ?? 0) > 0, 'search', savedSearches != null ? `${savedSearches} 条保存检索` : '尚未建立关联', savedSearches == null),
    st('candidate', '候选文献', stats.papers?.total ?? 0, (stats.papers?.total ?? 0) > 0, 'evidence', `${stats.papers?.metadataOnly ?? 0} 篇仅元数据`, false),
    st('reading', '精读证据', sentenceNotes ?? 0, (sentenceNotes ?? 0) > 0, 'evidence', `${stats.papers?.read ?? 0} 篇已读`, sentenceNotes == null),
    st('chain', '论证链', stats.relations?.total ?? 0, (stats.relations?.total ?? 0) > 0, 'relations', `${stats.relations?.supports ?? 0} 支持 · ${stats.relations?.refutes ?? 0} 反驳`, false),
    st('task', '任务', stats.tasks?.todo ?? 0, (stats.tasks?.todo ?? 0) > 0, 'tasks', `${stats.tasks?.done ?? 0} 已完成`, false),
    st('writing', '写作产出', writingTotal ?? 0, (writingTotal ?? 0) > 0, 'tasks', writingMeta, writingTotal == null),
  ];
}

function renderResearchPipeline(ctx) {
  const stages = pipelineStages(ctx);
  const items = stages.map((s, i) => {
    const state = s.na ? 'na' : (s.ok ? 'done' : 'idle');
    return `${i ? '<i class="hr-pipe-arrow" aria-hidden="true">→</i>' : ''}<button type="button" class="hr-pipe-stage state-${state}" data-pipe-target="${escapeAttr(s.target)}" data-pipe-key="${escapeAttr(s.key)}" title="点击跳转：${escapeAttr(s.meta)}">
      <span class="hr-pipe-label">${escapeHtml(s.label)}</span>
      <strong class="hr-pipe-count">${s.count == null || s.na ? '—' : escapeHtml(String(s.count))}</strong>
      <small class="hr-pipe-meta">${escapeHtml(s.na ? '尚未建立关联' : s.meta)}</small>
    </button>`;
  }).join('');
  return `<section class="hr-pipeline" aria-label="研究闭环"><h3>研究闭环 <span class="hr-pipeline-hint">每一阶段显示真实数量 · 不伪造进度</span></h3>
    <div class="hr-pipe-track">${items}</div>
  </section>`;
}

function switchDrawerTab(panel, tab) {
  if (!['overview', 'evidence', 'tasks'].includes(tab)) tab = 'overview';
  panel.querySelectorAll('[data-drawer-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.drawerTab === tab));
  panel.querySelectorAll('[data-drawer-tabpanel]').forEach(section => {
    section.hidden = section.dataset.drawerTabpanel !== tab;
  });
  try { sessionStorage.setItem('hana-drawer-tab', tab); } catch { /* ignore */ }
}

function screeningOptions(selected) {
  return Object.entries(SCREENING_DECISION_LABELS).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function dualReviewerStorageKey(projectId) { return `hana-dual-screening-reviewer-${projectId}`; }
function activeDualReviewer(projectId) {
  try { return localStorage.getItem(dualReviewerStorageKey(projectId)) === 'b' ? 'b' : 'a'; } catch { return 'a'; }
}

function kappaLabel(value) {
  if (value === null || value === undefined) return '样本不足';
  if (value >= .8) return '高度一致';
  if (value >= .6) return '实质一致';
  if (value >= .4) return '中等一致';
  if (value >= .2) return '一般一致';
  return '一致性较弱';
}

function renderScreeningWorkbench(screening) {
  const ta = screening?.titleAbstract || { pending: 0, include: 0, maybe: 0, exclude: 0 };
  const ft = screening?.fullText || { pending: 0, include: 0, maybe: 0, exclude: 0 };
  const criteriaCount = screening?.criteria?.length || 0;
  const dual = screening?.dualScreening;
  const config = dual?.config || { enabled: false, reviewerAName: '审查者 A', reviewerBName: '审查者 B' };
  const reviewer = activeDualReviewer(screening?.projectId || config.projectId || '');
  const reviewerName = reviewer === 'a' ? config.reviewerAName : config.reviewerBName;
  const taAgreement = dual?.stages?.titleAbstract;
  const dualPanel = config.enabled ? `<div class="dual-screening-panel">
      <div class="dual-reviewer-switch"><span>当前身份</span><button type="button" class="${reviewer === 'a' ? 'active' : ''}" data-dual-reviewer="a"><i>A</i>${escapeHtml(config.reviewerAName)}</button><button type="button" class="${reviewer === 'b' ? 'active' : ''}" data-dual-reviewer="b"><i>B</i>${escapeHtml(config.reviewerBName)}</button></div>
      <div class="dual-metrics"><span><small>已成对</small><b>${taAgreement?.paired || 0}<em> / ${taAgreement?.total || 0}</em></b></span><span><small>原始一致率</small><b>${taAgreement?.agreementRate == null ? '—' : `${taAgreement.agreementRate}%`}</b></span><span><small>Cohen’s κ</small><b>${taAgreement?.kappa == null ? '—' : taAgreement.kappa}<em>${kappaLabel(taAgreement?.kappa)}</em></b></span><button type="button" class="dual-conflict-button ${dual?.conflictCount ? 'has-conflict' : ''}" data-dual-conflicts><small>待仲裁</small><b>${dual?.conflictCount || 0}</b></button></div>
      <p>正在以 <strong>${escapeHtml(reviewerName)}</strong> 身份独立筛选；双方提交前互不显示具体结论。</p>
    </div>` : `<div class="dual-screening-invite"><div><b>需要双人独立筛选？</b><span>分别记录两位审查者判断，自动发现冲突并计算一致性。</span></div><button type="button" class="button" data-dual-config>启用双人模式</button></div>`;
  return `<section class="screening-workbench" aria-label="系统综述筛选进度">
    <div class="screening-head"><div><span>Systematic review</span><h3>文献筛选</h3></div><div><button type="button" class="button prisma-entry" data-prisma-open>PRISMA 流程${screening?.prisma?.batches?.length ? ` · ${screening.prisma.batches.length}` : ''}</button><button type="button" class="button" data-screening-criteria>管理纳排标准${criteriaCount ? ` · ${criteriaCount}` : ''}</button>${config.enabled ? '<button type="button" class="button" data-dual-config>双人设置</button>' : ''}</div></div>
    <div class="screening-stages">
      <div><small>题录与摘要</small><strong>${ta.pending}</strong><span>待筛</span><p><b class="include">${ta.include} 纳入</b><b class="maybe">${ta.maybe} 待定</b><b class="exclude">${ta.exclude} 排除</b></p></div>
      <i aria-hidden="true">→</i>
      <div><small>全文筛选</small><strong>${ft.pending}</strong><span>待筛</span><p><b class="include">${ft.include} 纳入</b><b class="maybe">${ft.maybe} 待定</b><b class="exclude">${ft.exclude} 排除</b></p></div>
      <i aria-hidden="true">→</i>
      <div class="screening-final"><small>最终纳入</small><strong>${screening?.finalIncluded || 0}</strong><span>篇研究</span><p>每次判断均保留理由和时间</p></div>
    </div>
    ${dualPanel}
    ${config.enabled ? '' : `<div class="screening-batch" data-screening-batch hidden><span>已选 <b data-screening-selected-count>0</b> 篇</span><label>阶段<select data-screening-batch-stage><option value="title_abstract">题录 / 摘要</option><option value="full_text">全文</option></select></label><label>结论<select data-screening-batch-decision>${screeningOptions('include')}</select></label><button type="button" class="button primary" data-screening-batch-apply>批量应用</button></div>`}
  </section>`;
}

function renderCodingWorkbench(coding) {
  const fields = coding?.fields || [];
  return `<section class="coding-workbench" aria-label="研究编码进度">
    <div><span>Structured extraction</span><h3>研究编码</h3><p>${fields.length ? `${coding.papersCoded || 0} / ${coding.totalPapers || 0} 篇已开始，${coding.papersComplete || 0} 篇完成必填字段` : '先建立字段模板，再逐篇提取可分析的研究证据。'}</p></div>
    <div class="coding-summary"><b>${fields.length}</b><small>个字段</small><button type="button" class="button" data-evidence-fields>管理字段与模板</button></div>
  </section>`;
}

function evidenceValuePresent(value) {
  return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
}

function evidenceFieldInputHtml(field, value) {
  const id = escapeAttr(field.id);
  const description = field.description ? ` title="${escapeAttr(field.description)}"` : '';
  if (field.type === 'number') return `<input type="number" step="any" data-evidence-field="${id}" value="${escapeAttr(value ?? '')}"${description}>`;
  if (field.type === 'select') return `<select data-evidence-field="${id}"${description}><option value="">未编码</option>${(field.options || []).map(option => `<option value="${escapeAttr(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
  if (field.type === 'multi_select') {
    const selected = new Set(Array.isArray(value) ? value : []);
    return `<div class="coding-checks" data-evidence-multi="${id}"${description}>${(field.options || []).map(option => `<label><input type="checkbox" value="${escapeAttr(option)}" ${selected.has(option) ? 'checked' : ''}><span>${escapeHtml(option)}</span></label>`).join('')}</div>`;
  }
  if (field.type === 'boolean') return `<select data-evidence-field="${id}"${description}><option value="">未编码</option><option value="true" ${value === true ? 'selected' : ''}>是</option><option value="false" ${value === false ? 'selected' : ''}>否</option></select>`;
  return `<textarea maxlength="2000" data-evidence-field="${id}" placeholder="输入${escapeAttr(field.label)}…"${description}>${escapeHtml(value ?? '')}</textarea>`;
}

function paperCodingHtml(paper, coding) {
  const fields = coding?.fields || [];
  if (!fields.length) return '';
  const values = coding?.values?.[paper.id] || {};
  const stats = coding?.paperStats?.[paper.id] || { coded: 0, total: fields.length, complete: false };
  return `<details class="paper-coding" data-paper-coding="${escapeAttr(paper.id)}"><summary><span>研究编码</span><b class="${stats.complete ? 'complete' : ''}">${stats.coded} / ${stats.total}${stats.complete ? ' · 已完成' : ''}</b></summary><div class="paper-coding-body"><div class="coding-field-grid">${fields.map(field => `<label class="coding-field"><span>${escapeHtml(field.label)}${field.required ? '<i>必填</i>' : ''}</span>${evidenceFieldInputHtml(field, values[field.id])}${field.description ? `<small>${escapeHtml(field.description)}</small>` : ''}</label>`).join('')}</div><div class="coding-save-row"><span>空值不会写入；可分多次完成。</span><button type="button" class="button primary" data-evidence-save="${escapeAttr(paper.id)}">保存编码</button></div></div></details>`;
}

function codingFieldEditorHtml(field, index) {
  const needsOptions = ['select', 'multi_select'].includes(field.type);
  return `<div class="coding-field-editor" data-coding-field-id="${escapeAttr(field.id || '')}">
    <span class="coding-field-order">${index + 1}</span>
    <label><span>字段名称</span><input data-field-label maxlength="80" value="${escapeAttr(field.label || '')}" placeholder="例如：样本量"></label>
    <label><span>类型</span><select data-field-type>${Object.entries(EVIDENCE_FIELD_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${field.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="coding-options" ${needsOptions ? '' : 'hidden'}><span>选项（用；分隔）</span><input data-field-options value="${escapeAttr((field.options || []).join('；'))}" placeholder="低风险；部分担忧；高风险"></label>
    <label class="coding-description"><span>操作性定义</span><input data-field-description maxlength="500" value="${escapeAttr(field.description || '')}" placeholder="说明如何判断或编码"></label>
    <label class="coding-required"><input type="checkbox" data-field-required ${field.required ? 'checked' : ''}><span>必填</span></label>
    <div class="coding-field-actions"><button type="button" data-field-move="up" title="上移">↑</button><button type="button" data-field-move="down" title="下移">↓</button><button type="button" data-field-remove title="移除字段">×</button></div>
  </div>`;
}

function readCodingFieldEditors(container) {
  return [...container.querySelectorAll('[data-coding-field-id]')].map(row => ({
    id: row.dataset.codingFieldId || undefined,
    label: row.querySelector('[data-field-label]').value.trim(),
    type: row.querySelector('[data-field-type]').value,
    description: row.querySelector('[data-field-description]').value.trim(),
    options: row.querySelector('[data-field-options]').value.split(/[；;\n]/).map(value => value.trim()).filter(Boolean),
    required: row.querySelector('[data-field-required]').checked,
  }));
}

function renderEvidenceFieldsModal(ctx) {
  closeModalLayer();
  const layer = openModalLayer();
  let draft = (ctx.coding?.fields || []).map(field => ({ ...field, options: [...(field.options || [])] }));
  const templates = ctx.coding?.templates || [];
  layer.innerHTML = `<form class="modal-panel modal-wide coding-fields-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Coding schema</span><h2>研究编码字段</h2><p class="modal-copy">字段顺序会同步到证据矩阵和导出。应用模板只会替换下方草稿，点击保存后才会生效。</p><div class="coding-template-bar"><label><span>研究模板</span><select data-coding-template><option value="">选择模板…</option>${templates.map(template => `<option value="${escapeAttr(template.id)}">${escapeHtml(template.label)}</option>`).join('')}</select></label><button type="button" class="button" data-template-apply>应用到草稿</button><button type="button" class="button" data-field-add>＋ 新增字段</button></div><div class="coding-field-editors" data-field-editors></div><p class="screening-empty-criteria" data-fields-empty ${draft.length ? 'hidden' : ''}>还没有字段。可以应用研究模板，或从一个自定义字段开始。</p><div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存字段</button></div></form>`;
  document.body.append(layer);
  const editors = layer.querySelector('[data-field-editors]');
  const renderRows = () => {
    editors.innerHTML = draft.map(codingFieldEditorHtml).join('');
    layer.querySelector('[data-fields-empty]').hidden = draft.length > 0;
    editors.querySelectorAll('[data-field-type]').forEach(select => select.addEventListener('change', () => {
      select.closest('[data-coding-field-id]').querySelector('.coding-options').hidden = !['select', 'multi_select'].includes(select.value);
    }));
  };
  const syncDraft = () => { draft = readCodingFieldEditors(editors); };
  renderRows();
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('[data-field-add]').addEventListener('click', () => {
    syncDraft();
    draft.push({ label: '', type: 'text', description: '', options: [], required: false });
    renderRows();
    editors.lastElementChild?.querySelector('[data-field-label]')?.focus();
  });
  layer.querySelector('[data-template-apply]').addEventListener('click', () => {
    const template = templates.find(item => item.id === layer.querySelector('[data-coding-template]').value);
    if (!template) { showNotice('请先选择一个研究模板。', true); return; }
    draft = template.fields.map(field => ({ ...field, options: [...(field.options || [])] }));
    renderRows();
    showNotice(`已将“${template.label}”载入草稿，尚未保存。`);
  });
  editors.addEventListener('click', event => {
    const button = event.target.closest('[data-field-remove], [data-field-move]');
    if (!button) return;
    syncDraft();
    const row = button.closest('[data-coding-field-id]');
    const index = [...editors.children].indexOf(row);
    if (button.hasAttribute('data-field-remove')) draft.splice(index, 1);
    else {
      const next = button.dataset.fieldMove === 'up' ? index - 1 : index + 1;
      if (next >= 0 && next < draft.length) [draft[index], draft[next]] = [draft[next], draft[index]];
    }
    renderRows();
  });
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    syncDraft();
    const button = event.submitter;
    const save = force => api(`/projects/${encodeURIComponent(ctx.projectId)}/evidence-fields`, { method: 'PUT', body: JSON.stringify({ fields: draft, force }) });
    try {
      button.disabled = true;
      await save(false);
    } catch (error) {
      const forced = error.code === 'EVIDENCE_FIELDS_IN_USE' && await confirmDialog({
        title: '字段正在使用中',
        message: `${error.message}\n继续将永久删除这些字段下的 ${error.details?.valueCount || '已有'} 条编码值。`,
        confirmLabel: '永久删除并保存',
        danger: true,
      });
      if (!forced) {
        button.disabled = false;
        showNotice(error.message, true);
        return;
      }
      try {
        await save(true);
      } catch (forcedError) {
        button.disabled = false;
        showNotice(forcedError.message, true);
        return;
      }
    }
    closeModalLayer();
    showNotice(`已保存 ${draft.length} 个研究编码字段。`);
    await openProjectDrawer(ctx.projectId);
  });
}

function dualScreeningStageHtml({ item, stage, paperId, reviewer, peerName, disabled = false }) {
  const own = item?.[reviewer] || { decision: 'pending', reason: '' };
  const peer = item?.[reviewer === 'a' ? 'b' : 'a'] || { decision: 'pending' };
  const bothComplete = own.decision !== 'pending' && peer.decision !== 'pending';
  const peerText = peer.decision === 'pending' ? `${peerName}未提交` : (bothComplete ? `${peerName}：${SCREENING_DECISION_LABELS[peer.decision]}` : `${peerName}已提交`);
  return `<label class="dual-stage-field"><span>${stage === 'title_abstract' ? '题录 / 摘要' : '全文'}</span><select data-dual-screening-set="${escapeAttr(paperId)}" data-screening-stage="${stage}" data-reviewer="${reviewer}" class="screening-select ${escapeAttr(own.decision)}" ${disabled ? 'disabled title="先完成题录与摘要判断"' : ''}>${screeningOptions(own.decision)}</select><small class="peer-review-state ${peer.decision === 'pending' ? 'pending' : 'submitted'}">${escapeHtml(peerText)}</small></label>`;
}

function drawerPaperCardHtml(paper, coding, screening) {
  const ta = paper.titleAbstractDecision || 'pending';
  const ft = paper.fullTextDecision || 'pending';
  const fullTextReady = ['include', 'maybe'].includes(ta) || ft !== 'pending';
  const reason = paper.fullTextReason || paper.titleAbstractReason || '';
  const dual = screening?.dualScreening;
  const dualEnabled = dual?.config?.enabled;
  const reviewer = activeDualReviewer(screening?.projectId || '');
  const peerName = reviewer === 'a' ? dual?.config?.reviewerBName : dual?.config?.reviewerAName;
  const dualPaper = dual?.byPaper?.[paper.id];
  const dualStatus = dualPaper?.titleAbstract?.status || 'unreviewed';
  const ownTitleDecision = dualPaper?.titleAbstract?.[reviewer]?.decision || 'pending';
  const dualFullReady = ['include', 'maybe'].includes(dualPaper?.titleAbstract?.finalDecision) || ['include', 'maybe'].includes(ownTitleDecision) || dualPaper?.fullText?.[reviewer]?.decision !== 'pending';
  const screeningMarkup = dualEnabled ? `<div class="paper-screening-row dual">
      ${dualScreeningStageHtml({ item: dualPaper?.titleAbstract, stage: 'title_abstract', paperId: paper.id, reviewer, peerName })}
      ${dualScreeningStageHtml({ item: dualPaper?.fullText, stage: 'full_text', paperId: paper.id, reviewer, peerName, disabled: !dualFullReady })}
      <div class="dual-paper-status ${escapeAttr(dualStatus)}"><span>${dualStatus === 'conflict' ? '结论冲突' : dualStatus === 'resolved' ? '已仲裁' : dualStatus === 'agreement' ? '双方一致' : dualStatus === 'in_progress' ? '等待另一位' : '尚未开始'}</span>${dualStatus === 'conflict' ? `<button type="button" data-screening-resolve="${escapeAttr(paper.id)}" data-screening-stage="title_abstract">仲裁</button>` : ''}</div>
    </div>` : `<div class="paper-screening-row"><label><span>题录 / 摘要</span><select data-screening-set="${escapeAttr(paper.id)}" data-screening-stage="title_abstract" class="screening-select ${escapeAttr(ta)}">${screeningOptions(ta)}</select></label><label><span>全文</span><select data-screening-set="${escapeAttr(paper.id)}" data-screening-stage="full_text" class="screening-select ${escapeAttr(ft)}" ${fullTextReady ? '' : 'disabled title="先完成题录与摘要筛选"'}>${screeningOptions(ft)}</select></label>${reason ? `<button type="button" class="screening-reason" data-screening-reason="${escapeAttr(paper.id)}" title="${escapeAttr(reason)}">理由 · ${escapeHtml(reason.slice(0, 34))}${reason.length > 34 ? '…' : ''}</button>` : ''}</div>`;
  const explicitRetrieval = paper.retrievalStatus && paper.retrievalStatus !== 'auto';
  const effectiveRetrieval = explicitRetrieval ? paper.retrievalStatus : (paper.fullTextDecision !== 'pending' ? 'retrieved' : (['include', 'maybe'].includes(ta) ? (paper.attachmentId ? 'retrieved' : 'sought') : 'not_sought'));
  const showRetrieval = explicitRetrieval || ['include', 'maybe'].includes(ta) || ft !== 'pending';
  const retrievalMarkup = showRetrieval ? `<div class="paper-retrieval-row ${escapeAttr(effectiveRetrieval)}"><span>全文获取</span><select data-retrieval-set="${escapeAttr(paper.id)}" aria-label="全文获取状态"><option value="auto" ${paper.retrievalStatus === 'auto' ? 'selected' : ''}>自动 · ${effectiveRetrieval === 'retrieved' ? '已获取' : effectiveRetrieval === 'sought' ? '获取中' : '未进入'}</option><option value="sought" ${paper.retrievalStatus === 'sought' ? 'selected' : ''}>正在获取</option><option value="retrieved" ${paper.retrievalStatus === 'retrieved' ? 'selected' : ''}>已获取全文</option><option value="not_retrieved" ${paper.retrievalStatus === 'not_retrieved' ? 'selected' : ''}>无法获取</option></select>${paper.retrievalReason ? `<button type="button" data-retrieval-reason="${escapeAttr(paper.id)}" title="${escapeAttr(paper.retrievalReason)}">${escapeHtml(paper.retrievalReason.slice(0, 36))}${paper.retrievalReason.length > 36 ? '…' : ''}</button>` : ''}</div>` : '';
  return `<article class="drawer-paper" data-paper-id="${escapeAttr(paper.id)}" data-drawer-role="${escapeAttr(paper.role || '')}" data-screening-decision="${escapeAttr(dualEnabled ? dualStatus : ta)}">
    ${dualEnabled ? '' : `<label class="screening-paper-check" title="选择用于批量筛选"><input type="checkbox" data-screening-select-paper="${escapeAttr(paper.id)}"><span>批量选择</span></label>`}<span>${escapeHtml(paper.venue)}${paper.year ? ` · ${escapeHtml(paper.year)}` : ''}</span><strong>${escapeHtml(paper.title)}</strong>
    <div class="drawer-paper-actions"><em>${paper.attachmentId ? 'PDF 已就绪' : '仅元数据'}</em><span class="drawer-paper-buttons">${paper.attachmentId ? `<button class="reader-open" data-open-reader="${escapeAttr(paper.attachmentId)}">打开阅读器</button><button class="reader-open translate-doc" data-translate-doc="${escapeAttr(paper.attachmentId)}" data-translate-title="${escapeAttr(paper.title)}">翻译全文</button><button class="trans-toggle" data-translations-toggle="${escapeAttr(paper.attachmentId)}" title="展开/收起译文子文档">译文 <b>${state.translationCounts[paper.attachmentId] || 0}</b><i></i></button>` : ''}<button class="reader-open" data-relation-add="${escapeAttr(paper.id)}" title="标注该文献与其他文献的关系（支持/反驳/被引用）">关系</button></span></div>
    ${screeningMarkup}
    ${retrievalMarkup}
    ${paperCodingHtml(paper, coding)}
    <div class="drawer-paper-rolebar"><span class="paper-role ${paper.role ? escapeAttr(paper.role) : 'none'}">${paper.role ? PAPER_ROLE_LABELS[paper.role] : '未标记角色'}</span><select class="paper-role-select" data-role-set="${escapeAttr(paper.id)}" title="标记该文献在项目中的角色">${[['', '未标记'], ['core', '核心文献'], ['background', '背景'], ['method', '方法参考'], ['compare', '结果对比']].map(([value, label]) => `<option value="${value}" ${paper.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="paper-translations" data-translations-panel="${escapeAttr(paper.attachmentId || '')}" hidden></div>
  </article>`;
}

function prismaSourceLabel(type) {
  return type === 'database' ? '数据库' : type === 'register' ? '注册平台' : '其他来源';
}

function renderPrismaFlow(prisma) {
  const p = prisma || {};
  const identification = p.identification || {};
  const screening = p.screening || {};
  const retrieval = p.retrieval || {};
  const eligibility = p.eligibility || {};
  const included = p.included || {};
  const box = (kicker, count, label, meta, tone = '') => `<article class="prisma-flow-box ${tone}"><span>${escapeHtml(kicker)}</span><strong>${Number(count || 0)}</strong><h3>${escapeHtml(label)}</h3><p>${escapeHtml(meta)}</p></article>`;
  return `<div class="prisma-flow" aria-label="PRISMA 2020 流程">
    <div class="prisma-identification">${box('DATABASES / REGISTERS', identification.databaseRecords, '数据库与注册平台', `${(p.batches || []).filter(item => item.sourceType !== 'other').length} 个检索批次`, 'source')}${box('OTHER METHODS', identification.otherRecords, '其他来源', `${(p.batches || []).filter(item => item.sourceType === 'other').length} 个检索批次`, 'source')}</div>
    <i aria-hidden="true">↓</i>
    ${box('REMOVED BEFORE SCREENING', Number(identification.duplicatesRemoved || 0) + Number(identification.removedOther || 0), '筛选前移除', `去重 ${identification.duplicatesRemoved || 0} · 其他原因 ${identification.removedOther || 0}`, 'removed')}
    <i aria-hidden="true">↓</i>
    ${box('TITLE / ABSTRACT', screening.screened, '题录与摘要已筛选', `待筛 ${screening.awaiting || 0} · 排除 ${screening.excluded || 0}`)}
    <i aria-hidden="true">↓</i>
    ${box('RETRIEVAL', retrieval.sought, '寻求获取全文', `已获取 ${retrieval.retrieved || 0} · 获取中 ${retrieval.awaiting || 0} · 未获取 ${retrieval.notRetrieved || 0}`)}
    <i aria-hidden="true">↓</i>
    ${box('ELIGIBILITY', eligibility.assessed, '全文已评估', `待评估 ${eligibility.awaiting || 0} · 排除 ${eligibility.excluded || 0} · 待定 ${eligibility.maybe || 0}`)}
    <i aria-hidden="true">↓</i>
    ${box('INCLUDED', included.studies, '最终纳入研究', '以全文筛选最终结论为准', 'included')}
  </div>`;
}

function renderPrismaModal(ctx) {
  closeModalLayer();
  const prisma = ctx.screening?.prisma || { batches: [], warnings: [] };
  const layer = openModalLayer();
  const reasons = prisma.eligibility?.exclusionReasons || [];
  const batches = prisma.batches || [];
  layer.innerHTML = `<div class="modal-panel prisma-modal" role="dialog" aria-modal="true" aria-label="PRISMA 2020 流程台账">
    <header class="prisma-modal-head"><div><span class="composer-kicker">PRISMA 2020 · Audit ledger</span><h2>文献识别与筛选流程</h2><p class="modal-copy">流程数字来自检索批次、项目筛选结论和全文获取记录。未登记的数据会明确提示，不会用当前文献数倒推。</p></div><div class="prisma-export-actions"><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/prisma/export?format=svg`))}" download>流程图 SVG</a><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/prisma/export?format=csv`))}" download>审计台账 CSV</a><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/prisma/export?format=json`))}" download>原始数据 JSON</a></div></header>
    <div class="prisma-modal-body"><section>${renderPrismaFlow(prisma)}</section><aside class="prisma-ledger">
      ${(prisma.warnings || []).length ? `<div class="prisma-warning"><b>口径尚未完全对齐</b>${prisma.warnings.map(item => `<p>${escapeHtml(item)}</p>`).join('')}</div>` : '<div class="prisma-ready"><b>流程数字已对齐</b><p>已登记批次与当前项目文献数量一致。</p></div>'}
      <div class="prisma-ledger-head"><div><span>SEARCH LOG</span><h3>检索批次 · ${batches.length}</h3></div><button type="button" class="button primary" data-prisma-batch-new>＋ 登记批次</button></div>
      <div class="prisma-batch-list">${batches.length ? batches.map(batch => `<article data-prisma-batch="${escapeAttr(batch.id)}"><div><span>${escapeHtml(prismaSourceLabel(batch.sourceType))}${batch.searchedAt ? ` · ${escapeHtml(String(batch.searchedAt).slice(0, 10))}` : ''}</span><strong>${escapeHtml(batch.sourceName)}</strong><p>发现 ${batch.recordsFound} · 去重 ${batch.duplicatesRemoved} · 其他移除 ${batch.removedOther} · 导入 ${batch.recordsImported}</p>${batch.query ? `<small title="${escapeAttr(batch.query)}">${escapeHtml(batch.query.slice(0, 90))}${batch.query.length > 90 ? '…' : ''}</small>` : ''}</div><div><button type="button" data-prisma-batch-edit="${escapeAttr(batch.id)}">编辑</button><button type="button" class="danger-text" data-prisma-batch-delete="${escapeAttr(batch.id)}">删除</button></div></article>`).join('') : '<p class="prisma-empty">尚未登记检索批次。建议按数据库、注册平台或其他来源分别记录。</p>'}</div>
      <div class="prisma-reasons"><span>FULL-TEXT EXCLUSIONS</span><h3>全文排除理由</h3>${reasons.length ? `<ul>${reasons.map(item => `<li><span>${escapeHtml(item.reason)}</span><b>${item.count}</b></li>`).join('')}</ul>` : '<p>尚无全文排除记录。</p>'}</div>
    </aside></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModalLayer);
  layer.querySelector('[data-prisma-batch-new]')?.addEventListener('click', () => renderPrismaBatchModal(ctx));
  layer.querySelectorAll('[data-prisma-batch-edit]').forEach(button => button.addEventListener('click', () => renderPrismaBatchModal(ctx, batches.find(item => item.id === button.dataset.prismaBatchEdit))));
  layer.querySelectorAll('[data-prisma-batch-delete]').forEach(button => button.addEventListener('click', async () => {
    const batch = batches.find(item => item.id === button.dataset.prismaBatchDelete);
    if (!batch || !(await confirmDialog({ title: '删除检索批次', message: `删除检索批次“${batch.sourceName}”？该操作不会删除项目文献。`, confirmLabel: '删除批次', danger: true }))) return;
    const action = await runButtonAction(button, { key: `prisma-delete:${batch.id}`, pendingLabel: '删除中…', errorPrefix: '检索批次删除失败' }, () => api(`/projects/${encodeURIComponent(ctx.projectId)}/prisma/batches/${encodeURIComponent(batch.id)}`, { method: 'DELETE' }));
    if (!action.ok) return;
    ctx.screening.prisma = action.value.prisma;
    showNotice('检索批次已删除；项目文献未受影响。');
    renderPrismaModal(ctx);
  }));
}

function renderPrismaBatchModal(ctx, batch = null) {
  closeModalLayer();
  const item = batch || { sourceType: 'database', sourceName: '', query: '', searchedAt: new Date().toISOString().slice(0, 10), recordsFound: 0, duplicatesRemoved: 0, removedOther: 0, recordsImported: 0, notes: '' };
  const layer = openModalLayer();
  layer.innerHTML = `<form class="modal-panel prisma-batch-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Search batch</span><h2>${batch ? '编辑检索批次' : '登记检索批次'}</h2><p class="modal-copy">请填写当次检索的原始数量。导入项目数应为去重和其他移除后的实际唯一记录数。</p>
    <div class="prisma-batch-grid"><label><span>来源类型</span><select name="sourceType"><option value="database" ${item.sourceType === 'database' ? 'selected' : ''}>数据库</option><option value="register" ${item.sourceType === 'register' ? 'selected' : ''}>注册平台</option><option value="other" ${item.sourceType === 'other' ? 'selected' : ''}>其他来源</option></select></label><label><span>来源名称</span><input name="sourceName" maxlength="120" required value="${escapeAttr(item.sourceName)}" placeholder="例如：PsycINFO"></label><label><span>检索日期</span><input name="searchedAt" type="date" value="${escapeAttr(String(item.searchedAt || '').slice(0, 10))}"></label><label class="wide"><span>检索式 / 路径</span><textarea name="query" maxlength="4000" placeholder="记录可复现的检索式、灰色文献路径或手工检索方式…">${escapeHtml(item.query)}</textarea></label></div>
    <fieldset class="prisma-count-grid"><legend>数量对账</legend><label><span>发现记录</span><input name="recordsFound" type="number" min="0" step="1" value="${item.recordsFound}"></label><label><span>去重移除</span><input name="duplicatesRemoved" type="number" min="0" step="1" value="${item.duplicatesRemoved}"></label><label><span>其他原因移除</span><input name="removedOther" type="number" min="0" step="1" value="${item.removedOther}"></label><label><span>导入项目</span><input name="recordsImported" type="number" min="0" step="1" value="${item.recordsImported}"></label></fieldset>
    <label class="screening-reason-field"><span>备注</span><textarea name="notes" maxlength="1000" placeholder="例如：语言限制、时间范围、导出文件名、检索人员…">${escapeHtml(item.notes)}</textarea></label>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">${batch ? '保存修改' : '添加批次'}</button></div></form>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]')?.addEventListener('click', () => renderPrismaModal(ctx));
  layer.querySelector('form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { sourceType: data.get('sourceType'), sourceName: data.get('sourceName'), searchedAt: data.get('searchedAt') || null, query: data.get('query'), recordsFound: Number(data.get('recordsFound')), duplicatesRemoved: Number(data.get('duplicatesRemoved')), removedOther: Number(data.get('removedOther')), recordsImported: Number(data.get('recordsImported')), notes: data.get('notes') };
    const path = batch ? `/projects/${encodeURIComponent(ctx.projectId)}/prisma/batches/${encodeURIComponent(batch.id)}` : `/projects/${encodeURIComponent(ctx.projectId)}/prisma/batches`;
    const action = await runButtonAction(event.submitter, { key: `prisma-batch:${batch?.id || 'new'}`, pendingLabel: '保存中…', errorPrefix: '检索批次保存失败' }, () => api(path, { method: batch ? 'PATCH' : 'POST', body: JSON.stringify(payload) }));
    if (!action.ok) return;
    ctx.screening.prisma = action.value.prisma;
    showNotice(batch ? '检索批次已更新。' : '检索批次已登记。');
    renderPrismaModal(ctx);
  });
}

function renderRetrievalReasonModal(ctx, paper, existingReason = '') {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<form class="modal-panel screening-decision-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Report retrieval</span><h2>记录无法获取全文的原因</h2><p class="modal-copy"><strong>${escapeHtml(paper.title)}</strong><br>该记录会进入 PRISMA“未获取报告”，但不会自动把文献判定为排除。</p><label class="screening-reason-field"><span>未获取原因</span><textarea id="retrieval-reason-input" maxlength="500" required placeholder="例如：作者未回复；馆际互借仍无法取得；原始链接失效…">${escapeHtml(existingReason)}</textarea></label><div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存获取状态</button></div></form>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModalLayer);
  layer.querySelector('form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const action = await runButtonAction(event.submitter, { key: `retrieval:${ctx.projectId}:${paper.id}`, pendingLabel: '保存中…', errorPrefix: '全文获取状态保存失败' }, () => api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paper.id)}/retrieval`, { method: 'PATCH', body: JSON.stringify({ status: 'not_retrieved', reason: layer.querySelector('#retrieval-reason-input').value.trim() }) }));
    if (!action.ok) return;
    closeModalLayer();
    showNotice('已记录无法获取全文的原因。');
    await openProjectDrawer(ctx.projectId);
  });
}

function screeningCriteriaText(criteria, kind) {
  return (criteria || []).filter(item => item.kind === kind).map(item => item.description ? `${item.label}｜${item.description}` : item.label).join('\n');
}

function parseScreeningCriteria(text, kind) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[｜|]/, 2);
    return { kind, label: parts[0].trim(), description: (parts[1] || '').trim(), enabled: true };
  });
}

function renderScreeningCriteriaModal(ctx) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<form class="modal-panel screening-criteria-modal" role="dialog" aria-modal="true" id="screening-criteria-form">
    <span class="composer-kicker">Eligibility criteria</span><h2>纳入与排除标准</h2>
    <p class="modal-copy">每行一条标准；可用“标准名称｜具体说明”记录操作性定义。标准属于当前项目，不会影响其他项目。</p>
    <div class="criteria-columns"><label><span class="criteria-kind include">＋ 纳入标准</span><textarea id="screening-include" maxlength="8000" placeholder="目标人群｜12–18 岁青少年\n研究设计｜实证研究">${escapeHtml(screeningCriteriaText(ctx.screening?.criteria, 'include'))}</textarea></label><label><span class="criteria-kind exclude">－ 排除标准</span><textarea id="screening-exclude" maxlength="8000" placeholder="非目标人群｜成人样本\n非实证研究｜社论、评论或方案">${escapeHtml(screeningCriteriaText(ctx.screening?.criteria, 'exclude'))}</textarea></label></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存标准</button></div>
  </form>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    const criteria = [
      ...parseScreeningCriteria(layer.querySelector('#screening-include').value, 'include'),
      ...parseScreeningCriteria(layer.querySelector('#screening-exclude').value, 'exclude'),
    ];
    try {
      button.disabled = true;
      await api(`/projects/${encodeURIComponent(ctx.projectId)}/screening/criteria`, { method: 'PUT', body: JSON.stringify({ criteria }) });
      closeModalLayer();
      showNotice(`已保存 ${criteria.length} 条纳入/排除标准。`);
      await openProjectDrawer(ctx.projectId);
    } catch (error) { button.disabled = false; showNotice(error.message, true); }
  });
}

function renderDualScreeningConfigModal(ctx) {
  closeModalLayer();
  const config = ctx.screening?.dualScreening?.config || { enabled: false, reviewerAName: '审查者 A', reviewerBName: '审查者 B' };
  const hasLegacy = (ctx.papers || []).some(paper => (paper.titleAbstractDecision || 'pending') !== 'pending' || (paper.fullTextDecision || 'pending') !== 'pending');
  const layer = openModalLayer();
  layer.innerHTML = `<form class="modal-panel dual-screening-config-modal" role="dialog" aria-modal="true">
    <span class="composer-kicker">Independent review</span><h2>双人筛选设置</h2><p class="modal-copy">两位审查者分别提交题录与全文判断。双方完成前不会展示对方的具体结论；冲突需仲裁后才形成最终结果。</p>
    <label class="dual-enable-row"><span><b>启用双人独立筛选</b><small>关闭后不会删除已经保存的双人记录</small></span><input type="checkbox" name="enabled" ${config.enabled ? 'checked' : ''}></label>
    <div class="dual-reviewer-names"><label><span><i>A</i>审查者 A</span><input name="reviewerAName" maxlength="60" value="${escapeAttr(config.reviewerAName)}" required></label><label><span><i>B</i>审查者 B</span><input name="reviewerBName" maxlength="60" value="${escapeAttr(config.reviewerBName)}" required></label></div>
    ${!config.enabled && hasLegacy ? '<label class="dual-import-row"><input type="checkbox" name="importLegacy" checked><span><b>把现有单人筛选结果导入审查者 A</b><small>只补充尚未存在的 A 记录，不改动现有结论</small></span></label>' : ''}
    <div class="dual-method-note"><b>统计口径</b><span>原始一致率与 Cohen’s κ 只使用两位审查者的原始成对判断；仲裁不会反向提高一致性。</span></div>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存设置</button></div>
  </form>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const button = event.submitter;
    const action = await runButtonAction(button, { key: `dual-config:${ctx.projectId}`, pendingLabel: '保存中…', errorPrefix: '双人筛选设置保存失败' }, () => api(`/projects/${encodeURIComponent(ctx.projectId)}/screening/dual-config`, {
      method: 'PUT', body: JSON.stringify({ enabled: data.get('enabled') === 'on', reviewerAName: data.get('reviewerAName'), reviewerBName: data.get('reviewerBName'), importLegacy: data.get('importLegacy') === 'on' }),
    }));
    if (!action.ok) return;
    closeModalLayer();
    showNotice(`${action.value.config.enabled ? '已启用' : '已关闭'}双人筛选${action.value.imported ? `，导入 ${action.value.imported} 条历史判断` : ''}。`);
    await openProjectDrawer(ctx.projectId);
  });
}

function renderDualScreeningDecisionModal(ctx, paper, stage, reviewerKey, existingReason = '') {
  closeModalLayer();
  const config = ctx.screening?.dualScreening?.config;
  const reviewerName = reviewerKey === 'a' ? config?.reviewerAName : config?.reviewerBName;
  const exclusionCriteria = (ctx.screening?.criteria || []).filter(item => item.kind === 'exclude' && item.enabled !== false);
  const layer = openModalLayer();
  layer.innerHTML = `<form class="modal-panel screening-decision-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Independent exclusion</span><h2>${escapeHtml(reviewerName)} · 记录排除理由</h2><p class="modal-copy"><strong>${escapeHtml(paper.title)}</strong><br>${stage === 'title_abstract' ? '题录与摘要' : '全文'}的独立判断只写入当前审查者记录。</p>${exclusionCriteria.length ? `<fieldset><legend>从项目排除标准选择</legend><div class="criteria-chips">${exclusionCriteria.map(item => `<button type="button" data-criterion-reason="${escapeAttr(item.label)}">${escapeHtml(item.label)}</button>`).join('')}</div></fieldset>` : ''}<label class="screening-reason-field"><span>排除理由</span><textarea id="screening-reason-input" maxlength="500" required>${escapeHtml(existingReason)}</textarea></label><div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存独立判断</button></div></form>`;
  document.body.append(layer);
  const input = layer.querySelector('#screening-reason-input');
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-criterion-reason]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.criterionReason; input.focus(); }));
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const action = await runButtonAction(event.submitter, { key: `dual-review:${ctx.projectId}:${paper.id}:${stage}:${reviewerKey}`, pendingLabel: '保存中…', errorPrefix: '独立判断保存失败' }, () => api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paper.id)}/screening/reviews/${reviewerKey}`, { method: 'PATCH', body: JSON.stringify({ stage, decision: 'exclude', reason: input.value.trim() }) }));
    if (!action.ok) return;
    closeModalLayer(); showNotice(`${reviewerName}的排除判断已保存。`); await openProjectDrawer(ctx.projectId);
  });
}

function renderScreeningConflictModal(ctx, paperId, stage) {
  closeModalLayer();
  const dual = ctx.screening?.dualScreening;
  const item = dual?.byPaper?.[paperId]?.[stage === 'title_abstract' ? 'titleAbstract' : 'fullText'];
  const paper = ctx.papers.find(entry => entry.id === paperId);
  if (!item || !paper) return;
  const config = dual.config;
  const layer = openModalLayer();
  const reviewCard = (key, name) => `<article class="conflict-review ${escapeAttr(item[key].decision)}"><span>${escapeHtml(name)}</span><b>${SCREENING_DECISION_LABELS[item[key].decision]}</b><p>${escapeHtml(item[key].reason || '未填写补充理由')}</p></article>`;
  layer.innerHTML = `<form class="modal-panel screening-conflict-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Consensus meeting</span><h2>筛选冲突仲裁</h2><p class="modal-copy"><strong>${escapeHtml(paper.title)}</strong><br>${stage === 'title_abstract' ? '题录与摘要' : '全文'}阶段的两份原始判断会永久保留，仲裁只生成最终结论。</p><div class="conflict-comparison">${reviewCard('a', config.reviewerAName)}<i>≠</i>${reviewCard('b', config.reviewerBName)}</div><label class="screening-reason-field"><span>最终结论</span><select name="decision">${['include', 'maybe', 'exclude'].map(value => `<option value="${value}">${SCREENING_DECISION_LABELS[value]}</option>`).join('')}</select></label><label class="screening-reason-field"><span>最终排除理由（选择排除时必填）</span><input name="reason" maxlength="500" placeholder="例如：非目标人群"></label><label class="screening-reason-field"><span>仲裁记录</span><textarea name="resolutionNote" maxlength="1000" placeholder="简要记录讨论依据、采用哪一方判断或补充核对结果…"></textarea></label><div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">保存仲裁结论</button></div></form>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const action = await runButtonAction(event.submitter, { key: `dual-resolve:${ctx.projectId}:${paperId}:${stage}`, pendingLabel: '保存中…', errorPrefix: '冲突仲裁失败' }, () => api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paperId)}/screening/resolve`, { method: 'POST', body: JSON.stringify({ stage, decision: data.get('decision'), reason: data.get('reason'), resolutionNote: data.get('resolutionNote') }) }));
    if (!action.ok) return;
    closeModalLayer(); showNotice('冲突已仲裁，最终结论已写入项目筛选结果。'); await openProjectDrawer(ctx.projectId);
  });
}

function renderDualConflictQueue(ctx) {
  const conflicts = ctx.screening?.dualScreening?.conflicts || [];
  if (!conflicts.length) { showNotice('当前没有待仲裁的筛选冲突。'); return; }
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel dual-conflict-queue" role="dialog" aria-modal="true"><span class="composer-kicker">Conflict queue</span><h2>待仲裁冲突 · ${conflicts.length}</h2><p class="modal-copy">按文献逐项核对两位审查者的判断，再形成最终结论。</p><div>${conflicts.map((item, index) => `<article><span>${item.stage === 'title_abstract' ? '题录 / 摘要' : '全文'}</span><strong>${escapeHtml(item.title)}</strong><p><b>${escapeHtml(ctx.screening.dualScreening.config.reviewerAName)}：${SCREENING_DECISION_LABELS[item.a.decision]}</b><i>vs</i><b>${escapeHtml(ctx.screening.dualScreening.config.reviewerBName)}：${SCREENING_DECISION_LABELS[item.b.decision]}</b></p><button type="button" class="button primary" data-resolve-index="${index}">开始仲裁</button></article>`).join('')}</div><div class="composer-actions"><button type="button" class="button" data-modal-cancel>关闭</button></div></div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-resolve-index]').forEach(button => button.addEventListener('click', () => { const item = conflicts[Number(button.dataset.resolveIndex)]; renderScreeningConflictModal(ctx, item.paperId, item.stage); }));
}

function renderScreeningDecisionModal(ctx, paper, stage, existingReason = '') {
  closeModalLayer();
  const layer = openModalLayer();
  const exclusionCriteria = (ctx.screening?.criteria || []).filter(item => item.kind === 'exclude' && item.enabled !== false);
  layer.innerHTML = `<form class="modal-panel screening-decision-modal" role="dialog" aria-modal="true">
    <span class="composer-kicker">Exclusion record</span><h2>记录排除理由</h2>
    <p class="modal-copy"><strong>${escapeHtml(paper.title)}</strong><br>${stage === 'title_abstract' ? '题录与摘要筛选' : '全文筛选'}的排除判断将保留在当前项目中。</p>
    ${exclusionCriteria.length ? `<fieldset><legend>从项目排除标准选择</legend><div class="criteria-chips">${exclusionCriteria.map(item => `<button type="button" data-criterion-reason="${escapeAttr(item.label)}">${escapeHtml(item.label)}</button>`).join('')}</div></fieldset>` : '<p class="screening-empty-criteria">尚未设置排除标准；可先填写自定义理由，之后在筛选进度卡中统一管理标准。</p>'}
    <label class="screening-reason-field"><span>排除理由</span><textarea id="screening-reason-input" maxlength="500" required placeholder="说明该文献不符合哪一条标准…">${escapeHtml(existingReason)}</textarea></label>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">确认排除</button></div>
  </form>`;
  document.body.append(layer);
  const input = layer.querySelector('#screening-reason-input');
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-criterion-reason]').forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.criterionReason;
    input.focus();
  }));
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    try {
      button.disabled = true;
      await api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paper.id)}/screening`, { method: 'PATCH', body: JSON.stringify({ stage, decision: 'exclude', reason: input.value.trim() }) });
      closeModalLayer();
      showNotice('排除判断与理由已保存。');
      await openProjectDrawer(ctx.projectId);
    } catch (error) { button.disabled = false; showNotice(error.message, true); }
  });
}

function renderScreeningBatchExclusionModal(ctx, paperIds, stage) {
  closeModalLayer();
  const layer = openModalLayer();
  const exclusionCriteria = (ctx.screening?.criteria || []).filter(item => item.kind === 'exclude' && item.enabled !== false);
  layer.innerHTML = `<form class="modal-panel screening-decision-modal" role="dialog" aria-modal="true"><span class="composer-kicker">Batch exclusion</span><h2>批量排除 ${paperIds.length} 篇文献</h2><p class="modal-copy">同一理由将写入所选文献的${stage === 'title_abstract' ? '题录与摘要' : '全文'}筛选记录。</p>${exclusionCriteria.length ? `<fieldset><legend>从项目排除标准选择</legend><div class="criteria-chips">${exclusionCriteria.map(item => `<button type="button" data-criterion-reason="${escapeAttr(item.label)}">${escapeHtml(item.label)}</button>`).join('')}</div></fieldset>` : ''}<label class="screening-reason-field"><span>共同排除理由</span><textarea id="screening-reason-input" maxlength="500" required></textarea></label><div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="submit" class="button primary">确认批量排除</button></div></form>`;
  document.body.append(layer);
  const input = layer.querySelector('#screening-reason-input');
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelectorAll('[data-criterion-reason]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.criterionReason; input.focus(); }));
  layer.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    try {
      button.disabled = true;
      await api(`/projects/${encodeURIComponent(ctx.projectId)}/screening/batch`, { method: 'POST', body: JSON.stringify({ paperIds, stage, decision: 'exclude', reason: input.value.trim() }) });
      closeModalLayer();
      showNotice(`已批量排除 ${paperIds.length} 篇文献。`);
      await openProjectDrawer(ctx.projectId);
    } catch (error) { button.disabled = false; showNotice(error.message, true); }
  });
}

function drawerRelationsHtml(projectId, relations, papers) {
  return `<details class="drawer-relations drawer-disclosure" id="drawer-relations"><summary><span>论证链</span><b>${relations.length} 条关系</b></summary><div class="drawer-disclosure-body"><div class="section-heading-row"><p class="drawer-empty-hint">用支持、反驳和引用关系组织证据。</p><button type="button" class="chip-small" data-relation-open-add>＋ 建立关系</button></div>${relations.length ? `<ul class="relation-list">${relations.map(rel => `<li class="relation-item" data-relation-id="${escapeAttr(rel.id)}"><span class="relation-flow"><b>${escapeHtml(rel.fromTitle)}</b> <em class="relation-kind ${escapeAttr(rel.relation)}">${RELATION_LABELS[rel.relation]}</em> <b>${escapeHtml(rel.toTitle)}</b></span>${rel.note ? `<small>${escapeHtml(rel.note)}</small>` : ''}<button type="button" class="chip-small" data-relation-remove="${escapeAttr(rel.id)}" title="删除该关系">×</button></li>`).join('')}</ul>` : ''}<div class="drawer-tools"><button type="button" class="button" data-evidence-matrix-open>证据矩阵</button><button type="button" class="button" data-export-notes-open>导出笔记</button></div></div></details>`;
}

function drawerNotesHtml(projectId, notes, papers) {
  const projectNotes = notes.filter(note => !(Array.isArray(note.tags) && note.tags.includes('研究任务')));
  return `<div class="drawer-notes-section" id="drawer-notes-section"><h3>项目笔记<span data-note-count>${projectNotes.length ? ` ${projectNotes.length} 条` : ''}</span></h3><form id="drawer-note-form" class="drawer-note-form"><label class="sr-only" for="drawer-note-content">项目笔记内容</label><textarea id="drawer-note-content" maxlength="10000" placeholder="记录研究思路、发现或评论（可关联另一篇文献作对比）…"></textarea><div class="drawer-note-row"><label for="drawer-note-linked" class="sr-only">关联文献</label><select id="drawer-note-linked" title="关联另一篇项目内文献（跨文献对比）"><option value="">关联文献（可选）</option>${papers.map(paper => `<option value="${escapeAttr(paper.id)}">${escapeHtml(paper.title.slice(0, 40))}</option>`).join('')}</select><button type="submit" class="button primary">保存笔记</button></div></form><div class="drawer-note-list">${projectNotes.slice(0, 50).map(noteItemHtml).join('') || '<p class="drawer-empty-hint note-empty">还没有项目笔记。记录一个研究判断或跨文献比较。</p>'}</div></div>`;
}

const ROB_JUDGMENT_LABELS = { pending:'未评定',low:'低风险',some_concerns:'部分担忧',high:'高风险',moderate:'中等风险',serious:'严重风险',critical:'极严重风险',no_information:'信息不足' };
const GRADE_CERTAINTY_LABELS = { 1:'极低',2:'低',3:'中等',4:'高' };

function renderQualityWorkbench(quality) {
  if (!quality) return '';
  const s = quality.summary || {};
  const grade = quality.gradeOutcomes || [];
  return `<section class="quality-entry"><div><span class="composer-kicker">QUALITY OF EVIDENCE</span><h3>质量评定与证据确定性</h3><p>${escapeHtml(quality.template?.label || '')} · 结局级评定；${quality.config?.dualEnabled ? '双人独立评定已启用' : '当前为单人评定'}</p></div><div class="quality-entry-metrics"><span><b>${s.complete || 0}</b><small>/ ${s.total || 0} 已完成</small></span><span class="${s.conflicts ? 'danger' : ''}"><b>${s.conflicts || 0}</b><small>待裁决</small></span><span><b>${grade.length}</b><small>GRADE 结局</small></span></div><button type="button" class="button primary" data-quality-open>打开质量评定台</button></section>`;
}

function qualityJudgmentOptions(template, current = 'pending') {
  return ['pending', ...(template?.judgments || [])].map(value => `<option value="${escapeAttr(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(ROB_JUDGMENT_LABELS[value] || value)}</option>`).join('');
}

function renderQualityModal(ctx) {
  closeModalLayer();
  const q = ctx.quality;
  const layer = openModalLayer();
  const paperRows = q.papers.map(item => `<article class="quality-paper-row"><div><span>${escapeHtml(item.outcomeLabel)}</span><strong>${escapeHtml(item.title)}</strong></div><div class="rob-domain-lights">${item.domains.map(domain => `<i class="rob-light ${escapeAttr(domain.finalJudgment || (domain.conflict ? 'conflict' : 'pending'))}" title="${escapeAttr(domain.label)}：${escapeAttr(ROB_JUDGMENT_LABELS[domain.finalJudgment] || (domain.conflict ? '冲突' : '未完成'))}">${escapeHtml(domain.label.slice(0,2))}</i>`).join('')}</div><span class="rob-overall ${escapeAttr(item.overall || (item.conflicts ? 'conflict' : 'pending'))}">${escapeHtml(item.conflicts ? `${item.conflicts} 项冲突` : ROB_JUDGMENT_LABELS[item.overall] || '未完成')}</span><button type="button" class="button" data-rob-edit="${escapeAttr(item.paperId)}">评定</button></article>`).join('');
  const gradeRows = q.gradeOutcomes.map(item => `<article class="grade-outcome-row"><div><span>${item.importance === 'critical' ? '关键结局' : item.importance === 'important' ? '重要结局' : '非重要结局'} · ${item.studies ?? '—'} 项研究</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.effectEstimate || '尚未填写效应估计')}</p></div><span class="grade-certainty grade-${item.confirmedCertainty || item.suggestedCertainty}"><small>${item.confirmedCertainty ? '已确认' : '建议'}</small><b>${GRADE_CERTAINTY_LABELS[item.confirmedCertainty || item.suggestedCertainty]}</b></span><button type="button" class="button" data-grade-edit="${escapeAttr(item.id)}">编辑</button></article>`).join('');
  layer.innerHTML = `<div class="modal-panel quality-modal" role="dialog" aria-modal="true"><header class="quality-modal-head"><div><span class="composer-kicker">Methodological adjudication board</span><h2>质量评定台</h2><p>把原始判断、分歧与最终裁决放在同一条可追溯链上。</p></div><button type="button" class="modal-icon-close" data-modal-cancel aria-label="关闭">×</button></header><section class="quality-config-strip"><label><span>评定工具</span><select data-quality-template>${q.templates.map(t=>`<option value="${escapeAttr(t.id)}" ${q.config.templateId===t.id?'selected':''}>${escapeHtml(t.label)}${t.status==='draft'?' · 草案':''}</option>`).join('')}</select></label><label class="quality-dual-toggle"><input type="checkbox" data-quality-dual ${q.config.dualEnabled?'checked':''}><span>双人独立评定</span></label><label><span>A</span><input data-quality-reviewer-a maxlength="60" value="${escapeAttr(q.config.reviewerAName)}"></label><label><span>B</span><input data-quality-reviewer-b maxlength="60" value="${escapeAttr(q.config.reviewerBName)}"></label><button class="button" type="button" data-quality-config-save>保存设置</button></section><nav class="quality-tabs"><button type="button" class="active" data-quality-tab="rob">风险偏倚 <b>${q.summary.complete}/${q.summary.total}</b></button><button type="button" data-quality-tab="grade">GRADE <b>${q.gradeOutcomes.length}</b></button></nav><section class="quality-tab-panel active" data-quality-panel="rob"><div class="quality-tool-note"><b>${escapeHtml(q.template.label)}</b><span>${escapeHtml(q.template.description)}${q.template.status==='draft'?' 当前版本仍为官方草案，请在报告中标明版本。':''}</span><div><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/quality/export?format=rob-csv`))}" download>导出评定 CSV</a><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/quality/export?format=json`))}" download>完整审计 JSON</a></div></div><div class="quality-paper-list">${paperRows || '<p class="quality-empty">项目中还没有可评定文献。</p>'}</div></section><section class="quality-tab-panel" data-quality-panel="grade"><div class="quality-tool-note"><b>按关键或重要结局评定</b><span>系统根据研究设计及升降级领域给出建议，最终等级需要研究者确认。</span><div><button type="button" class="button primary" data-grade-add>＋ 新增结局</button><a class="button" href="${escapeAttr(apiUrl(`/projects/${encodeURIComponent(ctx.projectId)}/quality/export?format=grade-csv`))}" download>导出证据概况 CSV</a></div></div><div class="grade-outcome-list">${gradeRows || '<p class="quality-empty">尚无 GRADE 结局。先添加综述中的关键结局。</p>'}</div></section><footer class="composer-actions"><span>${q.config.dualEnabled ? `两位评定者分别保存原始记录，双方提交后界面再展开差异与裁决入口。` : '可在上方启用双人独立评定。'}</span><button type="button" class="button" data-modal-cancel>关闭</button></footer></div>`;
  document.body.append(layer);
  layer.querySelectorAll('[data-modal-cancel]').forEach(btn=>btn.addEventListener('click',closeModalLayer));
  layer.querySelectorAll('[data-quality-tab]').forEach(btn=>btn.addEventListener('click',()=>{ layer.querySelectorAll('[data-quality-tab]').forEach(x=>x.classList.toggle('active',x===btn)); layer.querySelectorAll('[data-quality-panel]').forEach(x=>x.classList.toggle('active',x.dataset.qualityPanel===btn.dataset.qualityTab)); }));
  layer.querySelector('[data-quality-config-save]').addEventListener('click',async event=>{ const action=await runButtonAction(event.currentTarget,{key:`quality-config:${ctx.projectId}`,pendingLabel:'保存中…',errorPrefix:'质量评定设置保存失败'},()=>api(`/projects/${encodeURIComponent(ctx.projectId)}/quality/config`,{method:'PUT',body:JSON.stringify({templateId:layer.querySelector('[data-quality-template]').value,dualEnabled:layer.querySelector('[data-quality-dual]').checked,reviewerAName:layer.querySelector('[data-quality-reviewer-a]').value,reviewerBName:layer.querySelector('[data-quality-reviewer-b]').value})})); if(action.ok){ctx.quality=action.value.quality;renderQualityModal(ctx);} });
  layer.querySelectorAll('[data-rob-edit]').forEach(btn=>btn.addEventListener('click',()=>renderRobEditor(ctx,btn.dataset.robEdit)));
  layer.querySelector('[data-grade-add]')?.addEventListener('click',()=>renderGradeEditor(ctx,null));
  layer.querySelectorAll('[data-grade-edit]').forEach(btn=>btn.addEventListener('click',()=>renderGradeEditor(ctx,btn.dataset.gradeEdit)));
}

function renderRobEditor(ctx,paperId){
  closeModalLayer(); const q=ctx.quality; const item=q.byPaper[paperId]; if(!item)return;
  const layer=openModalLayer();
  const reviewerButtons=q.config.dualEnabled?`<div class="quality-reviewer-switch"><button type="button" class="active" data-rob-reviewer="a">A · ${escapeHtml(q.config.reviewerAName)}</button><button type="button" data-rob-reviewer="b">B · ${escapeHtml(q.config.reviewerBName)}</button></div>`:'';
  const renderForm=(reviewer='a')=>{ const peer=reviewer==='a'?'b':'a'; return `<form class="rob-editor-form"><label class="rob-outcome-label"><span>本次评定对应的结局</span><input name="outcomeLabel" maxlength="160" value="${escapeAttr(item.outcomeLabel)}"></label><div class="rob-domain-editor">${item.domains.map(domain=>{const own=domain[reviewer];const peerReview=domain[peer];const reveal=q.config.dualEnabled&&own?.judgment&&own.judgment!=='pending'&&peerReview?.judgment&&peerReview.judgment!=='pending';return `<article data-rob-domain="${escapeAttr(domain.id)}"><header><b>${escapeHtml(domain.label)}</b>${domain.conflict?'<span class="conflict">判断冲突</span>':domain.resolution?'<span class="resolved">已裁决</span>':''}</header><label><span>领域判断</span><select name="judgment">${qualityJudgmentOptions(q.template,own?.judgment||'pending')}</select></label><label><span>支持依据 / 页码</span><textarea name="support" maxlength="2000" placeholder="记录研究报告中的支持信息、页码与判断理由…">${escapeHtml(own?.support||'')}</textarea></label>${q.config.dualEnabled?`<p class="rob-peer-state">${reveal?`另一位：${escapeHtml(ROB_JUDGMENT_LABELS[peerReview.judgment])}`:peerReview?.judgment&&peerReview.judgment!=='pending'?'另一位已提交；你提交后显示结果。':'另一位尚未提交。'}</p>`:''}${domain.conflict?`<div class="rob-resolution"><select data-resolution-judgment>${q.template.judgments.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(ROB_JUDGMENT_LABELS[v])}</option>`).join('')}</select><input data-resolution-note maxlength="2000" placeholder="填写裁决依据（必填）"><button type="button" class="button" data-rob-resolve>保存裁决</button></div>`:''}</article>`}).join('')}</div><div class="composer-actions"><button type="button" class="button" data-back-quality>返回总览</button><button type="submit" class="button primary">保存 ${reviewer==='a'?escapeHtml(q.config.reviewerAName):escapeHtml(q.config.reviewerBName)} 的判断</button></div></form>`; };
  layer.innerHTML=`<div class="modal-panel rob-editor-modal"><header class="quality-modal-head"><div><span class="composer-kicker">Outcome-level risk of bias</span><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(q.template.label)} · 总体判断由各领域最终结论汇总，不覆盖原始判断。</p></div><button type="button" class="modal-icon-close" data-modal-cancel>×</button></header>${reviewerButtons}<div data-rob-form-host>${renderForm('a')}</div></div>`;document.body.append(layer);
  let reviewer='a'; const bind=()=>{const form=layer.querySelector('.rob-editor-form');form.querySelector('[data-back-quality]').addEventListener('click',()=>renderQualityModal(ctx));form.addEventListener('submit',async e=>{e.preventDefault();const domains=[...form.querySelectorAll('[data-rob-domain]')].map(row=>({domainId:row.dataset.robDomain,judgment:row.querySelector('[name=judgment]').value,support:row.querySelector('[name=support]').value}));const action=await runButtonAction(e.submitter,{key:`rob:${ctx.projectId}:${paperId}:${reviewer}`,pendingLabel:'保存中…',errorPrefix:'质量判断保存失败'},()=>api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paperId)}/quality/reviews`,{method:'PUT',body:JSON.stringify({reviewerKey:reviewer,outcomeLabel:form.elements.outcomeLabel.value,domains})}));if(action.ok){ctx.quality=action.value.quality;renderRobEditor(ctx,paperId);}});form.querySelectorAll('[data-rob-resolve]').forEach(btn=>btn.addEventListener('click',async()=>{const row=btn.closest('[data-rob-domain]');const action=await runButtonAction(btn,{key:`rob-resolve:${paperId}:${row.dataset.robDomain}`,pendingLabel:'裁决中…',errorPrefix:'裁决保存失败'},()=>api(`/projects/${encodeURIComponent(ctx.projectId)}/papers/${encodeURIComponent(paperId)}/quality/resolve`,{method:'POST',body:JSON.stringify({domainId:row.dataset.robDomain,judgment:row.querySelector('[data-resolution-judgment]').value,resolutionNote:row.querySelector('[data-resolution-note]').value})}));if(action.ok){ctx.quality=action.value.quality;renderRobEditor(ctx,paperId);}}));};bind();
  layer.querySelector('[data-modal-cancel]').addEventListener('click',closeModalLayer);layer.querySelectorAll('[data-rob-reviewer]').forEach(btn=>btn.addEventListener('click',()=>{reviewer=btn.dataset.robReviewer;layer.querySelectorAll('[data-rob-reviewer]').forEach(x=>x.classList.toggle('active',x===btn));layer.querySelector('[data-rob-form-host]').innerHTML=renderForm(reviewer);bind();}));
}

function renderGradeEditor(ctx,outcomeId){
  closeModalLayer();const current=ctx.quality.gradeOutcomes.find(x=>x.id===outcomeId)||null;const layer=openModalLayer();
  const domainRows=ctx.quality.gradeDomains.map(domain=>{const value=current?.domains?.[domain.id]||{level:0,rationale:''};const levels=domain.direction==='down'?[0,-1,-2]:[0,1,2];return `<article data-grade-domain="${escapeAttr(domain.id)}"><b>${escapeHtml(domain.label)}</b><select>${levels.map(n=>`<option value="${n}" ${value.level===n?'selected':''}>${n===0?'不调整':n>0?`上调 ${n} 级`:`下调 ${Math.abs(n)} 级`}</option>`).join('')}</select><input maxlength="2000" value="${escapeAttr(value.rationale)}" placeholder="说明依据…"></article>`}).join('');
  layer.innerHTML=`<form class="modal-panel grade-editor-modal"><span class="composer-kicker">GRADE certainty assessment</span><h2>${current?'编辑结局':'新增结局'}</h2><p class="modal-copy">先记录每个领域的依据，再确认最终证据确定性。系统建议只是计算辅助。</p><div class="grade-meta-grid"><label><span>结局名称</span><input name="title" required maxlength="200" value="${escapeAttr(current?.title||'')}"></label><label><span>重要性</span><select name="importance">${[['critical','关键'],['important','重要'],['not_important','非重要']].map(([v,l])=>`<option value="${v}" ${current?.importance===v?'selected':''}>${l}</option>`).join('')}</select></label><label><span>证据起点</span><select name="studyDesign">${[['randomized','随机研究 · 高'],['observational','观察研究 · 低'],['other','其他 · 中等']].map(([v,l])=>`<option value="${v}" ${current?.studyDesign===v?'selected':''}>${l}</option>`).join('')}</select></label><label><span>研究数</span><input name="studies" type="number" min="0" value="${current?.studies??''}"></label><label><span>参与者</span><input name="participants" type="number" min="0" value="${current?.participants??''}"></label><label class="wide"><span>效应估计</span><input name="effectEstimate" maxlength="500" value="${escapeAttr(current?.effectEstimate||'')}" placeholder="例如：SMD = 0.42（95% CI 0.18–0.66）"></label></div><div class="grade-domain-editor">${domainRows}</div><div class="grade-confirm"><label><span>最终确定性</span><select name="confirmedCertainty"><option value="">暂不确认（保留系统建议）</option>${[4,3,2,1].map(n=>`<option value="${n}" ${current?.confirmedCertainty===n?'selected':''}>${GRADE_CERTAINTY_LABELS[n]}</option>`).join('')}</select></label><label><span>确认说明</span><textarea name="confirmationNote" maxlength="2000">${escapeHtml(current?.confirmationNote||'')}</textarea></label></div><div class="composer-actions">${current?'<button type="button" class="button danger" data-grade-delete>删除结局</button>':''}<button type="button" class="button" data-back-quality>取消</button><button type="submit" class="button primary">保存结局评定</button></div></form>`;document.body.append(layer);
  layer.querySelector('[data-back-quality]').addEventListener('click',()=>renderQualityModal(ctx));layer.querySelector('[data-grade-delete]')?.addEventListener('click',async e=>{if(!(await confirmDialog({title:'删除 GRADE 结局',message:'将删除该结局及其全部领域判断，不可恢复。',confirmLabel:'删除结局',danger:true})))return;const action=await runButtonAction(e.currentTarget,{key:`grade-delete:${outcomeId}`,pendingLabel:'删除中…',errorPrefix:'删除失败'},()=>api(`/projects/${encodeURIComponent(ctx.projectId)}/grade/outcomes/${encodeURIComponent(outcomeId)}`,{method:'DELETE'}));if(action.ok){ctx.quality=await api(`/projects/${encodeURIComponent(ctx.projectId)}/quality`);renderQualityModal(ctx);}});
  layer.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const domains=[...form.querySelectorAll('[data-grade-domain]')].map(row=>({domainId:row.dataset.gradeDomain,level:Number(row.querySelector('select').value),rationale:row.querySelector('input').value}));const body={title:form.elements.title.value,importance:form.elements.importance.value,studyDesign:form.elements.studyDesign.value,studies:form.elements.studies.value,participants:form.elements.participants.value,effectEstimate:form.elements.effectEstimate.value,confirmedCertainty:form.elements.confirmedCertainty.value,confirmationNote:form.elements.confirmationNote.value,domains};const url=outcomeId?`/projects/${encodeURIComponent(ctx.projectId)}/grade/outcomes/${encodeURIComponent(outcomeId)}`:`/projects/${encodeURIComponent(ctx.projectId)}/grade/outcomes`;const action=await runButtonAction(e.submitter,{key:`grade-save:${outcomeId||'new'}`,pendingLabel:'保存中…',errorPrefix:'GRADE 评定保存失败'},()=>api(url,{method:outcomeId?'PUT':'POST',body:JSON.stringify(body)}));if(action.ok){ctx.quality=await api(`/projects/${encodeURIComponent(ctx.projectId)}/quality`);renderQualityModal(ctx);}});
}

function noteItemHtml(note) {
  return `<article class="drawer-note-item" data-note-id="${escapeAttr(note.id)}"><div class="drawer-note-meta"><span>${escapeHtml(note.paperTitle || '项目通用')}${note.pageNumber ? ` · 第 ${note.pageNumber} 页` : ''}</span>${note.linkedPaperTitle ? `<span class="note-linked" title="跨文献关联">↔ ${escapeHtml(note.linkedPaperTitle)}</span>` : ''}${note.tags?.length ? `<span class="note-tags">${note.tags.map(tag => `#${escapeHtml(tag)}`).join(' ')}</span>` : ''}</div><p>${escapeHtml(note.content.slice(0, 200))}${note.content.length > 200 ? '…' : ''}</p><button type="button" class="chip-small" data-note-remove="${escapeAttr(note.id)}" title="删除这条笔记">删除</button></article>`;
}

function renderDrawer(ctx) {
  const { project, projectId, papers, notes, relations, stats } = ctx;
  const taskAndNoteCount = Number(stats.tasks.total || 0) + Number(stats.evidence.notes || 0);
  const noteCountEl = stats.tasks.todo ? `<span class="tab-count attn" title="${stats.tasks.todo} 个待办任务，${stats.evidence.notes || 0} 条项目笔记">${taskAndNoteCount}</span>` : `<span class="tab-count" title="${stats.tasks.total || 0} 个任务，${stats.evidence.notes || 0} 条项目笔记">${taskAndNoteCount}</span>`;
  const statusLabel = ({ active: '进行中', done: '已完成', archived: '已归档' })[project.status] || '进行中';
  const projectCopy = project.description || (project.projectType ? `${project.projectType}项目 · 围绕当前研究问题持续整理文献、证据与研究判断。` : '围绕当前研究问题持续整理文献、证据与研究判断。');
  const recent = project.updatedAt ? String(project.updatedAt).slice(0, 10) : '暂无记录';
  return `<article class="native-project-detail">
  <header class="project-detail-head">
    <div class="detail-breadcrumb"><button type="button" class="drawer-close">← 项目库</button><span>/</span><span>${escapeHtml(project.title)}</span></div>
    <details class="project-more">
      <summary aria-label="更多项目操作">更多 <span>···</span></summary>
      <div class="project-more-menu">
        <button type="button" id="project-summary">生成综述草稿</button>
        <button type="button" id="screening-criteria">纳入/排除标准</button>
        <button type="button" id="evidence-fields">研究编码字段</button>
        <button type="button" id="evidence-matrix">证据矩阵</button>
        <button type="button" id="quality-workbench">质量评定 / GRADE</button>
        <button type="button" id="export-notes">导出笔记</button>
        <label class="project-more-upload">上传 PDF<input type="file" accept="application/pdf,.pdf" data-upload-pdf hidden></label>
        <div class="project-more-settings"><label>项目类型<select data-project-type>${['', '综述', '实证研究', '元分析', '量表开发', '课程作业'].map(type => `<option value="${escapeAttr(type)}" ${project.projectType === type ? 'selected' : ''}>${escapeHtml(type || '未分类')}</option>`).join('')}</select></label><label>项目状态<select data-project-status>${[['active', '进行中'], ['done', '已完成'], ['archived', '已归档']].map(([value, label]) => `<option value="${value}" ${project.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      </div>
    </details>
    <div class="detail-title-row"><h2>${escapeHtml(project.title)}</h2><span class="project-status ${escapeAttr(project.status || 'active')}">${statusLabel}</span></div>
    <p>${escapeHtml(projectCopy)}</p>
  </header>
  <nav class="drawer-tabs" role="tablist" aria-label="项目视图">
    <button type="button" role="tab" data-drawer-tab="overview">概览</button>
    <button type="button" role="tab" data-drawer-tab="evidence">证据<span class="tab-count">${papers.length}</span></button>
    <button type="button" role="tab" data-drawer-tab="tasks">任务与笔记${noteCountEl}</button>
  </nav>
  <div class="project-detail-layout"><main class="project-detail-main">
  <section class="drawer-tab-panel" data-drawer-tabpanel="overview">
    ${renderNextStepCard(ctx)}
    ${renderProjectSnapshot(ctx)}
    <details class="drawer-disclosure cockpit-disclosure"><summary><span>研究诊断</span><b>副驾驶建议与研究闭环</b></summary><div class="drawer-disclosure-body">${renderCopilot(ctx)}${renderResearchPipeline(ctx)}</div></details>
  </section>
  <section class="drawer-tab-panel" data-drawer-tabpanel="evidence">
    ${renderScreeningWorkbench(ctx.screening)}
    ${renderCodingWorkbench(ctx.coding)}
    ${renderQualityWorkbench(ctx.quality)}
    <div class="drawer-role-row" id="drawer-roles"><button class="chip active" data-drawer-role-filter="全部">全部角色</button>${[['core', '核心文献'], ['background', '背景'], ['method', '方法参考'], ['compare', '结果对比'], ['', '未标记']].map(([value, label]) => `<button class="chip" data-drawer-role-filter="${escapeAttr(value)}">${label}</button>`).join('')}</div>
    <div class="drawer-papers">${papers.map(paper => drawerPaperCardHtml(paper, ctx.coding, ctx.screening)).join('')}</div>
    ${drawerRelationsHtml(projectId, relations, papers)}
  </section>
  <section class="drawer-tab-panel" data-drawer-tabpanel="tasks">
    ${renderProjectTaskPanel(projectId, project.title, notes, papers)}
    ${drawerNotesHtml(projectId, notes, papers)}
  </section></main>
  <aside class="project-context" aria-label="项目上下文">
    <h3>项目上下文</h3>
    <dl><div><dt>文献</dt><dd>${stats.papers.total} 篇</dd></div><div><dt>待读</dt><dd>${Math.max(0, stats.papers.total - stats.papers.read)} 篇</dd></div><div><dt>待办任务</dt><dd>${stats.tasks.todo || 0} 项</dd></div><div><dt>项目笔记</dt><dd>${stats.evidence.notes || 0} 条</dd></div><div><dt>最后更新</dt><dd>${escapeHtml(recent)}</dd></div></dl>
    <button type="button" class="button agent-handoff-button context-agent" data-project-agent>◆ 交给 Agent</button>
    <p>Agent 会读取当前项目上下文；写入操作仍需你确认。</p>
  </aside></div></article>`;
}

function bindDrawer(panel, ctx) {
  const { projectId, papers, notes, relations } = ctx;
  const projectMore = panel.querySelector('.project-more');
  panel.addEventListener('click', event => {
    if (projectMore?.open && !event.target.closest('.project-more')) projectMore.removeAttribute('open');
  });
  panel.querySelector('.project-more-menu')?.addEventListener('click', event => {
    if (event.target.closest('button')) projectMore?.removeAttribute('open');
  });
  // 页签切换
  panel.querySelectorAll('[data-drawer-tab]').forEach(btn => btn.addEventListener('click', () => switchDrawerTab(panel, btn.dataset.drawerTab)));
  // 下一步卡折叠
  const nextCard = panel.querySelector('[data-next-step]');
  panel.querySelector('[data-next-toggle]')?.addEventListener('click', () => {
    const willCollapse = !nextCard.classList.contains('collapsed');
    nextCard.classList.toggle('collapsed', willCollapse);
    try { localStorage.setItem(nextStepCollapsedKey(projectId), willCollapse ? '1' : '0'); } catch { /* ignore */ }
  });
  panel.querySelectorAll('[data-next-primary]').forEach(btn => btn.addEventListener('click', () => {
    const type = btn.dataset.action;
    if (type === 'reader' && btn.dataset.attachment) openPdfReader(projectId, btn.dataset.attachment);
    else if (type === 'tasks') switchDrawerTab(panel, 'tasks');
    else if (type === 'evidence') switchDrawerTab(panel, 'evidence');
    else if (type === 'upload') panel.querySelector('[data-upload-pdf]')?.click();
  }));
  panel.querySelectorAll('[data-snapshot-reader]').forEach(button => button.addEventListener('click', () => openPdfReader(projectId, button.dataset.snapshotReader)));
  panel.querySelector('[data-snapshot-tasks]')?.addEventListener('click', () => switchDrawerTab(panel, 'tasks'));
  // 副驾驶
  const bindCopilot = () => {
    panel.querySelectorAll('[data-copilot-basis]').forEach(btn => {
      btn.onclick = null;
      btn.addEventListener('click', () => {
        const item = btn.closest('[data-copilot-id]');
        const sug = buildCopilotSuggestions(ctx).find(s => s.id === item.dataset.copilotId);
        if (sug) renderSuggestionBasis(sug, ctx);
      });
    });
    panel.querySelectorAll('[data-copilot-agent]').forEach(btn => {
      btn.onclick = null;
      btn.addEventListener('click', () => {
        const item = btn.closest('[data-copilot-id]');
        const sug = buildCopilotSuggestions(ctx).find(s => s.id === item.dataset.copilotId);
        if (sug) handoffToAgent(copilotHandoffPrompt(ctx, sug), '副驾驶建议已交给 Agent');
      });
    });
    panel.querySelectorAll('[data-copilot-dismiss]').forEach(btn => {
      btn.onclick = null;
      btn.addEventListener('click', () => {
        const item = btn.closest('[data-copilot-id]');
        if (!item) return;
        dismissCopilot(projectId, item.dataset.copilotId);
        const section = panel.querySelector('.hr-copilot');
        if (section) section.outerHTML = renderCopilot(ctx);
        bindCopilot();
      });
    });
  };
  bindCopilot();
  // 研究闭环
  panel.querySelectorAll('[data-pipe-target]').forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.pipeTarget;
    if (target === 'search') { try { sessionStorage.setItem('hana-drawer-tab', 'evidence'); } catch { /* ignore */ } window.location.href = '/ui/hana-research/literature'; return; }
    if (target === 'relations') { switchDrawerTab(panel, 'evidence'); renderRelationModal(projectId, papers[0]?.id || '', papers); return; }
    switchDrawerTab(panel, target === 'tasks' ? 'tasks' : target === 'evidence' ? 'evidence' : 'overview');
  }));
  // 关闭
  panel.querySelector('.drawer-close').addEventListener('click', closeProjectDrawer);
  panel.querySelector('[data-project-agent]')?.addEventListener('click', () => {
    handoffToAgent(`请调用 hana_research_get_research_context 读取项目「${ctx.project.title}」（projectId: ${projectId}）的真实研究上下文。先概括文献、证据、任务和笔记现状，再给出 2–3 个最值得执行的下一步。不要把只有元数据的文献说成已经阅读全文。${agentWritePolicyInstruction()}`.replace(/\s+/g, ' ').trim(), '当前项目已交给 Agent');
  });
  // 项目类型/状态
  panel.querySelector('[data-project-type]')?.addEventListener('change', event => {
    api(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify({ projectType: event.target.value }) })
      .then(() => loadProjects()).catch(error => showNotice(error.message, true));
  });
  panel.querySelector('[data-project-status]')?.addEventListener('change', event => {
    api(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) })
      .then(() => loadProjects()).catch(error => showNotice(error.message, true));
  });
  // AI 综述草稿 / 证据矩阵 / 导出
  panel.querySelector('#project-summary')?.addEventListener('click', () => renderProjectSummary(projectId, ctx.project.title));
  panel.querySelectorAll('[data-prisma-open]').forEach(button => button.addEventListener('click', () => renderPrismaModal(ctx)));
  panel.querySelectorAll('#screening-criteria, [data-screening-criteria]').forEach(button => button.addEventListener('click', () => renderScreeningCriteriaModal(ctx)));
  panel.querySelectorAll('[data-dual-config]').forEach(button => button.addEventListener('click', () => renderDualScreeningConfigModal(ctx)));
  panel.querySelectorAll('[data-dual-reviewer]').forEach(button => button.addEventListener('click', async () => {
    try { localStorage.setItem(dualReviewerStorageKey(projectId), button.dataset.dualReviewer); } catch { /* ignore */ }
    await openProjectDrawer(projectId);
  }));
  panel.querySelectorAll('[data-dual-conflicts]').forEach(button => button.addEventListener('click', () => renderDualConflictQueue(ctx)));
  panel.querySelectorAll('#evidence-fields, [data-evidence-fields]').forEach(button => button.addEventListener('click', () => renderEvidenceFieldsModal(ctx)));
  panel.querySelectorAll('#evidence-matrix, [data-evidence-matrix-open]').forEach(btn => btn.addEventListener('click', () => renderEvidenceMatrixModal(projectId, ctx.project.title)));
  panel.querySelectorAll('#quality-workbench, [data-quality-open]').forEach(btn => btn.addEventListener('click', () => renderQualityModal(ctx)));
  panel.querySelectorAll('#export-notes, [data-export-notes-open]').forEach(btn => btn.addEventListener('click', () => renderNoteExportModal(projectId, ctx.project.title)));
  // 文献关系：新建 / 删除 / 角色
  panel.querySelectorAll('[data-relation-add], [data-relation-open-add]').forEach(button => button.addEventListener('click', () => {
    renderRelationModal(projectId, button.dataset.relationAdd || papers[0]?.id || '', papers);
  }));
  panel.querySelectorAll('[data-relation-remove]').forEach(button => button.addEventListener('click', async () => {
    const relationId = button.dataset.relationRemove;
    const relation = relations.find(item => item.id === relationId);
    const action = await runButtonAction(button, {
      key: `relation-remove:${relationId}`,
      errorPrefix: '关系删除失败',
    }, () => api(`/relations/${encodeURIComponent(relationId)}`, { method: 'DELETE' }));
    if (!action.ok) return;
    const index = relations.findIndex(item => item.id === relationId);
    if (index >= 0) relations.splice(index, 1);
    button.closest('[data-relation-id]')?.remove();
    const count = panel.querySelector('#drawer-relations > summary b');
    if (count) count.textContent = `${relations.length} 条关系`;
    showUndoToast('已删除该文献关系。', async () => {
      if (!relation) return;
      await api(`/projects/${encodeURIComponent(projectId)}/relations`, {
        method: 'POST',
        body: JSON.stringify({ fromPaperId: relation.fromPaperId, toPaperId: relation.toPaperId, relation: relation.relation, note: relation.note || '' }),
      });
      if (panel.isConnected) await openProjectDrawer(projectId);
    });
  }));
  panel.querySelectorAll('[data-role-set]').forEach(select => {
    select.addEventListener('change', async () => {
      try {
        const result = await api(`/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(select.dataset.roleSet)}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) });
        const article = select.closest('[data-drawer-role]');
        if (article) {
          article.dataset.drawerRole = result.paper.role || '';
          const badge = article.querySelector('.paper-role');
          if (badge) { badge.className = `paper-role ${result.paper.role || 'none'}`; badge.textContent = result.paper.role ? PAPER_ROLE_LABELS[result.paper.role] : '未标记角色'; }
        }
      } catch (error) { showNotice(error.message, true); }
    });
  });
  panel.querySelectorAll('[data-screening-set]').forEach(select => {
    select.addEventListener('change', async () => {
      const paper = papers.find(item => item.id === select.dataset.screeningSet);
      const stage = select.dataset.screeningStage;
      const decision = select.value;
      if (!paper) return;
      if (decision === 'exclude') {
        const existing = stage === 'full_text' ? paper.fullTextReason : paper.titleAbstractReason;
        renderScreeningDecisionModal(ctx, paper, stage, existing || '');
        return;
      }
      try {
        select.disabled = true;
        await api(`/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paper.id)}/screening`, { method: 'PATCH', body: JSON.stringify({ stage, decision, reason: decision === 'maybe' ? (stage === 'full_text' ? paper.fullTextReason : paper.titleAbstractReason) : '' }) });
        showNotice(`${stage === 'title_abstract' ? '题录与摘要' : '全文'}筛选已标记为“${SCREENING_DECISION_LABELS[decision]}”。`);
        await openProjectDrawer(projectId);
      } catch (error) { select.disabled = false; showNotice(error.message, true); }
    });
  });
  panel.querySelectorAll('[data-dual-screening-set]').forEach(select => {
    select.addEventListener('change', async () => {
      const paper = papers.find(item => item.id === select.dataset.dualScreeningSet);
      const stage = select.dataset.screeningStage;
      const reviewerKey = select.dataset.reviewer;
      const decision = select.value;
      if (!paper) return;
      const own = ctx.screening?.dualScreening?.byPaper?.[paper.id]?.[stage === 'title_abstract' ? 'titleAbstract' : 'fullText']?.[reviewerKey];
      if (decision === 'exclude') { renderDualScreeningDecisionModal(ctx, paper, stage, reviewerKey, own?.reason || ''); return; }
      const reviewerName = reviewerKey === 'a' ? ctx.screening.dualScreening.config.reviewerAName : ctx.screening.dualScreening.config.reviewerBName;
      const action = await runButtonAction(select, { key: `dual-review:${projectId}:${paper.id}:${stage}:${reviewerKey}`, errorPrefix: '独立判断保存失败' }, () => api(`/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paper.id)}/screening/reviews/${reviewerKey}`, { method: 'PATCH', body: JSON.stringify({ stage, decision, reason: decision === 'maybe' ? (own?.reason || '') : '' }) }));
      if (!action.ok) { select.value = own?.decision || 'pending'; return; }
      showNotice(`${reviewerName}的${stage === 'title_abstract' ? '题录与摘要' : '全文'}判断已保存。`);
      await openProjectDrawer(projectId);
    });
  });
  panel.querySelectorAll('[data-screening-resolve]').forEach(button => button.addEventListener('click', () => renderScreeningConflictModal(ctx, button.dataset.screeningResolve, button.dataset.screeningStage)));
  panel.querySelectorAll('[data-screening-reason]').forEach(button => button.addEventListener('click', () => {
    const paper = papers.find(item => item.id === button.dataset.screeningReason);
    if (!paper) return;
    const stage = paper.fullTextReason ? 'full_text' : 'title_abstract';
    renderScreeningDecisionModal(ctx, paper, stage, paper.fullTextReason || paper.titleAbstractReason || '');
  }));
  panel.querySelectorAll('[data-retrieval-set]').forEach(select => select.addEventListener('change', async () => {
    const paper = papers.find(item => item.id === select.dataset.retrievalSet);
    if (!paper) return;
    const previous = paper.retrievalStatus || 'auto';
    if (select.value === 'not_retrieved') { select.value = previous; renderRetrievalReasonModal(ctx, paper, paper.retrievalReason || ''); return; }
    const action = await runButtonAction(select, { key: `retrieval:${projectId}:${paper.id}`, errorPrefix: '全文获取状态保存失败' }, () => api(`/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paper.id)}/retrieval`, { method: 'PATCH', body: JSON.stringify({ status: select.value, reason: '' }) }));
    if (!action.ok) { select.value = previous; return; }
    showNotice('全文获取状态已更新。');
    await openProjectDrawer(projectId);
  }));
  panel.querySelectorAll('[data-retrieval-reason]').forEach(button => button.addEventListener('click', () => {
    const paper = papers.find(item => item.id === button.dataset.retrievalReason);
    if (paper) renderRetrievalReasonModal(ctx, paper, paper.retrievalReason || '');
  }));
  panel.querySelectorAll('[data-evidence-save]').forEach(button => button.addEventListener('click', async () => {
    const paperId = button.dataset.evidenceSave;
    const form = panel.querySelector(`[data-paper-coding="${cssEscape(paperId)}"]`);
    if (!form) return;
    const values = {};
    for (const field of ctx.coding?.fields || []) {
      if (field.type === 'multi_select') {
        values[field.id] = [...form.querySelectorAll(`[data-evidence-multi="${cssEscape(field.id)}"] input:checked`)].map(input => input.value);
        continue;
      }
      const input = form.querySelector(`[data-evidence-field="${cssEscape(field.id)}"]`);
      if (!input) continue;
      if (field.type === 'boolean') values[field.id] = input.value === '' ? null : input.value === 'true';
      else values[field.id] = input.value;
    }
    const action = await runButtonAction(button, { key: `evidence-coding:${projectId}:${paperId}`, slowMessage: '正在保存研究编码…', errorPrefix: '研究编码保存失败' }, () => api(`/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paperId)}/evidence-coding`, { method: 'PATCH', body: JSON.stringify({ values }) }));
    if (!action.ok) return;
    showNotice('研究编码已保存。');
    await openProjectDrawer(projectId);
  }));
  const screeningSelection = new Set();
  const batchBar = panel.querySelector('[data-screening-batch]');
  const syncBatchBar = () => {
    if (!batchBar) return;
    batchBar.hidden = screeningSelection.size === 0;
    const count = batchBar.querySelector('[data-screening-selected-count]');
    if (count) count.textContent = String(screeningSelection.size);
  };
  panel.querySelectorAll('[data-screening-select-paper]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) screeningSelection.add(input.dataset.screeningSelectPaper);
    else screeningSelection.delete(input.dataset.screeningSelectPaper);
    input.closest('.drawer-paper')?.classList.toggle('screening-selected', input.checked);
    syncBatchBar();
  }));
  batchBar?.querySelector('[data-screening-batch-apply]')?.addEventListener('click', async buttonEvent => {
    const paperIds = [...screeningSelection];
    const stage = batchBar.querySelector('[data-screening-batch-stage]').value;
    const decision = batchBar.querySelector('[data-screening-batch-decision]').value;
    if (!paperIds.length) return;
    if (decision === 'exclude') { renderScreeningBatchExclusionModal(ctx, paperIds, stage); return; }
    const button = buttonEvent.currentTarget;
    try {
      button.disabled = true;
      await api(`/projects/${encodeURIComponent(projectId)}/screening/batch`, { method: 'POST', body: JSON.stringify({ paperIds, stage, decision, reason: '' }) });
      showNotice(`已批量更新 ${paperIds.length} 篇文献。`);
      await openProjectDrawer(projectId);
    } catch (error) { button.disabled = false; showNotice(error.message, true); }
  });
  panel.querySelector('#drawer-roles')?.addEventListener('click', event => {
    const chip = event.target.closest('[data-drawer-role-filter]');
    if (!chip) return;
    document.querySelectorAll('[data-drawer-role-filter]').forEach(item => item.classList.toggle('active', item === chip));
    const role = chip.dataset.drawerRoleFilter;
    panel.querySelectorAll('[data-drawer-role]').forEach(article => article.classList.toggle('filtered', role !== '全部' && article.dataset.drawerRole !== role));
  });
  // 项目笔记：新建 / 删除
  const regularNotes = notes.filter(note => !(Array.isArray(note.tags) && note.tags.includes('研究任务')));
  const refreshNoteCount = () => {
    const count = panel.querySelector('[data-note-count]');
    if (count) count.textContent = regularNotes.length ? ` ${regularNotes.length} 条` : '';
  };
  const bindNoteRemove = button => button.addEventListener('click', async () => {
    const noteId = button.dataset.noteRemove;
    const removedNote = regularNotes.find(note => note.id === noteId);
    const action = await runButtonAction(button, {
      key: `note-remove:${noteId}`,
      errorPrefix: '笔记删除失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }));
    if (!action.ok) return;
    const index = regularNotes.findIndex(note => note.id === noteId);
    if (index >= 0) regularNotes.splice(index, 1);
    button.closest('[data-note-id]')?.remove();
    const list = panel.querySelector('.drawer-note-list');
    if (list && !list.querySelector('[data-note-id]')) list.innerHTML = '<p class="drawer-empty-hint note-empty">还没有项目笔记。记录一个研究判断或跨文献比较。</p>';
    refreshNoteCount();
    showUndoToast('笔记已删除。', async () => {
      if (!removedNote) return;
      const restored = await api(`/projects/${encodeURIComponent(projectId)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: removedNote.content, tags: removedNote.tags || [], paperId: removedNote.paperId || null, linkedPaperId: removedNote.linkedPaperId || null }),
      });
      regularNotes.unshift(restored.note);
      if (panel.isConnected) {
        const noteList = panel.querySelector('.drawer-note-list');
        noteList.querySelector('.note-empty')?.remove();
        noteList.insertAdjacentHTML('afterbegin', noteItemHtml(restored.note));
        bindNoteRemove(noteList.querySelector(`[data-note-remove="${cssEscape(restored.note.id)}"]`));
        refreshNoteCount();
      }
    });
  });
  panel.querySelector('#drawer-note-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const noteForm = event.currentTarget;
    const content = panel.querySelector('#drawer-note-content').value.trim();
    if (!content) { showNotice('笔记内容不能为空。', true); return; }
    const linkedPaperId = panel.querySelector('#drawer-note-linked').value || null;
    const submitButton = noteForm.querySelector('[type="submit"]');
    const action = await runButtonAction(submitButton, {
      key: `note-create:${projectId}`,
      slowMessage: '正在保存笔记…',
      errorPrefix: '笔记保存失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/notes`, { method: 'POST', body: JSON.stringify({ content, linkedPaperId }) }));
    if (!action.ok) return;
    const note = action.value.note;
    regularNotes.unshift(note);
    const list = panel.querySelector('.drawer-note-list');
    list.querySelector('.note-empty')?.remove();
    list.insertAdjacentHTML('afterbegin', noteItemHtml(note));
    bindNoteRemove(list.querySelector(`[data-note-remove="${cssEscape(note.id)}"]`));
    noteForm.reset();
    refreshNoteCount();
    showNotice('笔记已保存。');
  });
  panel.querySelectorAll('[data-note-remove]').forEach(bindNoteRemove);
  // 上传 / 阅读 / 翻译
  panel.querySelector('[data-upload-pdf]')?.addEventListener('change', event => uploadProjectPdf(projectId, event.target));
  panel.querySelectorAll('[data-open-reader]').forEach(button => button.addEventListener('click', () => openPdfReader(projectId, button.dataset.openReader)));
  panel.querySelectorAll('[data-translate-doc]').forEach(button => button.addEventListener('click', () => confirmDocumentTranslation(projectId, button.dataset.translateDoc, button.dataset.translateTitle)));
  panel.querySelectorAll('[data-translations-toggle]').forEach(button => button.addEventListener('click', () => {
    const attachmentId = button.dataset.translationsToggle;
    const panelEl = panel.querySelector(`[data-translations-panel="${cssEscape(attachmentId)}"]`);
    if (!panelEl) return;
    if (panelEl.hidden) { renderPaperTranslationsPanel(projectId, attachmentId, panelEl); button.classList.add('open'); }
    else { panelEl.hidden = true; button.classList.remove('open'); }
  }));
  // 任务面板（renderProjectTaskPanel + bindProjectTaskPanel）
  bindProjectTaskPanel(panel, projectId, ctx.project.title, notes);
}

async function openProjectDrawer(projectId) {
  if (drawerOpeningLock) return; // 防重复点击
  if (drawerCloseTimer) { window.clearTimeout(drawerCloseTimer); drawerCloseTimer = null; }
  const requestToken = ++drawerRequestToken;
  drawerOpeningLock = true;
  const drawer = document.querySelector('#project-drawer');
  const panel = document.querySelector('#drawer-panel');
  const listView = document.querySelector('#project-list-view');
  const pageHead = document.querySelector('.native-page-head');
  projectListScrollY = window.scrollY || 0;
  if (listView) listView.hidden = true;
  if (pageHead) pageHead.hidden = true;
  drawer.hidden = false;
  drawer.classList.remove('ready');
  panel.innerHTML = '<div class="drawer-loading">正在读取项目证据…</div>';
  try {
    const [data, translations, relationsData, notesData, screeningData, codingData, qualityData] = await Promise.all([
      api(`/projects/${encodeURIComponent(projectId)}/papers`),
      api(`/projects/${encodeURIComponent(projectId)}/translations`),
      // P2 增强（P5）：论证链（旧宿主 404 时降级为空）
      api(`/projects/${encodeURIComponent(projectId)}/relations`).catch(() => ({ relations: [] })),
      // P2 增强（P11）：项目笔记（旧宿主 404 时降级为空）
      api(`/projects/${encodeURIComponent(projectId)}/notes`).catch(() => ({ notes: [] })),
      api(`/projects/${encodeURIComponent(projectId)}/screening`).catch(() => ({ criteria: [], titleAbstract: { pending: 0, include: 0, maybe: 0, exclude: 0 }, fullText: { pending: 0, include: 0, maybe: 0, exclude: 0 }, finalIncluded: 0 })),
      api(`/projects/${encodeURIComponent(projectId)}/evidence-coding`).catch(() => ({ fields: [], templates: [], values: {}, paperStats: {}, totalPapers: 0, papersCoded: 0, papersComplete: 0 })),
      api(`/projects/${encodeURIComponent(projectId)}/quality`).catch(() => null),
    ]);
    if (requestToken !== drawerRequestToken) return;
    drawerOpeningLock = false;
    // 项目不存在（404）→ 数据为空且接口报错时降级提示
    if (!data.project) {
      panel.innerHTML = '<div class="drawer-loading"><span class="state-card"><h3>项目不存在或已被删除</h3><p>返回项目库刷新列表后重试。</p></span></div>';
      return;
    }
    state.translationCounts = {};
    for (const doc of translations.docs || []) {
      state.translationCounts[doc.attachmentId] = (state.translationCounts[doc.attachmentId] || 0) + 1;
    }
    const relations = relationsData.relations || [];
    const notes = notesData.notes || [];
    const stats = await loadCockpitData(projectId, data.papers || [], notes, relations, translations.docs || []);
    if (requestToken !== drawerRequestToken) return;
    const ctx = { projectId, project: data.project, papers: data.papers || [], notes, relations, docs: translations.docs || [], stats, screening: screeningData, coding: codingData, quality: qualityData };
    const initialTab = hanaReturnedTab() || 'overview';
    panel.innerHTML = renderDrawer(ctx);
    bindDrawer(panel, ctx);
    switchDrawerTab(panel, initialTab);
    window.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => drawer.classList.add('ready'));
    // 从阅读器返回：若要求打开证据矩阵则直接弹出（阅读 → 证据闭环）
    try {
      const openEvidence = sessionStorage.getItem('hana-open-evidence');
      if (openEvidence === projectId) {
        sessionStorage.removeItem('hana-open-evidence');
        renderEvidenceMatrixModal(projectId, data.project.title);
      }
    } catch { /* ignore */ }
    // 阅读器返回 → 聚焦原文献（保持既有行为）
    const focusPaperId = readFocusPaperHint(projectId);
    if (focusPaperId) {
      window.setTimeout(() => {
        const card = panel.querySelector(`[data-drawer-role][data-paper-id="${cssEscape(focusPaperId)}"], .drawer-paper`);
        if (card) { switchDrawerTab(panel, 'evidence'); card.scrollIntoView({ block: 'center' }); }
      }, 60);
    }
  } catch (error) {
    if (requestToken !== drawerRequestToken) return;
    drawerOpeningLock = false;
    console.error('[hana-research] 打开项目失败：', error);
    panel.innerHTML = `<button class="drawer-close" aria-label="返回项目库">← 项目库</button><h2>无法读取项目</h2><p>${escapeHtml(error.message)}</p><p class="search-hint">项目可能已被删除，或数据目录不可访问。请刷新项目库后重试。</p>`;
    panel.querySelector('.drawer-close').addEventListener('click', closeProjectDrawer);
  }
}

/** 阅读器返回时记录的页签提示（sessionStorage，一次性）。 */
function hanaReturnedTab() {
  try {
    const tab = sessionStorage.getItem('hana-drawer-tab');
    if (['overview', 'evidence', 'tasks'].includes(tab)) { sessionStorage.removeItem('hana-drawer-tab'); return tab; }
  } catch { /* ignore */ }
  return null;
}

/** 阅读器返回时希望聚焦的文献（sessionStorage，一次性）。 */
function readFocusPaperHint(projectId) {
  try {
    const key = `hana-focus-paper-${projectId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return raw;
  } catch { return null; }
}

// ── 全文翻译（AI） ───────────────────────────

function confirmDocumentTranslation(projectId, attachmentId, title) {
  closeModalLayer();
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel" role="dialog" aria-modal="true">
    <span class="composer-kicker">AI document translation</span>
    <h2>翻译全文并生成译文文档</h2>
    <p class="modal-copy">将调用已配置的 AI 翻译服务（DeepSeek）把《${escapeHtml(title)}》全文翻译成中文，生成 Markdown 译文文档，作为这篇文献的子文档保存在项目库。<strong>该操作会消耗 API 额度</strong>，已翻译段落会缓存，重复翻译不重复计费。</p>
    <div class="composer-actions"><button type="button" class="button" data-modal-cancel>取消</button><button type="button" class="button primary" data-modal-confirm>开始翻译</button></div>
  </div>`;
  document.body.append(layer);
  layer.querySelector('[data-modal-cancel]').addEventListener('click', closeModalLayer);
  layer.querySelector('[data-modal-confirm]').addEventListener('click', async event => {
    const action = await runButtonAction(event.currentTarget, {
      key: `translation-create:${attachmentId}`,
      slowMessage: '正在创建全文翻译任务…',
      errorPrefix: '翻译任务创建失败',
    }, () => api(`/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/translate`, {
        method: 'POST',
        body: JSON.stringify({ targetLang: 'zh' }),
      }));
    if (!action.ok) return;
    closeModalLayer();
    pollTranslationDoc(action.value.doc.id, projectId, attachmentId);
  });
}

// ── v36：统一弹层工厂 ──────────────────────────────────────────────────
// 所有模态走同一条创建路径，统一获得：焦点圈闭（Tab 循环）、关闭后焦点还原、
// 遮罩点击关闭（带拖拽选区误触保护）、入场自动聚焦与 aria 兜底。
// 迁移约定：旧代码的 createElement + className='modal-layer' 两行直接换成
// openModalLayer()，其余 innerHTML / append / 自定义绑定保持不变。

const modalRegistry = new Set();

/** 创建一个已登记的 .modal-layer；调用方随后设置 innerHTML 并 append 到 body。 */
function openModalLayer() {
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  layer.__hanaModal = { previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null, backdropDown: null };
  modalRegistry.add(layer);
  // innerHTML 在同一同步任务里注入并 append；延后两帧装配，确保控件已就位。
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => setupModalBehaviors(layer)));
  return layer;
}

/** 为单个弹层装配：aria 兜底、自动聚焦、Tab 圈闭、遮罩点击关闭、cancel 按钮兜底。 */
function setupModalBehaviors(layer) {
  if (!layer.isConnected || !modalRegistry.has(layer)) return;
  const meta = layer.__hanaModal;
  const panel = layer.querySelector('.modal-panel');
  if (panel) {
    if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
    if (!panel.hasAttribute('aria-modal')) panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('aria-label')) {
      const heading = panel.querySelector('h2');
      if (heading?.textContent) panel.setAttribute('aria-label', heading.textContent.trim());
    }
  }
  const focusTarget = panel?.querySelector('[autofocus]')
    || panel?.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    || panel?.querySelector('.button.primary:not([disabled]), button.primary:not([disabled])');
  focusTarget?.focus({ preventScroll: true });
  layer.querySelectorAll('[data-modal-cancel]').forEach(button => {
    if (!button.__hanaCancelBound) {
      button.__hanaCancelBound = true;
      button.addEventListener('click', () => disposeModalLayer(layer));
    }
  });
  layer.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...layer.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  layer.addEventListener('pointerdown', event => {
    meta.backdropDown = event.target === layer ? { x: event.clientX, y: event.clientY } : null;
  });
  layer.addEventListener('click', event => {
    if (event.target !== layer || !meta.backdropDown) return;
    const movedX = Math.abs(event.clientX - meta.backdropDown.x);
    const movedY = Math.abs(event.clientY - meta.backdropDown.y);
    meta.backdropDown = null;
    if (movedX < 6 && movedY < 6) disposeModalLayer(layer);
  });
}

/** 关闭单个弹层：出场动画后移除，并把焦点还给触发元素。 */
function disposeModalLayer(layer) {
  if (!layer || !modalRegistry.has(layer)) return;
  modalRegistry.delete(layer);
  if (!layer.isConnected) return;
  layer.classList.add('closing');
  window.setTimeout(() => {
    const previousFocus = layer.__hanaModal?.previousFocus;
    layer.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    layer.dispatchEvent(new CustomEvent('hana-modal-dismissed'));
  }, 160);
}

function closeModalLayer() {
  [...modalRegistry].forEach(layer => disposeModalLayer(layer));
  // 兜底：未经工厂创建的历史遗留遮罩也一并收掉。
  document.querySelectorAll('.modal-layer').forEach(layer => {
    if (!modalRegistry.has(layer)) {
      layer.classList.add('closing');
      window.setTimeout(() => layer.remove(), 160);
    }
  });
}

// ── v36：样式化确认 / 选择 / 输入对话框（取代原生 window.confirm/prompt）──

function dialogActionsHtml({ confirmLabel = '确认', cancelLabel = '取消', danger = false }) {
  return `<div class="composer-actions"><button type="button" class="button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button><button type="button" class="button primary${danger ? ' danger-primary' : ''}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div>`;
}

function openDialogPanel({ kicker = 'Confirm', title, message = '', bodyHtml = '', danger = false, actionsHtml = '' }) {
  const layer = openModalLayer();
  layer.innerHTML = `<div class="modal-panel hr-dialog-panel${danger ? ' hr-dialog-danger' : ''}" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
    ${kicker ? `<span class="composer-kicker">${escapeHtml(kicker)}</span>` : ''}
    <h2>${escapeHtml(title)}</h2>
    ${message ? `<p class="modal-copy hr-dialog-message">${escapeHtml(message)}</p>` : ''}
    ${bodyHtml}
    ${actionsHtml}
  </div>`;
  document.body.append(layer);
  return layer;
}

/** 确认框：resolve(true)=确认；resolve(false)=取消/Esc/遮罩。 */
function confirmDialog({ title = '确认操作', message = '', confirmLabel = '确认', cancelLabel = '取消', danger = false } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; resolve(value); disposeModalLayer(layer); };
    const layer = openDialogPanel({ title, message, danger, actionsHtml: dialogActionsHtml({ confirmLabel, cancelLabel, danger }) });
    layer.querySelector('[data-dialog-cancel]').addEventListener('click', () => finish(false));
    layer.querySelector('[data-dialog-confirm]').addEventListener('click', () => finish(true));
    layer.addEventListener('hana-modal-dismissed', () => finish(false));
  });
}

/** 多选一对话框：resolve(所选 choice.value)；resolve(null)=取消。 */
function choiceDialog({ title = '请选择', message = '', choices = [], cancelLabel = '取消' } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; resolve(value); disposeModalLayer(layer); };
    const buttons = choices.map((choice, index) =>
      `<button type="button" class="button primary" data-dialog-choice="${escapeAttr(String(index))}">${escapeHtml(choice.label)}</button>`).join('');
    const layer = openDialogPanel({
      title, message,
      actionsHtml: `<div class="composer-actions hr-dialog-choices">${buttons}<button type="button" class="button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button></div>`,
    });
    layer.querySelector('[data-dialog-cancel]').addEventListener('click', () => finish(null));
    layer.querySelectorAll('[data-dialog-choice]').forEach(button =>
      button.addEventListener('click', () => finish(choices[Number(button.dataset.dialogChoice)].value)));
    layer.addEventListener('hana-modal-dismissed', () => finish(null));
  });
}

/** 文本输入对话框：resolve(去除首尾空白的字符串)；resolve(null)=取消。 */
function promptDialog({ title = '输入', message = '', defaultValue = '', placeholder = '', multiline = false, required = true, maxlength = 500, confirmLabel = '确认', cancelLabel = '取消' } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; resolve(value); disposeModalLayer(layer); };
    const fieldId = `hr-prompt-field-${Math.random().toString(36).slice(2, 8)}`;
    const control = multiline
      ? `<textarea id="${fieldId}" rows="3" maxlength="${maxlength}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
      : `<input id="${fieldId}" type="text" maxlength="${maxlength}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(defaultValue)}" autocomplete="off">`;
    const layer = openDialogPanel({
      title, message,
      bodyHtml: `<form data-dialog-form class="settings-form"><label for="${fieldId}">${control}</label></form>`,
      actionsHtml: dialogActionsHtml({ confirmLabel, cancelLabel }),
    });
    const submit = () => {
      const input = layer.querySelector(`#${fieldId}`);
      const value = input.value.trim();
      if (required && !value) { input.focus(); input.reportValidity?.(); return; }
      finish(value);
    };
    layer.querySelector('[data-dialog-cancel]').addEventListener('click', () => finish(null));
    layer.querySelector('[data-dialog-confirm]').addEventListener('click', submit);
    layer.querySelector('[data-dialog-form]').addEventListener('submit', event => { event.preventDefault(); submit(); });
    layer.addEventListener('hana-modal-dismissed', () => finish(null));
  });
}

/** 返回项目列表；详情与列表是 Harness 内容区内的同层页面。 */
function closeProjectDrawer() {
  const drawer = document.querySelector('#project-drawer');
  if (!drawer || drawer.hidden) return;
  drawerOpeningLock = false;
  drawerRequestToken += 1;
  drawer.hidden = true;
  drawer.classList.remove('ready');
  const panel = document.querySelector('#drawer-panel');
  if (panel) panel.innerHTML = '';
  const listView = document.querySelector('#project-list-view');
  const pageHead = document.querySelector('.native-page-head');
  if (listView) listView.hidden = false;
  if (pageHead) pageHead.hidden = false;
  window.requestAnimationFrame(() => window.scrollTo({ top: projectListScrollY || 0 }));
}

/** 关闭新建项目弹层（带淡出动画）。 */
function closeProjectComposer() {
  const composer = document.querySelector('#project-composer');
  if (!composer || composer.hidden) return;
  composer.classList.add('closing');
  window.setTimeout(() => {
    composer.hidden = true;
    composer.classList.remove('closing');
  }, 160);
}

function pollTranslationDoc(docId, projectId, attachmentId) {
  refreshTranslationPanel(projectId, attachmentId, '正在开始翻译…');
  const timer = window.setInterval(async () => {
    try {
      const data = await api(`/translate/document/${encodeURIComponent(docId)}`);
      const doc = data.doc;
      if (doc.status === 'done' || doc.status === 'failed') {
        window.clearInterval(timer);
        refreshTranslationPanel(projectId, attachmentId, doc.status === 'done' ? '译文文档已生成。' : `翻译失败：${doc.error || '未知错误'}`);
        if (doc.status === 'done') {
          showNotice('译文文档已生成，可在该文献卡片下展开查看。');
        }
      } else {
        refreshTranslationPanel(projectId, attachmentId, `正在翻译… ${doc.progressTotal ? `${doc.progressDone} / ${doc.progressTotal} 段` : '准备中'}`);
      }
    } catch {
      window.clearInterval(timer);
      refreshTranslationPanel(projectId, attachmentId, '翻译进度查询失败，请重新打开项目抽屉查看。');
    }
  }, 1500);
}

/** 刷新某篇文献的译文子文档面板与计数（展开时实时更新，收起时只更新计数）。 */
async function refreshTranslationPanel(projectId, attachmentId, statusText = '') {
  const panel = document.querySelector(`[data-translations-panel="${cssEscape(attachmentId || '')}"]`);
  const toggle = document.querySelector(`[data-translations-toggle="${cssEscape(attachmentId || '')}"]`);
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/translations`);
    const docs = (data.docs || []).filter(doc => doc.attachmentId === attachmentId);
    state.translationCounts = state.translationCounts || {};
    state.translationCounts[attachmentId] = docs.length;
    if (toggle) {
      toggle.querySelector('b').textContent = String(docs.length);
    }
    if (panel && !panel.hidden) {
      renderDocsIntoPanel(docs, panel, statusText);
    }
  } catch {
    if (panel && !panel.hidden) {
      panel.innerHTML = '<p class="trans-status">译文加载失败，请重新打开项目抽屉。</p>';
    }
  }
}

async function renderPaperTranslationsPanel(projectId, attachmentId, panel) {
  panel.hidden = false;
  panel.innerHTML = '<p class="trans-status">正在加载译文…</p>';
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/translations`);
    const docs = (data.docs || []).filter(doc => doc.attachmentId === attachmentId);
    renderDocsIntoPanel(docs, panel);
  } catch (error) {
    panel.innerHTML = `<p class="trans-status">${escapeHtml(error.message)}</p>`;
  }
}

function renderDocsIntoPanel(docs, panel, statusText = '') {
  if (!docs.length && !statusText) {
    panel.innerHTML = '<p class="trans-status">还没有译文，点击卡片上的「翻译全文」生成。</p>';
    return;
  }
  const items = docs.map(doc => {
    const badge = doc.status === 'done'
      ? '<span class="trans-badge done">已完成</span>'
      : doc.status === 'failed'
        ? `<span class="trans-badge failed" title="${escapeAttr(doc.error || '')}">失败</span>`
        : `<span class="trans-badge running">${doc.progressTotal ? `${doc.progressDone}/${doc.progressTotal}` : '进行中'}</span>`;
    const download = doc.status === 'done' && doc.fileName
      ? `<a class="trans-download" href="${escapeAttr(apiUrl(`/translate/document/${encodeURIComponent(doc.id)}/file`))}" download>下载</a>`
      : '';
    return `<div class="trans-item"><div class="trans-title"><span>译文 · ${escapeHtml(doc.targetLang)}</span><strong>${escapeHtml(doc.fileName || '')}</strong></div><div class="trans-actions">${badge}${download}</div></div>`;
  }).join('');
  panel.innerHTML = `${items}${statusText ? `<p class="trans-status">${escapeHtml(statusText)}</p>` : ''}`;
}

async function uploadProjectPdf(projectId, input) {
  const file = input.files?.[0];
  if (!file) return;
  const upload = input.closest('.upload-pdf-button');
  upload.classList.add('busy');
  upload.querySelector('b').textContent = `正在校验 ${file.name}`;
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('title', file.name.replace(/\.pdf$/i, ''));
  try {
    const result = await api(`/projects/${encodeURIComponent(projectId)}/upload-pdf`, { method: 'POST', body: form });
    state.projects = (await api('/projects')).projects;
    await openProjectDrawer(projectId);
    const panel = document.querySelector('#drawer-panel');
    panel?.insertAdjacentHTML('afterbegin', `<div class="drawer-notice">${result.reused ? '已复用本地同一文件，并关联到当前项目。' : 'PDF 已安全保存到项目库，可以开始阅读与批注。'}</div>`);
  } catch (error) {
    upload.classList.remove('busy');
    upload.querySelector('b').textContent = error.message;
    input.value = '';
  }
}

async function openPdfReader(projectId, attachmentId, from = 'project-detail') {
  // v13：阅读器统一入口；from 标记来源（project-detail / literature-center / search-result），
  // 阅读器返回时按来源导航并恢复对应页面状态。
  const params = new URLSearchParams({ projectId, attachmentId, from });
  location.href = `/ui/hana-research/reader?${params.toString()}`;
}

function renderPdfReader() {
  const reader = state.reader;
  const { project, paper } = reader.data;
  root.innerHTML = `<div class="pdf-reader-shell">
    <header class="reader-header"><button class="reader-back" id="reader-back">← 项目库</button><div class="reader-title"><span>${escapeHtml(project.title)}</span><strong>${escapeHtml(paper.title)}</strong></div><div class="reader-status"><i></i>本地保存</div></header>
    <div class="reader-toolbar">
      <div class="reader-tools nav-tools">
        <button id="toggle-thumbnails" class="active" title="缩略图" aria-label="缩略图">${thumbnailsIcon}</button>
        ${reader.outline?.length ? `<button id="toggle-outline" title="目录（PDF 大纲）" aria-label="目录">☰</button>` : ''}
        <button id="prev-page" title="上一页（PgUp）" aria-label="上一页">←</button>
        <label class="page-jump-field"><input id="page-number" inputmode="numeric" value="1"><span>/ <span id="page-count">${reader.pdf.numPages}</span></span></label>
        <button id="next-page" title="下一页（PgDn）" aria-label="下一页">→</button>
      </div>
      <div class="reader-tools zoom-tools">
        <button id="zoom-out" title="缩小（-）" aria-label="缩小">−</button>
        <span id="zoom-label">${Math.round(reader.scale * 100)}%</span>
        <button id="zoom-in" title="放大（+）" aria-label="放大">＋</button>
        <button id="fit-width" title="适应宽度（Ctrl+0）">适应宽度</button>
      </div>
      <div class="reader-tools search-tools">
        <label class="search-field-inline">${searchIcon}<input id="search-input" placeholder="查找…" title="全文搜索（Ctrl+F）"></label>
        <span id="search-count"></span>
        <button id="search-prev" title="上一处（Shift+Enter）" aria-label="上一处">↑</button>
        <button id="search-next" title="下一处（Enter）" aria-label="下一处">↓</button>
        <button id="search-close" title="关闭搜索（Esc）" aria-label="关闭搜索">×</button>
      </div>
      <div class="reader-tools annotation-tools">
        <button id="area-tool" title="框选勾画（再次点击或拖选后退出）"><span></span>框选</button>
      </div>
    </div>
    <div class="reader-body"><aside class="reader-thumbnails" id="reader-thumbnails"><div class="thumbnails-head">页面</div><div class="thumbnails-list" id="thumbnails-list"></div></aside>${reader.outline?.length ? `<aside class="reader-outline" id="reader-outline" hidden><div class="thumbnails-head">目录</div><nav class="outline-list" id="outline-list"></nav></aside>` : ''}<section class="reader-stage" id="reader-stage"><div class="page-loading">正在装订连续页面…</div></section></div>
    <footer class="reader-statusbar"><span id="statusbar-page">第 1 / ${reader.pdf.numPages} 页</span><span id="statusbar-zoom">${Math.round(reader.scale * 100)}%</span></footer>
  </div>`;
  document.querySelector('#reader-back').addEventListener('click', async () => {
    const backProjectId = reader.projectId;
    reader.pdf?.destroy?.();
    state.reader = null;
    localStorage.removeItem('hana-research-reader-context');
    researchChannel?.postMessage({ type: 'reader-closed', projectId: backProjectId });
    await loadProjects();
    openProjectDrawer(backProjectId);
  });
  document.querySelector('#prev-page').addEventListener('click', () => setReaderPage(reader.pageNumber - 1));
  document.querySelector('#next-page').addEventListener('click', () => setReaderPage(reader.pageNumber + 1));
  document.querySelector('#page-number').addEventListener('change', event => setReaderPage(Number(event.target.value)));
  document.querySelector('#zoom-out').addEventListener('click', () => setReaderZoom(reader.scale - .15));
  document.querySelector('#zoom-in').addEventListener('click', () => setReaderZoom(reader.scale + .15));
  document.querySelector('#fit-width').addEventListener('click', fitReaderWidth);
  document.querySelector('#area-tool').addEventListener('click', toggleAreaTool);
  document.querySelector('#toggle-thumbnails').addEventListener('click', toggleThumbnails);
  document.querySelector('#toggle-outline')?.addEventListener('click', toggleOutline);
  bindReaderSearch();
  renderThumbnails();
  renderOutline();
  document.removeEventListener('keydown', onReaderKeydown);
  document.addEventListener('keydown', onReaderKeydown);
  document.querySelector('#reader-stage')?.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const current = state.reader;
    if (!current) return;
    setReaderZoom(current.scale * (event.deltaY < 0 ? 1.1 : .9));
  }, { passive: false });
}

async function renderReaderDocument() {
  const reader = state.reader;
  if (!reader) return;
  const token = ++reader.renderToken;
  const stage = document.querySelector('#reader-stage');
  closeSelectionPopover();
  closeReaderSearch(false);
  reader.pageObserver?.disconnect();
  reader.activePageObserver?.disconnect();
  reader.renderedPages.clear();
  reader.renderingPages.clear();
  reader.pageHandles.clear();
  reader.visibility.clear();
  stage.innerHTML = '<div class="page-loading">正在装订连续页面…</div>';
  document.querySelector('#page-number').value = String(reader.pageNumber);
  document.querySelector('#zoom-label').textContent = `${Math.round(reader.scale * 100)}%`;
  const statusbarZoom = document.querySelector('#statusbar-zoom');
  if (statusbarZoom) statusbarZoom.textContent = `${Math.round(reader.scale * 100)}%`;
  const pageEntries = await Promise.all(Array.from({ length: reader.pdf.numPages }, async (_, index) => {
    const pageNumber = index + 1;
    const page = await reader.pdf.getPage(pageNumber);
    return { pageNumber, page, viewport: page.getViewport({ scale: reader.scale }) };
  }));
  if (token !== reader.renderToken || !state.reader) return;
  const pages = document.createElement('div');
  pages.className = 'reader-pages';
  for (const entry of pageEntries) {
    reader.pageHandles.set(entry.pageNumber, entry.page);
    const pageWrap = document.createElement('article');
    pageWrap.className = 'pdf-page-wrap pending';
    pageWrap.dataset.pageNumber = String(entry.pageNumber);
    pageWrap.style.width = `${entry.viewport.width}px`;
    pageWrap.style.height = `${entry.viewport.height}px`;
    pageWrap.style.setProperty('--scale-factor', String(reader.scale));
    pageWrap.style.setProperty('--user-unit', '1');
    pageWrap.style.setProperty('--total-scale-factor', String(reader.scale));
    pageWrap.style.setProperty('--scale-round-x', '1px');
    pageWrap.style.setProperty('--scale-round-y', '1px');
    pageWrap.innerHTML = `<div class="page-placeholder"><span>${entry.pageNumber}</span><i></i></div>`;
    pages.append(pageWrap);
  }
  stage.replaceChildren(pages);
  reader.pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) renderPageInto(Number(entry.target.dataset.pageNumber));
    }
  }, { root: stage, rootMargin: '1100px 0px', threshold: .01 });
  reader.activePageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) reader.visibility.set(Number(entry.target.dataset.pageNumber), entry.intersectionRatio);
    const active = [...reader.visibility.entries()].sort((a, b) => b[1] - a[1])[0];
    if (active?.[1] > 0) updateActiveReaderPage(active[0]);
  }, { root: stage, rootMargin: '-15% 0px -55% 0px', threshold: [0, .05, .2, .45, .7, 1] });
  pages.querySelectorAll('.pdf-page-wrap').forEach(pageWrap => {
    reader.pageObserver.observe(pageWrap);
    reader.activePageObserver.observe(pageWrap);
  });
  stage.onpointerdown = () => closeSelectionPopover();
  await renderPageInto(reader.pageNumber);
  window.requestAnimationFrame(() => scrollReaderPageIntoView(reader.pageNumber, false));
}

async function renderPageInto(pageNumber) {
  const reader = state.reader;
  if (!reader || reader.renderedPages.has(pageNumber)) return;
  if (reader.renderingPages.has(pageNumber)) return reader.renderingPages.get(pageNumber);
  const task = (async () => {
    const token = reader.renderToken;
    const page = reader.pageHandles.get(pageNumber) || await reader.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: reader.scale });
    const pageWrap = document.querySelector(`.pdf-page-wrap[data-page-number="${pageNumber}"]`);
    if (!pageWrap || token !== reader.renderToken) return;
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    const annotationLayer = document.createElement('div');
    annotationLayer.className = 'reader-annotation-layer';
    annotationLayer.dataset.pageNumber = String(pageNumber);
    annotationLayer.classList.toggle('drawing', reader.drawMode);
    pageWrap.replaceChildren(canvas, textLayer, annotationLayer);
    pageWrap.classList.remove('pending');
    await Promise.all([
      page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0] }).promise,
      page.getTextContent().then(textContent => new reader.pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport }).render()),
    ]);
    if (token !== reader.renderToken) return;
    reader.renderedPages.add(pageNumber);
    renderPageAnnotations(pageNumber);
    textLayer.addEventListener('pointerdown', beginReaderTextSelection);
    textLayer.addEventListener('dblclick', beginReaderWordSelect);
    annotationLayer.addEventListener('pointerdown', beginAreaAnnotation);
  })().finally(() => reader.renderingPages.delete(pageNumber));
  reader.renderingPages.set(pageNumber, task);
  return task;
}

// ── 文本选区（原生选区驱动） ──────────────────────────
// 成熟 PDF 阅读器（pdf.js viewer / Chrome / Firefox）的做法：
// 让浏览器原生选区在 textLayer 上工作（字符级精确、跨行连续），
// 监听 selectionchange 读取 range.getClientRects() 生成高亮与摘录，
// 不再自研「按行 Y 轴近似 + 字符比例估算」的几何算法（那正是
// 选中断开 / 串行的根源）。

let readerSelectionListenerAttached = false;

/** 常驻挂载 selectionchange（阅读器关闭后靠 selectionGesture 判空空转）。 */
function attachReaderSelectionListener() {
  if (readerSelectionListenerAttached) return;
  document.addEventListener('selectionchange', handleReaderSelectionChange);
  readerSelectionListenerAttached = true;
}

function beginReaderTextSelection(event) {
  const reader = state.reader;
  if (!reader || reader.drawMode || event.button !== 0) return;
  const textLayer = event.currentTarget;
  const pageWrap = textLayer.closest('.pdf-page-wrap');
  if (!pageWrap) return;
  // 关键：不 preventDefault，交给浏览器原生选区引擎精确选择
  closeSelectionPopover();
  window.getSelection()?.removeAllRanges();
  const gesture = {
    pointerId: event.pointerId,
    pageNumber: Number(pageWrap.dataset.pageNumber),
    pageWrap,
    textLayer,
    startX: event.clientX,
    startY: event.clientY,
  };
  reader.selectionGesture = gesture;
  reader.pendingSelection = null;
  textLayer.setPointerCapture?.(event.pointerId);
  let frame = 0;
  const move = moveEvent => {
    if (moveEvent.pointerId !== gesture.pointerId) return;
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      // 原生选区会随内容自动跟随滚动位置，这里只需触发滚动并重读选区矩形
      autoScrollSelectionStage(moveEvent.clientY);
      handleReaderSelectionChange();
    });
  };
  const end = endEvent => {
    if (endEvent.pointerId !== gesture.pointerId) return;
    window.cancelAnimationFrame(frame);
    textLayer.removeEventListener('pointermove', move);
    textLayer.removeEventListener('pointerup', end);
    textLayer.removeEventListener('pointercancel', cancel);
    reader.selectionGesture = null;
    const distance = Math.hypot(endEvent.clientX - gesture.startX, endEvent.clientY - gesture.startY);
    if (distance < 4) {
      clearSelectionPreview();
      window.getSelection()?.removeAllRanges();
      return;
    }
    const pending = reader.pendingSelection;
    window.getSelection()?.removeAllRanges();
    if (!pending?.quote || !pending.rects.length) {
      clearSelectionPreview();
      showReaderToast('没有识别到连续文字，请从正文行内重新拖选。', true);
      return;
    }
    reader.lastSelection = { ...pending, tags: ['关键证据'] };
    drawSelectionPreview(pending.pageNumber, pending.rects);
    showSelectionPopover(pending.anchorRect);
  };
  const cancel = () => {
    window.cancelAnimationFrame(frame);
    textLayer.removeEventListener('pointermove', move);
    textLayer.removeEventListener('pointerup', end);
    textLayer.removeEventListener('pointercancel', cancel);
    reader.selectionGesture = null;
    reader.pendingSelection = null;
    clearSelectionPreview();
    window.getSelection()?.removeAllRanges();
  };
  textLayer.addEventListener('pointermove', move);
  textLayer.addEventListener('pointerup', end);
  textLayer.addEventListener('pointercancel', cancel);
}

/** selectionchange：把原生选区转成当前页的高亮矩形 + 摘录文本。 */
function handleReaderSelectionChange() {
  const reader = state.reader;
  if (!reader?.selectionGesture) return;
  const gesture = reader.selectionGesture;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    reader.pendingSelection = null;
    clearSelectionPreview();
    return;
  }
  const range = selection.getRangeAt(0);
  // 起点必须仍在起始页文本层内（拖出文本层/跨页时截断，不做跨页注释）
  if (!gesture.textLayer.contains(range.startContainer)) return;
  let endNode = range.endContainer;
  let endOffset = range.endOffset;
  if (!gesture.textLayer.contains(range.endContainer)) {
    const last = lastTextNodeIn(gesture.textLayer);
    if (!last) return;
    endNode = last;
    endOffset = last.length;
  }
  const clipped = document.createRange();
  clipped.setStart(range.startContainer, range.startOffset);
  clipped.setEnd(endNode, endOffset);
  const clientRects = [...clipped.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1);
  if (!clientRects.length) {
    reader.pendingSelection = null;
    clearSelectionPreview();
    return;
  }
  const pageRect = gesture.pageWrap.getBoundingClientRect();
  const rects = normalizeSelectionRects(clientRects, pageRect);
  const quote = String(clipped.toString()).replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 5000);
  if (!quote || !rects.length) {
    reader.pendingSelection = null;
    clearSelectionPreview();
    return;
  }
  reader.pendingSelection = {
    rects,
    quote,
    pageNumber: gesture.pageNumber,
    anchorRect: clientRects[clientRects.length - 1] || { left: gesture.startX, top: gesture.startY, width: 0, height: 0 },
  };
  drawSelectionPreview(gesture.pageNumber, rects);
}

function lastTextNodeIn(container) {
  const spans = container.querySelectorAll('span');
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const child = spans[index].firstChild;
    if (child && child.nodeType === Node.TEXT_NODE && child.length > 0) return child;
  }
  return null;
}

/** 拖选到视口上下边缘时自动滚动，方便跨屏选择。 */
function autoScrollSelectionStage(clientY) {
  const stage = document.querySelector('#reader-stage');
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (clientY < rect.top + 36) stage.scrollTop = Math.max(0, stage.scrollTop - 12);
  else if (clientY > rect.bottom - 36) {
    stage.scrollTop = Math.min(stage.scrollHeight - stage.clientHeight, stage.scrollTop + 12);
  }
}

/** 双击选词：取指针所在 span 的整词，生成选区与摘录弹窗。 */
function beginReaderWordSelect(event) {
  const reader = state.reader;
  if (!reader || reader.drawMode || event.button !== 0) return;
  const textLayer = event.currentTarget;
  const pageWrap = textLayer.closest('.pdf-page-wrap');
  if (!pageWrap) return;
  const caret = caretAtPoint(event.clientX, event.clientY);
  const node = caret?.node;
  const span = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node?.closest?.('span') || null);
  if (!span || !textLayer.contains(span)) return;
  const textNode = span.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.length);
  const clientRects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1);
  if (!clientRects.length) return;
  const pageRect = pageWrap.getBoundingClientRect();
  const rects = normalizeSelectionRects(clientRects, pageRect);
  const quote = String(span.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
  if (!quote || !rects.length) return;
  closeSelectionPopover();
  reader.lastSelection = { rects, quote, pageNumber: Number(pageWrap.dataset.pageNumber), tags: ['关键证据'] };
  drawSelectionPreview(reader.lastSelection.pageNumber, rects);
  // 清掉浏览器双击产生的原生选区，避免系统高亮与我们的预览重叠
  window.getSelection()?.removeAllRanges();
  showSelectionPopover(clientRects[clientRects.length - 1]);
}

function caretAtPoint(clientX, clientY) {
  if (document.caretPositionFromPoint) {
    const caret = document.caretPositionFromPoint(clientX, clientY);
    return caret ? { node: caret.offsetNode, offset: caret.offset } : null;
  }
  const range = document.caretRangeFromPoint?.(clientX, clientY);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function drawSelectionPreview(pageNumber, rects) {
  const layer = document.querySelector(`.reader-annotation-layer[data-page-number="${pageNumber}"]`);
  if (!layer) return;
  // 增量更新：复用已有 marker（原生选区驱动下 selectionchange 高频触发，避免重建闪烁）
  const existing = layer.querySelectorAll('.selection-preview');
  const count = Math.max(existing.length, rects.length);
  for (let index = 0; index < count; index += 1) {
    if (index < rects.length) {
      let marker = existing[index];
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'annotation-rect selection-preview';
        layer.append(marker);
      }
      const rect = rects[index];
      Object.assign(marker.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
    } else if (existing[index]) {
      existing[index].remove();
    }
  }
}

function clearSelectionPreview() {
  document.querySelectorAll('.selection-preview').forEach(marker => marker.remove());
}

function normalizeSelectionRects(clientRects, pageRect) {
  const rects = clientRects.map(rect => ({
    x: Math.max(0, rect.left - pageRect.left) / pageRect.width,
    y: Math.max(0, rect.top - pageRect.top) / pageRect.height,
    width: Math.min(rect.right, pageRect.right) - Math.max(rect.left, pageRect.left),
    height: Math.min(rect.bottom, pageRect.bottom) - Math.max(rect.top, pageRect.top),
  })).map(rect => ({ ...rect, width: rect.width / pageRect.width, height: rect.height / pageRect.height }))
    .filter(rect => rect.width > .001 && rect.height > .001 && rect.x < 1 && rect.y < 1)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  for (const rect of rects) {
    const previous = merged[merged.length - 1];
    const sameLine = previous && Math.abs(previous.y - rect.y) < Math.max(previous.height, rect.height) * .55;
    const close = previous && rect.x <= previous.x + previous.width + .018;
    if (sameLine && close) {
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      previous.y = Math.min(previous.y, rect.y);
      previous.height = Math.max(previous.height, rect.height);
      previous.width = right - previous.x;
    } else merged.push({ ...rect });
  }
  return merged;
}

function showSelectionPopover(anchorRect) {
  closeSelectionPopover(false);
  const reader = state.reader;
  if (!reader?.lastSelection) return;
  const popover = document.createElement('aside');
  popover.className = 'selection-popover';
  popover.id = 'selection-popover';
  popover.innerHTML = `<header><span class="drag-handle" title="拖动调整位置">${gripIcon}</span><span class="title">ADD TO PROJECT NOTES</span><button type="button" data-close-selection aria-label="关闭">×</button></header>
    <blockquote>${escapeHtml(reader.lastSelection.quote)}</blockquote>
    <label class="selection-label">选择标签</label>
    <div class="selection-tags">${['关键证据', '理论观点', '研究方法', '数据结果', '待讨论'].map(tag => `<button type="button" class="${reader.lastSelection.tags.includes(tag) ? 'active' : ''}" data-selection-tag="${tag}"># ${tag}</button>`).join('')}</div>
    <label class="custom-tag"><span>#</span><input id="selection-custom-tag" maxlength="30" placeholder="自定义标签，回车添加"></label>
    <label class="selection-label">高亮颜色</label>
    <div class="selection-colors">${['#8bb8e8', '#f0c94f', '#e88b8b', '#8be0b8', '#c98be8', '#e8a08b'].map(color => `<button type="button" class="selection-color ${reader.lastSelection.color === color || (!reader.lastSelection.color && color === '#8bb8e8') ? 'active' : ''}" data-selection-color="${color}" style="background:${color}" title="选择高亮颜色"></button>`).join('')}</div>
    <textarea id="selection-note-content" maxlength="10000" placeholder="可补充你的理解、疑问或与项目的联系…"></textarea>
    <footer><small>第 ${reader.lastSelection.pageNumber} 页 · 将汇总到项目笔记</small><button type="button" id="save-selection-note">保存摘录</button></footer>`;
  document.body.append(popover);

  const popoverWidth = 288;
  const estimatedHeight = 300;
  const stored = reader.popoverPos;
  if (stored) {
    Object.assign(popover.style, {
      left: `${Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, stored.left))}px`,
      top: `${Math.max(8, Math.min(window.innerHeight - 90, stored.top))}px`,
    });
  } else {
    const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, anchorRect.left + anchorRect.width / 2 - popoverWidth / 2));
    const top = anchorRect.bottom + 12 + estimatedHeight < window.innerHeight ? anchorRect.bottom + 10 : Math.max(12, anchorRect.top - estimatedHeight - 10);
    Object.assign(popover.style, { left: `${left}px`, top: `${top}px` });
  }

  // 拖动：把弹窗移到不遮挡阅读的位置（本次会话内记住位置）
  const header = popover.querySelector('header');
  let dragState = null;
  header.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-close-selection]')) return;
    event.preventDefault();
    const rect = popover.getBoundingClientRect();
    dragState = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    popover.classList.add('dragging');
    popover.setPointerCapture?.(event.pointerId);
  });
  header.addEventListener('pointermove', event => {
    if (!dragState) return;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, event.clientX - dragState.dx));
    const top = Math.max(8, Math.min(window.innerHeight - 70, event.clientY - dragState.dy));
    Object.assign(popover.style, { left: `${left}px`, top: `${top}px` });
  });
  header.addEventListener('pointerup', () => {
    if (!dragState) return;
    const rect = popover.getBoundingClientRect();
    reader.popoverPos = { left: rect.left, top: rect.top };
    dragState = null;
    popover.classList.remove('dragging');
  });

  // 点击弹窗外区域或按 Esc 关闭（类 Hypothesis 的轻量交互）
  const outsideHandler = event => {
    const current = document.querySelector('#selection-popover');
    if (current && !current.contains(event.target)) closeSelectionPopover();
  };
  const escapeHandler = event => {
    if (event.key === 'Escape') closeSelectionPopover();
  };
  popover._outsideHandler = outsideHandler;
  popover._escapeHandler = escapeHandler;
  document.addEventListener('pointerdown', outsideHandler);
  document.addEventListener('keydown', escapeHandler);

  popover.querySelector('[data-close-selection]').addEventListener('pointerdown', event => event.preventDefault());
  popover.querySelector('[data-close-selection]').addEventListener('click', () => closeSelectionPopover());
  popover.querySelectorAll('[data-selection-tag]').forEach(button => {
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => {
      const tag = button.dataset.selectionTag;
      const tags = reader.lastSelection.tags;
      if (tags.includes(tag)) reader.lastSelection.tags = tags.filter(item => item !== tag);
      else if (tags.length < 8) reader.lastSelection.tags = [...tags, tag];
      button.classList.toggle('active', reader.lastSelection.tags.includes(tag));
    });
  });
  const customInput = popover.querySelector('#selection-custom-tag');
  customInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tag = customInput.value.trim().replace(/^#/, '').slice(0, 30);
    if (tag && !reader.lastSelection.tags.includes(tag) && reader.lastSelection.tags.length < 8) {
      reader.lastSelection.tags.push(tag);
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'active'; chip.dataset.selectionTag = tag; chip.textContent = `# ${tag}`;
      chip.addEventListener('pointerdown', pointerEvent => pointerEvent.preventDefault());
      chip.addEventListener('click', () => {
        reader.lastSelection.tags = reader.lastSelection.tags.filter(item => item !== tag);
        chip.remove();
      });
      popover.querySelector('.selection-tags').append(chip);
      customInput.value = '';
    }
  });
  popover.querySelector('#save-selection-note').addEventListener('pointerdown', event => event.preventDefault());
  popover.querySelector('#save-selection-note').addEventListener('click', saveSelectionNote);
  // P1 增强：高亮颜色选择
  popover.querySelectorAll('[data-selection-color]').forEach(colorButton => {
    colorButton.addEventListener('click', () => {
      reader.lastSelection.color = colorButton.dataset.selectionColor;
      popover.querySelectorAll('[data-selection-color]').forEach(item => item.classList.toggle('active', item === colorButton));
    });
  });
}

async function saveSelectionNote() {
  const reader = state.reader;
  if (!reader?.lastSelection) return;
  const button = document.querySelector('#save-selection-note');
  button.disabled = true;
  button.textContent = '保存中…';
  try {
    const selection = reader.lastSelection;
    const result = await api(`/projects/${encodeURIComponent(reader.projectId)}/attachments/${encodeURIComponent(reader.attachmentId)}/selection-note`, {
      method: 'POST', body: JSON.stringify({
        pageNumber: selection.pageNumber,
        quote: selection.quote,
        rects: selection.rects,
        tags: selection.tags,
        content: document.querySelector('#selection-note-content')?.value.trim() || '',
        color: selection.color || '#8bb8e8',
      }),
    });
    reader.data.annotations.push(result.annotation);
    reader.data.notes.unshift(result.note);
    renderPageAnnotations(selection.pageNumber);
    publishReaderContext('annotations-updated');
    researchChannel?.postMessage({ type: 'notes-updated', projectId: reader.projectId });
    showReaderToast('摘录已加入项目笔记，并写入汇总文件。');
    closeSelectionPopover();
  } catch (error) {
    button.disabled = false;
    button.textContent = '保存摘录';
    showReaderToast(error.message, true);
  }
}

function closeSelectionPopover(clearSelection = true) {
  const popover = document.querySelector('#selection-popover');
  if (popover) {
    if (popover._outsideHandler) document.removeEventListener('pointerdown', popover._outsideHandler);
    if (popover._escapeHandler) document.removeEventListener('keydown', popover._escapeHandler);
    popover.remove();
  }
  const reader = state.reader;
  if (clearSelection) {
    reader && (reader.lastSelection = null);
    window.getSelection()?.removeAllRanges();
    clearSelectionPreview();
  }
}

function toggleAreaTool() {
  const reader = state.reader;
  reader.drawMode = !reader.drawMode;
  document.querySelector('#area-tool').classList.toggle('active', reader.drawMode);
  document.querySelectorAll('.reader-annotation-layer').forEach(layer => layer.classList.toggle('drawing', reader.drawMode));
}

function beginAreaAnnotation(event) {
  const reader = state.reader;
  if (!reader?.drawMode || event.button !== 0) return;
  const layer = event.currentTarget;
  const pageNumber = Number(layer.dataset.pageNumber);
  const bounds = layer.getBoundingClientRect();
  const startX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
  const startY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
  const draft = document.createElement('div');
  draft.className = 'annotation-rect area draft';
  layer.append(draft);
  layer.setPointerCapture(event.pointerId);
  const move = moveEvent => {
    const currentX = Math.max(0, Math.min(bounds.width, moveEvent.clientX - bounds.left));
    const currentY = Math.max(0, Math.min(bounds.height, moveEvent.clientY - bounds.top));
    Object.assign(draft.style, { left: `${Math.min(startX, currentX)}px`, top: `${Math.min(startY, currentY)}px`, width: `${Math.abs(currentX - startX)}px`, height: `${Math.abs(currentY - startY)}px` });
  };
  const end = async endEvent => {
    layer.removeEventListener('pointermove', move);
    layer.removeEventListener('pointerup', end);
    const rect = draft.getBoundingClientRect();
    draft.remove();
    toggleAreaTool();
    if (rect.width < 8 || rect.height < 8) return;
    await createReaderAnnotation('area', { color: '#c76b4f', quote: '', rects: [{ x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height, width: rect.width / bounds.width, height: rect.height / bounds.height }] }, pageNumber);
  };
  layer.addEventListener('pointermove', move);
  layer.addEventListener('pointerup', end);
}

async function createReaderAnnotation(kind, payload, pageNumber = state.reader?.pageNumber) {
  const reader = state.reader;
  try {
    const result = await api(`/projects/${encodeURIComponent(reader.projectId)}/attachments/${encodeURIComponent(reader.attachmentId)}/annotations`, {
      method: 'POST', body: JSON.stringify({ pageNumber, kind, payload }),
    });
    reader.data.annotations.push(result.annotation);
    renderPageAnnotations(pageNumber);
    publishReaderContext('annotations-updated');
  } catch (error) {
    showReaderToast(error.message, true);
  }
}

function renderPageAnnotations(pageNumber = null) {
  const reader = state.reader;
  if (!reader) return;
  const pages = pageNumber ? [pageNumber] : [...reader.renderedPages];
  for (const currentPage of pages) {
    const layer = document.querySelector(`.reader-annotation-layer[data-page-number="${currentPage}"]`);
    if (!layer) continue;
    layer.querySelectorAll('.annotation-rect:not(.draft)').forEach(node => node.remove());
    for (const annotation of reader.data.annotations.filter(item => item.pageNumber === currentPage)) {
      for (const rect of annotation.payload.rects) {
        const marker = document.createElement('div');
        marker.className = `annotation-rect ${annotation.kind}`;
        marker.style.setProperty('--annotation-color', annotation.payload.color);
        Object.assign(marker.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
        layer.append(marker);
      }
    }
  }
}

function setReaderPage(pageNumber) {
  const reader = state.reader;
  const next = Math.max(1, Math.min(reader.pdf.numPages, Number.isFinite(pageNumber) ? Math.round(pageNumber) : reader.pageNumber));
  closeSelectionPopover();
  updateActiveReaderPage(next);
  renderPageInto(next);
  scrollReaderPageIntoView(next, true);
}

function updateActiveReaderPage(pageNumber) {
  const reader = state.reader;
  if (!reader || pageNumber === reader.pageNumber) return;
  reader.pageNumber = pageNumber;
  const input = document.querySelector('#page-number');
  if (input) input.value = String(pageNumber);
  const statusbar = document.querySelector('#statusbar-page');
  if (statusbar) statusbar.textContent = `第 ${pageNumber} / ${reader.pdf.numPages} 页`;
  document.querySelectorAll('.pdf-page-wrap').forEach(wrap => {
    wrap.classList.toggle('active', Number(wrap.dataset.pageNumber) === pageNumber);
  });
  updateThumbnailActive(pageNumber);
  publishReaderContext();
  // P1 增强：阅读进度保存（节流，供重开续读）
  saveReadingProgress(reader.attachmentId, pageNumber);
}

// P1 增强：进度落库（每页 800ms 节流，避免高频写入）
let lastProgressSave = 0;
function saveReadingProgress(attachmentId, pageNumber) {
  const now = Date.now();
  if (now - lastProgressSave < 800) return;
  lastProgressSave = now;
  api(`/attachments/${encodeURIComponent(attachmentId)}/progress`, {
    method: 'PUT', body: JSON.stringify({ pageNumber }),
  }).catch(() => {});
}

function scrollReaderPageIntoView(pageNumber, smooth) {
  const page = document.querySelector(`.pdf-page-wrap[data-page-number="${pageNumber}"]`);
  if (!page) return;
  const stage = document.querySelector('#reader-stage');
  if (!smooth || !stage) {
    page.scrollIntoView({ block: 'start', behavior: 'auto' });
    return;
  }
  const stageRect = stage.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  const target = Math.max(0, stage.scrollTop + (pageRect.top - stageRect.top));
  animateStageScroll(stage, stage.scrollTop, target);
}

function setReaderZoom(scale) {
  const reader = state.reader;
  reader.scale = Math.max(.65, Math.min(2.25, Math.round(scale * 20) / 20));
  renderReaderDocument();
}

async function fitReaderWidth() {
  const reader = state.reader;
  const stage = document.querySelector('#reader-stage');
  const page = reader.pageHandles.get(1) || await reader.pdf.getPage(1);
  const naturalWidth = page.getViewport({ scale: 1 }).width;
  setReaderZoom((stage.clientWidth - 88) / naturalWidth);
}

// ── 左侧缩略图侧栏 ────────────────────────────

function toggleThumbnails() {
  const shell = document.querySelector('.pdf-reader-shell');
  const button = document.querySelector('#toggle-thumbnails');
  if (!shell || !button) return;
  const hidden = shell.classList.toggle('thumbnails-hidden');
  button.classList.toggle('active', !hidden);
  // 目录与缩略图互斥显示
  const outline = document.querySelector('#reader-outline');
  if (outline && !outline.hidden && hidden) {
    outline.hidden = true;
    document.querySelector('#toggle-outline')?.classList.remove('active');
  }
}

// ── P1 增强：PDF 目录（outline） ──

function toggleOutline() {
  const outline = document.querySelector('#reader-outline');
  const thumbnails = document.querySelector('#reader-thumbnails');
  const button = document.querySelector('#toggle-outline');
  if (!outline || !button) return;
  const show = outline.hidden;
  outline.hidden = !show;
  button.classList.toggle('active', show);
  if (show && thumbnails) {
    thumbnails.hidden = true;
    document.querySelector('#toggle-thumbnails')?.classList.remove('active');
  }
}

/** 解析 outline 目标为 1-based 页码（尽力而为；解析失败返回 null）。 */
async function resolveOutlinePage(item) {
  const pdf = state.reader?.pdf;
  if (!pdf || !item?.dest) return null;
  try {
    if (typeof item.dest === 'string') {
      const dest = await pdf.getDestination(item.dest);
      if (Array.isArray(dest) && dest[0] && typeof dest[0] !== 'string' && typeof dest[0] !== 'number') {
        return (await pdf.getPageIndex(dest[0])) + 1;
      }
      return null;
    }
    if (Array.isArray(item.dest) && item.dest[0]) {
      if (typeof item.dest[0] === 'number') return item.dest[0] + 1;
      if (typeof item.dest[0] !== 'string') return (await pdf.getPageIndex(item.dest[0])) + 1;
    }
    return null;
  } catch {
    return null;
  }
}

function renderOutline() {
  const reader = state.reader;
  const list = document.querySelector('#outline-list');
  if (!reader || !list || !reader.outline?.length) return;
  const walk = (items, depth) => {
    for (const item of items) {
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'outline-item';
      entry.style.paddingLeft = `${8 + depth * 14}px`;
      entry.textContent = item.title || '（无标题）';
      entry.title = '点击跳转';
      entry.addEventListener('click', async () => {
        const page = await resolveOutlinePage(item);
        if (page) {
          setReaderPage(page);
          const active = list.querySelector('.outline-item.active');
          active?.classList.remove('active');
          entry.classList.add('active');
        }
      });
      list.append(entry);
      if (Array.isArray(item.items) && item.items.length) walk(item.items, depth + 1);
    }
  };
  walk(reader.outline, 0);
}

function renderThumbnails() {
  const reader = state.reader;
  const list = document.querySelector('#thumbnails-list');
  if (!reader || !list) return;
  list.innerHTML = '';
  for (let pageNumber = 1; pageNumber <= reader.pdf.numPages; pageNumber += 1) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'thumb-item';
    item.dataset.pageNumber = String(pageNumber);
    item.title = `第 ${pageNumber} 页`;
    item.innerHTML = '<canvas></canvas><span></span>';
    item.addEventListener('click', () => setReaderPage(pageNumber));
    list.append(item);
  }
  reader.thumbObserver?.disconnect();
  reader.thumbObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) renderThumbInto(Number(entry.target.dataset.pageNumber));
    }
  }, { root: list, rootMargin: '320px 0px' });
  list.querySelectorAll('.thumb-item').forEach(item => reader.thumbObserver.observe(item));
  updateThumbnailActive(reader.pageNumber);
}

async function renderThumbInto(pageNumber) {
  const reader = state.reader;
  if (!reader || reader.thumbRendered.has(pageNumber)) return;
  const item = document.querySelector(`.thumb-item[data-page-number="${pageNumber}"]`);
  const canvas = item?.querySelector('canvas');
  const label = item?.querySelector('span');
  if (!canvas) return;
  const page = reader.pageHandles.get(pageNumber) || await reader.pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const thumbScale = Math.max(.08, Math.min(.3, 120 / base.width));
  const viewport = page.getViewport({ scale: thumbScale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  if (label) label.textContent = String(pageNumber);
  reader.thumbRendered.add(pageNumber);
}

function updateThumbnailActive(pageNumber) {
  document.querySelectorAll('.thumb-item').forEach(item => {
    item.classList.toggle('active', Number(item.dataset.pageNumber) === pageNumber);
  });
  document.querySelector(`.thumb-item[data-page-number="${pageNumber}"]`)
    ?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
}

// ── 全文搜索 ──────────────────────────────────

function bindReaderSearch() {
  const input = document.querySelector('#search-input');
  const next = document.querySelector('#search-next');
  const prev = document.querySelector('#search-prev');
  const close = document.querySelector('#search-close');
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) navigateReaderSearch(-1);
      else if (state.reader?.searchMatches?.length) navigateReaderSearch(1);
      else runReaderSearch();
    }
    if (event.key === 'Escape') closeReaderSearch();
  });
  input?.addEventListener('input', () => {
    if (!input.value.trim()) closeReaderSearch(false);
  });
  next?.addEventListener('click', () => {
    if (state.reader?.searchMatches?.length) navigateReaderSearch(1);
    else runReaderSearch();
  });
  prev?.addEventListener('click', () => navigateReaderSearch(-1));
  close?.addEventListener('click', () => closeReaderSearch());
}

async function runReaderSearch() {
  const reader = state.reader;
  const input = document.querySelector('#search-input');
  const query = input?.value?.trim() || '';
  closeReaderSearch(false);
  if (!query || !reader) return;
  reader.searchQuery = query;
  const needle = query.toLowerCase();
  reader.searchMatches = [];
  for (let pageNumber = 1; pageNumber <= reader.pdf.numPages; pageNumber += 1) {
    const index = await getPageTextIndex(reader, pageNumber);
    const text = index.text.toLowerCase();
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(needle, from);
      if (at === -1) break;
      const chars = [];
      for (let offset = 0; offset < needle.length; offset += 1) {
        const entry = index.chars[at + offset];
        if (entry) chars.push(entry);
      }
      if (chars.length) {
        const rects = charEntriesToRects(reader, pageNumber, chars);
        if (rects.length) {
          reader.searchMatches.push({
            pageNumber,
            rects,
            snippet: index.text.slice(at, at + needle.length),
          });
        }
      }
      from = at + needle.length;
    }
  }
  if (!reader.searchMatches.length) {
    const count = document.querySelector('#search-count');
    if (count) count.textContent = '无结果';
    return;
  }
  reader.searchIndex = 0;
  renderSearchHits(0);
  const count = document.querySelector('#search-count');
  if (count) count.textContent = `1 / ${reader.searchMatches.length}`;
  jumpToSearchMatch(0, true);
}

async function getPageTextIndex(reader, pageNumber) {
  if (reader.textIndexes.has(pageNumber)) return reader.textIndexes.get(pageNumber);
  const page = reader.pageHandles.get(pageNumber) || await reader.pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = (content.items || []).filter(item => typeof item?.str === 'string' && item.str);
  const chars = [];
  let text = '';
  let previous = null;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    if (previous) {
      const gap = (item.transform?.[4] || 0) - ((previous.transform?.[4] || 0) + (previous.width || 0));
      if (gap > 1) {
        text += ' ';
        chars.push(null);
      }
    }
    const str = String(item.str);
    for (let charIndex = 0; charIndex < str.length; charIndex += 1) {
      text += str[charIndex];
      chars.push({ itemIndex, charIndex });
    }
    previous = item;
  }
  const index = { text, chars, items };
  reader.textIndexes.set(pageNumber, index);
  return index;
}

function charEntriesToRects(reader, pageNumber, entries) {
  const index = reader.textIndexes.get(pageNumber);
  const page = reader.pageHandles.get(pageNumber);
  if (!index || !page) return [];
  const viewport = page.getViewport({ scale: reader.scale });
  const rects = [];
  let last = null;
  for (const entry of entries) {
    const item = index.items[entry.itemIndex];
    if (!item) continue;
    const charWidth = (item.width || 0) / Math.max(1, String(item.str).length);
    const x0 = (item.transform?.[4] || 0) + entry.charIndex * charWidth;
    const y0 = item.transform?.[5] || 0;
    const p0 = viewport.convertToViewportPoint(x0, y0);
    const p1 = viewport.convertToViewportPoint(x0 + charWidth, y0 + (item.height || 0));
    const rect = {
      x: Math.min(p0[0], p1[0]) / viewport.width,
      y: Math.min(p0[1], p1[1]) / viewport.height,
      width: Math.abs(p1[0] - p0[0]) / viewport.width,
      height: Math.abs(p1[1] - p0[1]) / viewport.height,
    };
    if (last && Math.abs(last.y - rect.y) < Math.max(last.height, rect.height) * .55 && rect.x <= last.x + last.width + .012) {
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      last.width = right - last.x;
      last.height = Math.max(last.height, rect.height);
    } else {
      rects.push(rect);
      last = rect;
    }
  }
  return rects.filter(rect => rect.width > .001 && rect.height > .001);
}

function renderSearchHits(activeIndex) {
  clearSearchHits();
  const reader = state.reader;
  if (!reader) return;
  reader.searchMatches?.forEach((match, index) => {
    const layer = document.querySelector(`.reader-annotation-layer[data-page-number="${match.pageNumber}"]`);
    if (!layer) return;
    for (const rect of match.rects) {
      const marker = document.createElement('div');
      marker.className = `search-hit${index === activeIndex ? ' active' : ''}`;
      Object.assign(marker.style, {
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
      });
      layer.append(marker);
    }
  });
}

function clearSearchHits() {
  document.querySelectorAll('.search-hit').forEach(marker => marker.remove());
}

function navigateReaderSearch(delta) {
  const reader = state.reader;
  if (!reader?.searchMatches?.length) return;
  const total = reader.searchMatches.length;
  reader.searchIndex = (reader.searchIndex + delta + total) % total;
  renderSearchHits(reader.searchIndex);
  const count = document.querySelector('#search-count');
  if (count) count.textContent = `${reader.searchIndex + 1} / ${total}`;
  jumpToSearchMatch(reader.searchIndex, true);
}

function jumpToSearchMatch(index, smooth) {
  const reader = state.reader;
  const match = reader.searchMatches?.[index];
  if (!match) return;
  updateActiveReaderPage(match.pageNumber);
  renderPageInto(match.pageNumber);
  scrollReaderPageIntoView(match.pageNumber, smooth);
  requestAnimationFrame(() => {
    const wrap = document.querySelector(`.pdf-page-wrap[data-page-number="${match.pageNumber}"]`);
    const stage = document.querySelector('#reader-stage');
    if (!wrap || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const matchY = stage.scrollTop + (wrapRect.top - stageRect.top) + (match.rects[0]?.y || 0) * wrapRect.height;
    const target = Math.max(0, matchY - stage.clientHeight * .28);
    if (smooth) animateStageScroll(stage, stage.scrollTop, target);
    else stage.scrollTop = target;
  });
}

function closeReaderSearch(clearQuery = true) {
  const reader = state.reader;
  if (!reader) return;
  if (clearQuery) {
    const input = document.querySelector('#search-input');
    if (input) input.value = '';
  }
  const count = document.querySelector('#search-count');
  if (count) count.textContent = '';
  reader.searchQuery = null;
  reader.searchMatches = [];
  reader.searchIndex = -1;
  clearSearchHits();
}

// ── 键盘快捷键与滚动动画 ──────────────────────

function onReaderKeydown(event) {
  const reader = state.reader;
  if (!reader) return;
  const target = event.target;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (event.key === 'Escape') {
    if (document.querySelector('#selection-popover')) return;
    const searchInput = document.querySelector('#search-input');
    if (searchInput?.value || reader.searchMatches?.length) {
      closeReaderSearch();
      event.preventDefault();
    }
    return;
  }
  if (typing) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const stage = document.querySelector('#reader-stage');
  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    const amount = stage.clientHeight * .85;
    if (event.shiftKey) stage.scrollTop = Math.max(0, stage.scrollTop - amount);
    else stage.scrollTop = Math.min(stage.scrollHeight - stage.clientHeight, stage.scrollTop + amount);
    return;
  }
  if (ctrl && (event.key === 'f' || event.key === 'F')) {
    event.preventDefault();
    const input = document.querySelector('#search-input');
    input?.focus();
    input?.select();
    return;
  }
  if (event.key === 'F3' || (ctrl && event.key.toLowerCase() === 'g')) {
    event.preventDefault();
    if (event.shiftKey) navigateReaderSearch(-1);
    else navigateReaderSearch(1);
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    setReaderZoom(reader.scale + .15);
    return;
  }
  if (event.key === '-') {
    event.preventDefault();
    setReaderZoom(reader.scale - .15);
    return;
  }
  if (ctrl && event.key === '0') {
    event.preventDefault();
    fitReaderWidth();
    return;
  }
  if (event.key === 'Home') { event.preventDefault(); setReaderPage(1); return; }
  if (event.key === 'End') { event.preventDefault(); setReaderPage(reader.pdf.numPages); return; }
  if (event.key === 'PageDown') { event.preventDefault(); setReaderPage(reader.pageNumber + 1); return; }
  if (event.key === 'PageUp') { event.preventDefault(); setReaderPage(reader.pageNumber - 1); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    stage.scrollTop = Math.min(stage.scrollHeight - stage.clientHeight, stage.scrollTop + 70);
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    stage.scrollTop = Math.max(0, stage.scrollTop - 70);
  }
}

function animateStageScroll(stage, from, to) {
  const duration = 220;
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    stage.scrollTop = from + (to - from) * eased;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── v36：通知中心（原 reader-toast / undo-toast / #notice 三套合并）──────

let hanaToastRoot = null;

function ensureHanaToastRoot() {
  if (hanaToastRoot?.isConnected) return hanaToastRoot;
  hanaToastRoot = document.createElement('div');
  hanaToastRoot.id = 'hana-toast-root';
  hanaToastRoot.setAttribute('role', 'status');
  hanaToastRoot.setAttribute('aria-live', 'polite');
  document.body.append(hanaToastRoot);
  return hanaToastRoot;
}

/**
 * 堆叠式通知。tone：info | success | error | action。
 * 提供 actionLabel 时展示动作按钮（如「撤销」）；onAction 收到 { button }，
 * 动作执行期间自动暂停倒计时，结束后本条自行退场。
 */
function showHanaToast({ message, tone = 'info', duration = 3800, actionLabel = '', onAction = null }) {
  const rootEl = ensureHanaToastRoot();
  while (rootEl.children.length >= 4) rootEl.firstElementChild.remove();
  const toast = document.createElement('div');
  toast.className = `hana-toast ${tone}`;
  toast.innerHTML = `<span class="hana-toast-dot" aria-hidden="true"></span><span class="hana-toast-text"></span>${actionLabel ? `<button type="button" class="chip-small"><span data-action-label>${escapeHtml(actionLabel)}</span></button>` : ''}`;
  toast.querySelector('.hana-toast-text').textContent = message;
  rootEl.append(toast);
  let timer = 0;
  let remaining = duration;
  let startedAt = performance.now();
  const dismiss = () => {
    window.clearTimeout(timer);
    if (!toast.isConnected || toast.classList.contains('leaving')) return;
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 150);
  };
  const pause = () => {
    window.clearTimeout(timer);
    remaining -= performance.now() - startedAt;
  };
  const resume = () => {
    startedAt = performance.now();
    timer = window.setTimeout(dismiss, Math.max(600, remaining));
  };
  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('mouseleave', resume);
  resume();
  if (onAction) {
    const button = toast.querySelector('button');
    button.addEventListener('click', async () => {
      pause();
      try { await onAction({ button }); }
      finally { dismiss(); }
    });
  }
  return toast;
}

function showReaderToast(message, isError = false) {
  showNotice(message, isError);
}

function publishReaderContext(type = 'reader-context') {
  const reader = state.reader;
  if (!reader) return;
  const payload = {
    type,
    projectId: reader.projectId,
    attachmentId: reader.attachmentId,
    pageNumber: reader.pageNumber,
    pageCount: reader.pdf.numPages,
    paperTitle: reader.data.paper.title,
    projectTitle: reader.data.project.title,
  };
  localStorage.setItem('hana-research-reader-context', JSON.stringify(payload));
  researchChannel?.postMessage(payload);
}

function showUndoToast(message, restore) {
  showHanaToast({
    message,
    tone: 'action',
    duration: 7000,
    actionLabel: '撤销',
    onAction: async ({ button }) => {
      await runButtonAction(button, { key: `undo:${Date.now()}`, pendingLabel: '恢复中', errorPrefix: '撤销失败' }, restore);
    },
  });
}

function showNotice(message, isError = false) {
  showHanaToast({ message, tone: isError ? 'error' : 'info', duration: isError ? 5200 : 3800 });
}

window.addEventListener('unhandledrejection', event => {
  const message = event.reason?.message || String(event.reason || '操作未完成');
  console.error('[hana-research] 未处理的操作异常：', event.reason);
  showNotice(message, true);
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

updateAppBarRoute();
if (workspace === 'projects') loadProjects();
else loadLiterature();
