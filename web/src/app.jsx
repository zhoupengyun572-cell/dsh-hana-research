// PdfWorkspace：三栏文献阅读工作区（左侧导航 / 中央 EmbedPDF / 右侧 Tiptap 笔记）。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';
import { FontCharset } from '@embedpdf/models';
import { buildMarkupAnnotation, markupKind, toEngineTransferItems, toStorageTransferItems } from './annotations.js';
import {
  readHostTokens, paletteFromTokens, buildViewerTheme, applyPaletteCssVars, watchHostTheme,
} from './theme.js';
import { repositories, loadPdfBlobUrl, createSaveQueue } from './services.js';
import { NoteEditor, createMarkdownConverter, buildExtensions, citationJumpHolder } from './tiptap-config.jsx';
import { bookmarkPageNumber, countBookmarks, readReaderTheme, writeReaderTheme } from './workspace-utils.js';
import {
  IconBack, IconOutline, IconThumbnails, IconSearch, IconAnnotations, IconCollapseLeft,
  IconCollapseRight, IconTheme, IconPanelLeft, IconPanelRight, IconDownload, IconCheck, IconAlert,
  IconHighlighter, IconUnderline, IconStrike, IconQuote, IconCopy, IconSpark,
  IconLocate, IconEdit, IconDelete, IconStale, IconNote, IconStar, IconStarFilled, IconMore,
  IconRetry, IconPlus, IconChevronDown, IconTag,
} from './icons.jsx';

// 引擎资源必须用绝对 URL：EmbedPDF 的 worker 是 Blob module worker，
// 其 base URL 为 blob:，无法解析相对路径（wasmUrl/字体 URL 均需绝对化）。
const ABS = (path) => new URL(path, window.location.href).href;

function handoffReaderToAgent({ projectId, attachmentId, paperTitle, projectTitle, pageNumber }) {
  const prompt = `请继续协助我精读《${paperTitle || '当前文献'}》${projectTitle ? `（项目：${projectTitle}）` : ''}。projectId: ${projectId}；attachmentId: ${attachmentId}；当前阅读到第 ${pageNumber || 1} 页。请先调用 hana_research_get_reader_context 和 hana_research_get_project_brief 读取真实上下文，再结合已有逐句笔记与汇总笔记建议下一步。引用证据时保留页码；没有对应笔记时请明确说明，不要推测全文内容。`;
  const requestId = `reader-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve) => {
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', receive);
      if (timer) window.clearTimeout(timer);
      resolve(result);
    };
    const receive = (event) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.type !== 'hana-research.agent-handoff-ack' || message.requestId !== requestId) return;
      finish(message.ok ? { ok: true } : { ok: false, error: message.error || '无法写入 Agent 输入框' });
    };
    window.addEventListener('message', receive);
    timer = window.setTimeout(() => finish({ ok: false, error: '当前会话还没有可用的 Agent 输入框' }), 2400);
    try {
      window.top.postMessage({
        type: 'hana-research.agent-handoff',
        requestId,
        prompt,
        label: '当前阅读上下文已交给 Agent',
      }, window.location.origin);
    } catch {
      finish({ ok: false, error: '无法连接 Agent 输入框，请稍后重试' });
    }
  });
}

const FONT_URLS = {
  [FontCharset.GB2312]: [
    { url: ABS('/ui/hana-research/assets/vendor/embedpdf/fonts/NotoSansHans-Regular.otf'), weight: 400 },
    { url: ABS('/ui/hana-research/assets/vendor/embedpdf/fonts/NotoSansHans-Bold.otf'), weight: 700 },
  ],
};

// 高亮/下划线/删除线颜色预设（长时阅读友好，深/浅色均可读）
const MARKUP_COLORS = ['#FFD54F', '#7CC27F', '#7FB3E8', '#E39A9A', '#C9A3E8', '#A8C5A2'];

// 逐句笔记状态标签
const NOTE_STATUS_LABELS = { inbox: '待整理', organized: '已整理', verify: '待验证' };
const NOTE_STATUS_OPTIONS = [['inbox', '待整理'], ['organized', '已整理'], ['verify', '待验证']];
const IMPORTANCE_LABELS = { 1: '★', 2: '★★', 3: '★★★' };

// 阅读器导航上下文（进入时写入 sessionStorage，返回时读取；不依赖浏览器历史）
function readNavContext() {
  try {
    const raw = sessionStorage.getItem('hana-reader-nav');
    return raw ? JSON.parse(raw) : { from: 'project-detail', projectId: '', paperId: '', attachmentId: '' };
  } catch {
    return { from: 'project-detail', projectId: '', paperId: '', attachmentId: '' };
  }
}

/** 简短时间显示（今天 HH:MM / N 天前 / YYYY-MM-DD）。 */
function formatShortTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays < 7) return diffDays + ' 天前';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 合并/更新逐句笔记列表（按 id 替换，保留顺序）。 */
function upsertSentenceNote(list, note) {  if (!note?.id) return list;
  const index = list.findIndex(n => n.id === note.id);
  if (index < 0) return [...list, note];
  const next = list.slice();
  next[index] = note;
  return next;
}

/** 客户端筛选/排序逐句笔记（搜索摘录+评论，分类/标签/状态/收藏筛选，排序）。 */
function applyNoteFilters(notes, filters) {  const kw = (filters.q || '').trim().toLowerCase();
  let list = notes;
  if (kw) {
    list = list.filter(n => (n.quotedText || '').toLowerCase().includes(kw) || (n.comment || '').toLowerCase().includes(kw));
  }
  if (filters.category === 'none') {
    list = list.filter(n => !n.categoryId);
  } else if (filters.category) {
    list = list.filter(n => n.categoryId === filters.category);
  }
  if (filters.tag) list = list.filter(n => (n.tags || []).includes(filters.tag));
  if (filters.status) list = list.filter(n => n.status === filters.status);
  if (filters.starred) list = list.filter(n => n.starred);
  if (filters.importance) list = list.filter(n => n.importance === Number(filters.importance));
  const sort = filters.sort || 'page';
  return list.slice().sort((a, b) => {
    if (sort === 'updated') return String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (sort === 'created') return String(b.createdAt).localeCompare(String(a.createdAt));
    return (a.pageNumber - b.pageNumber) || String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

export default function PdfWorkspace({ projectId, attachmentId, paperId, paperTitle, projectTitle }) {
  // ── 主题 ──
  const [themeMode, setThemeMode] = useState(() => readReaderTheme()); // auto | light | dark
  const [palette, setPalette] = useState(() => paletteFromTokens(readHostTokens(), themeMode));
  const viewerTheme = useMemo(() => buildViewerTheme(palette, themeMode), [palette, themeMode]);
  // EmbedPDF 只在初始化时消费 config（无运行时换肤 API），主题变化需以 key 重挂载画布。
  // 用颜色内容生成 key，避免宿主主题抖动导致的无谓重载。
  const viewerThemeKey = useMemo(() => [
    themeMode, palette.bgBase, palette.bgLayer1, palette.labelPrimary, palette.labelSecondary, palette.borderL1, palette.brand,
  ].join('|'), [themeMode, palette]);

  // ── 布局 ──
  const [layout, setLayout] = useState({ leftWidth: 260, rightWidth: 380, leftCollapsed: false, rightCollapsed: false });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [leftTab, setLeftTab] = useState('annotations');
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── PDF 资源 ──
  const [pdf, setPdf] = useState({ status: 'loading', url: null, error: null });
  const pdfResource = useRef(null);

  // ── EmbedPDF ──
  const viewerRef = useRef(null);
  const [registry, setRegistry] = useState(null);
  const [documentId, setDocumentId] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [pageSizes, setPageSizes] = useState({});

  // ── 数据 ──
  const [annotations, setAnnotations] = useState([]); // v2 视图（含 embedPdf）
  const [noteDoc, setNoteDoc] = useState(null);
  const [citations, setCitations] = useState([]);
  const [saveStates, setSaveStates] = useState({ note: 'idle', annotations: 'idle', progress: 'idle' });
  const [legacyMigrated, setLegacyMigrated] = useState(false);

  // ── v13：逐句笔记 / 分类 / 标签 / 右侧双视图 ──
  const [sentenceNotes, setSentenceNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tagColors, setTagColors] = useState({});
  const [allTags, setAllTags] = useState([]);
  const [rightTab, setRightTab] = useState('sentence'); // sentence | summary
  const rightTabRef = useRef('sentence');
  rightTabRef.current = rightTab;
  const [noteFilters, setNoteFilters] = useState({ q: '', category: '', tag: '', status: '', starred: false, importance: '', sort: 'page' });
  const [noteSaveState, setNoteSaveState] = useState('idle'); // idle | pending | saving | saved | error
  const [noteSaveError, setNoteSaveError] = useState('');
  const [pendingFocusNoteId, setPendingFocusNoteId] = useState(null);
  const [tagStats, setTagStats] = useState({}); // tag -> count（来自 /notes/tags 聚合）
  const [metaManagerOpen, setMetaManagerOpen] = useState(false);
  const sentenceSavesRef = useRef(new Map()); // noteId -> { timer, patch, promise, failed }
  const [confirmBox, setConfirmBox] = useState(null); // 三选一确认（删除笔记等）
  const [inputBox, setInputBox] = useState(null); // 阅读器统一文本输入弹窗

  // ── P6：宿主能力探测（结构化证据依赖宿主更新；旧宿主只读预览，不静默丢数据） ──
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    let alive = true;
    repositories.getCapabilities()
      .then((value) => { if (alive) setCaps(value || {}); })
      .catch(() => { if (alive) setCaps({}); });
    return () => { alive = false; };
  }, []);
  const evidenceCapable = Boolean(caps && caps.evidence && caps.cockpitStats);

  // ── 选择工具条 / AI 解释 ──
  const [selectionMenu, setSelectionMenu] = useState(null); // { placement, text, pageIndex, formatted }
  const [explainBox, setExplainBox] = useState(null); // { text, status, result, anchor }
  const [annotationPeek, setAnnotationPeek] = useState(null); // { item, x, y }
  const lastViewerPointer = useRef({ x: window.innerWidth / 2, y: 120 });
  const [toast, setToast] = useState(null);
  const [agentHandoffState, setAgentHandoffState] = useState('idle');
  const toastTimer = useRef(null);
  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const handoffCurrentReader = useCallback(async () => {
    if (agentHandoffState === 'pending') return;
    setAgentHandoffState('pending');
    const result = await handoffReaderToAgent({
      projectId, attachmentId, paperTitle, projectTitle, pageNumber: activePage,
    });
    if (!result.ok) {
      setAgentHandoffState('error');
      showToast(result.error || '交接失败，请重试', true);
      window.setTimeout(() => setAgentHandoffState('idle'), 2400);
      return;
    }
    setAgentHandoffState('done');
    showToast('已加入 Agent 输入框');
  }, [agentHandoffState, projectId, attachmentId, paperTitle, projectTitle, activePage, showToast]);

  // ── 返回导航 ──
  const [backState, setBackState] = useState('idle'); // idle | saving | error
  const backBusyRef = useRef(false);

  // ── 保存队列 ──
  const noteQueue = useRef(null);
  const annotationsQueue = useRef(null);
  const progressQueue = useRef(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [annDirty, setAnnDirty] = useState(false);

  useEffect(() => {
    noteQueue.current = createSaveQueue({
      debounceMs: 1200,
      flush: async (payload) => {
        const result = await repositories.putNoteDocument(paperId, payload);
        setNoteDoc(result.document);
      },
      onStatus: (status) => setSaveStates(prev => ({ ...prev, note: status })),
    });
    annotationsQueue.current = createSaveQueue({
      debounceMs: 500,
      flush: async (payload) => {
        const result = await repositories.putAnnotations(attachmentId, payload.items);
        setAnnotations(result.annotations);
      },
      onStatus: (status) => setSaveStates(prev => ({ ...prev, annotations: status })),
    });
    progressQueue.current = createSaveQueue({
      debounceMs: 600,
      flush: async (payload) => {
        await repositories.putProgress(attachmentId, payload.pageNumber);
        await repositories.putReadingState(paperId, payload);
      },
      onStatus: (status) => setSaveStates(prev => ({ ...prev, progress: status })),
    });
  }, [paperId, attachmentId]);

  const hasDirty = useCallback(() => {
    if (noteDirty || annDirty) return true;
    for (const entry of sentenceSavesRef.current.values()) {
      if (entry.timer || entry.promise || entry.failed || (entry.patch && Object.keys(entry.patch).length)) return true;
    }
    return false;
  }, [noteDirty, annDirty]);
  // 程序化返回导航放行标志：保存流程完成后置 true，beforeunload 不再拦截
  // （根因：beforeunload preventDefault 会静默取消 location.href 导航，导致返回键"无响应"）。
  const allowUnloadRef = useRef(false);
  useEffect(() => {
    const handler = (event) => {
      if (allowUnloadRef.current) return;
      if (hasDirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasDirty]);

  // ── 初始数据加载 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resource = await loadPdfBlobUrl(attachmentId);
        if (cancelled) { resource.dispose(); return; }
        pdfResource.current = resource;
        setPdf({ status: 'ready', url: resource.url, error: null });
      } catch (error) {
        setPdf({ status: 'error', url: null, error: String(error.message || error) });
        return;
      }
      try {
        const [stateRes, noteRes, annRes, snRes, catRes, tagsRes] = await Promise.all([
          repositories.getReadingState(paperId),
          repositories.getNoteDocument(paperId),
          repositories.getAnnotations(attachmentId),
          repositories.listSentenceNotes(paperId, { attachmentId }).catch(() => ({ notes: [] })),
          repositories.listNoteCategories().catch(() => ({ categories: [] })),
          repositories.listTags().catch(() => ({ tags: [] })),
        ]);
        if (cancelled) return;
        const state = stateRes.state;
        if (state) {
          setLayout({
            leftWidth: state.leftPanelWidth, rightWidth: state.rightPanelWidth,
            leftCollapsed: state.leftPanelCollapsed, rightCollapsed: state.rightPanelCollapsed,
          });
          if (state.rightTab === 'summary') setRightTab('summary');
        }
        const doc = noteRes.document;
        if (doc) {
          setNoteDoc(doc);
          try {
            const citeRes = await repositories.listCitations(doc.id);
            if (!cancelled) setCitations(citeRes.citations);
          } catch { /* 引文加载失败不阻断 */ }
        }
        setAnnotations(annRes.annotations || []);
        setSentenceNotes(snRes.notes || []);
        setCategories(catRes.categories || []);
        const colors = {};
        const stats = {};
        const tagList = (tagsRes.tags || []).map((t) => {
          if (t.color) colors[t.tag] = t.color;
          stats[t.tag] = t.count;
          return t.tag;
        });
        setTagColors(colors);
        setTagStats(stats);
        setAllTags(tagList);
      } catch (error) {
        showToast('部分数据加载失败：' + String(error.message || error), true);
      }
    })();
    return () => {
      cancelled = true;
      pdfResource.current?.dispose();
      pdfResource.current = null;
    };
  }, [paperId, attachmentId]);

  // ── 主题实时跟随（宿主属性变化 + 系统明暗偏好兜底） ──
  useEffect(() => {
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => {
      const tokens = readHostTokens();
      // 无宿主 token 时 auto 跟随操作系统明暗，避免独立打开页面永远浅色
      const resolvedMode = themeMode === 'auto' && !tokens?.bgBase
        ? (systemDark?.matches ? 'dark' : 'light')
        : themeMode;
      const next = paletteFromTokens(tokens, resolvedMode);
      setPalette(next);
      applyPaletteCssVars(next);
    };
    update();
    const stopWatch = watchHostTheme(update);
    systemDark?.addEventListener?.('change', update);
    return () => {
      stopWatch();
      systemDark?.removeEventListener?.('change', update);
    };
  }, [themeMode]);

  // 用户选择独立于宿主主题保存；受限 iframe/localStorage 不可用时静默退回 auto。
  useEffect(() => {
    writeReaderTheme(themeMode);
  }, [themeMode]);

  const activePageRef = useRef(1);

  // ── EmbedPDF 就绪：接管 registry / 阅读进度 / legacy 批注 ──
  const onViewerReady = useCallback((reg) => {
    setRegistry(reg);
    // 主题切换会重挂载 viewer：新引擎为空，已保存批注需全部重新导入
    importedAnnotationIdsRef.current = new Set();
    // 问题一修复：取消 EmbedPDF 原生选择菜单（schema.selectionMenus），只保留插件工具栏。
    // mergeSchema 顶层展开会整体替换 selectionMenus；菜单渲染器在选区出现时才读取 schema，
    // 因此此时清除即可确保原生菜单永不渲染（不依赖 CSS 隐藏，也不禁用批注能力）。
    try {
      const uiCap = reg.getPlugin?.('ui')?.provides?.();
      if (uiCap?.mergeSchema) {
        uiCap.mergeSchema({ selectionMenus: {} });
      }
    } catch { /* 忽略：无 UI 插件时不影响 */ }
    // 调试/集成验证句柄
    window.__hanaDebug = {
      registry: reg,
      getSelectionCapability: () => reg?.getPlugin?.('selection')?.provides?.() ?? null,
      getAnnotationCapability: () => reg?.getPlugin?.('annotation')?.provides?.() ?? null,
      getUiSchema: () => reg?.getPlugin?.('ui')?.provides?.()?.getSchema?.() ?? null,
      getQueues: () => ({
        note: { status: noteQueue.current?.getStatus?.(), error: String(noteQueue.current?.getError?.()?.message || '') },
        annotations: { status: annotationsQueue.current?.getStatus?.(), error: String(annotationsQueue.current?.getError?.()?.message || '') },
      }),
      triggerAnnotationSync: () => syncAnnotationsFromEngineRef.current?.(),
    };
    try {
      const store = reg.getStore();
      const coreState = store.getState().core;
      const docs = coreState?.documents || {};
      const firstDoc = Object.keys(docs)[0];
      if (firstDoc) {
        setDocumentId(firstDoc);
        const pages = docs[firstDoc]?.document?.pages || docs[firstDoc]?.pages || [];
        setPageCount(pages.length);
        const sizes = {};
        pages.forEach((page, index) => {
          sizes[index + 1] = { width: page?.size?.width || 612, height: page?.size?.height || 792 };
        });
        setPageSizes(sizes);
      }
      // 订阅滚动页面变化 → 阅读进度
      try {
        store.subscribe((action, newState) => {
          const resolvedDocument = newState?.core?.documents?.[firstDoc];
          const resolvedPages = resolvedDocument?.document?.pages || resolvedDocument?.pages || [];
          if (resolvedPages.length) {
            setPageCount(resolvedPages.length);
            setPageSizes((previous) => {
              if (Object.keys(previous).length === resolvedPages.length) return previous;
              const next = {};
              resolvedPages.forEach((pageInfo, index) => {
                next[index + 1] = { width: pageInfo?.size?.width || 612, height: pageInfo?.size?.height || 792 };
              });
              return next;
            });
          }
          const page = newState?.core?.currentPage ?? newState?.plugins?.scroll?.currentPage;
          if (typeof page === 'number' && page > 0) {
            activePageRef.current = page;
            setActivePage(page);
          }
        });
      } catch { /* 订阅失败不影响 */ }
    } catch (error) {
      console.warn('registry init partial:', error);
    }
  }, []);

  // 恢复阅读进度 + 迁移 legacy 批注（页面尺寸就绪后）
  useEffect(() => {
    if (!registry || !documentId || !pageCount) return;
    (async () => {
      try {
        const stateRes = await repositories.getReadingState(paperId);
        const saved = stateRes.state;
        if (saved?.currentPage && saved.currentPage >= 1) {
          jumpToPage(saved.currentPage);
        }
        // v13：恢复缩放比例（能力不存在时静默跳过）
        if (saved?.zoom && saved.zoom !== 1) {
          try {
            const zoomCap = getCapability('zoom');
            zoomCap?.requestZoom?.(saved.zoom, { vx: 0.5, vy: 0.5 });
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      // legacy 批注换算 + 导入
      const legacy = annotations.filter(a => !a.embedPdf && a.payload?.rects?.length);
      if (legacy.length && !legacyMigrated) {
        try {
          const converted = await repositories.convertLegacyAnnotations(attachmentId, pageSizes);
          if (converted.items?.length) {
            const items = converted.items.map(item => ({ ...item }));
            importAnnotations(items);
            // 保存为 v2（与现有 EmbedPDF 批注合并）
            const current = await exportAnnotationsSafe();
            annotationsQueue.current?.schedule({ items: toStorageTransferItems([...current, ...items]) });
          }
          if (converted.failed?.length) {
            console.warn('部分旧批注无法迁移:', converted.failed);
            showToast(converted.failed.length + ' 条旧高亮缺少页面尺寸，已保留原样', true);
          }
        } catch (error) {
          console.warn('legacy migration failed:', error);
        }
        setLegacyMigrated(true);
      }
    })();
  }, [registry, documentId, pageCount, pageSizes, legacyMigrated]);

  // ── EmbedPDF 能力封装 ──
  const getCapability = useCallback((pluginId) => {
    return registry?.getPlugin?.(pluginId)?.provides?.() ?? null;
  }, [registry]);

  // 监听画布批注选中状态，在点击位置给出轻量就地操作，而不是复用庞大的原生菜单。
  useEffect(() => {
    if (!registry || !documentId) return undefined;
    const annotationCap = getCapability('annotation');
    const scope = annotationCap?.forDocument?.(documentId);
    if (!scope?.onStateChange) return undefined;
    const syncSelection = (state) => {
      const uid = state?.selectedUids?.[0];
      if (!uid || state.selectedUids.length !== 1) {
        setAnnotationPeek(null);
        return;
      }
      const object = state.byUid?.[uid]?.object;
      if (!object) return;
      const stored = annotations.find((item) => item.id === uid);
      setAnnotationPeek({
        item: stored || {
          id: uid,
          pageNumber: (object.pageIndex ?? 0) + 1,
          subtype: object.type,
          color: object.strokeColor,
          selectedText: object.contents || '',
          embedPdf: { annotation: object },
        },
        x: lastViewerPointer.current.x,
        y: lastViewerPointer.current.y,
      });
    };
    syncSelection(scope.getState?.());
    return scope.onStateChange(syncSelection);
  }, [registry, documentId, getCapability, annotations]);

  /** 读取当前缩放（能力/状态不存在时返回 1）。 */
  const getCurrentZoom = useCallback(() => {
    try {
      const zoomCap = getCapability('zoom');
      const state = zoomCap?.getState?.();
      const level = state?.currentZoomLevel;
      if (typeof level === 'number' && Number.isFinite(level) && level > 0) return level;
      const scrollCap = getCapability('scroll');
      const metrics = scrollCap?.getMetrics?.(documentId);
      if (metrics && typeof metrics.scale === 'number' && metrics.scale > 0) return metrics.scale;
    } catch { /* ignore */ }
    return 1;
  }, [getCapability, documentId]);

  // ── 布局记忆 ──
  const saveLayout = useCallback((next) => {
    setLayout(next);
    progressQueue.current?.schedule({
      pageNumber: activePageRef.current,
      zoom: getCurrentZoom(),
      leftPanelWidth: next.leftWidth,
      rightPanelWidth: next.rightWidth,
      leftPanelCollapsed: next.leftCollapsed,
      rightPanelCollapsed: next.rightCollapsed,
      rightTab: rightTabRef.current,
    });
  }, [getCurrentZoom]);

  const jumpToPage = useCallback((pageNumber) => {
    const viewport = getCapability('viewport');
    try {
      viewport?.jumpToPage?.(Math.max(1, pageNumber));
    } catch { /* ignore */ }
    try {
      viewerRef.current?.registry?.then?.(() => {});
    } catch { /* ignore */ }
  }, [getCapability]);

  const exportAnnotationsSafe = useCallback(async () => {
    const annotationCap = getCapability('annotation');
    if (!annotationCap?.exportAnnotations) return [];
    try {
      const task = annotationCap.exportAnnotations();
      // EmbedPDF Task 不是 thenable：用 toPromise()
      const items = task?.toPromise ? await task.toPromise() : await task;
      if (!Array.isArray(items)) return [];
      // 导出 item 不保证携带 pageIndex：从批注状态 pages 结构推导并附加
      try {
        const state = annotationCap.getState?.() || {};
        const pageOf = {};
        for (const [pageIndex, uids] of Object.entries(state.pages || {})) {
          for (const uid of uids) pageOf[uid] = Number(pageIndex);
        }
        return items.map(item => ({
          ...item,
          pageIndex: item.annotation?.pageIndex ?? pageOf[item.annotation?.id] ?? item.pageIndex ?? 0,
        }));
      } catch {
        return items;
      }
    } catch {
      return [];
    }
  }, [getCapability]);

  const importAnnotations = useCallback((items) => {
    const annotationCap = getCapability('annotation');
    try {
      annotationCap?.importAnnotations?.(toEngineTransferItems(items));
    } catch (error) {
      console.warn('importAnnotations failed', error);
    }
  }, [getCapability]);

  // 已保存批注在数据与引擎都就绪后恢复到 PDF 图层；按 id 去重，避免保存刷新时重复导入。
  const importedAnnotationIdsRef = useRef(new Set());
  useEffect(() => {
    if (!registry || !documentId) return;
    const items = annotations.map(item => item.embedPdf).filter(item => item?.annotation?.id)
      .filter(item => !importedAnnotationIdsRef.current.has(item.annotation.id));
    if (!items.length) return;
    importAnnotations(items);
    items.forEach(item => importedAnnotationIdsRef.current.add(item.annotation.id));
  }, [registry, documentId, annotations, importAnnotations]);

  // ── 引文跳转（笔记卡片 → PDF 定位）+ 移除闭环 ──
  const citationsRef = useRef([]);
  citationsRef.current = citations;
  useEffect(() => {
    citationJumpHolder.onJump = (target) => {
      if (!target) return;
      if (target.annotationId) {
        const annotationCap = getCapability('annotation');
        try {
          annotationCap?.selectAnnotation?.(target.pageNumber - 1, target.annotationId);
        } catch { /* ignore */ }
      }
      jumpToPage(target.pageNumber || 1);
      showToast('已定位到第 ' + (target.pageNumber || 1) + ' 页');
    };
    // 移除卡片 → 删除服务端引文记录 → 刷新底部引文条（旧实现只删文档节点，记录永久残留）
    citationJumpHolder.onRemove = async (citationId, attrs) => {
      let recordId = citationId || null;
      if (!recordId && attrs?.annotationId) {
        // 旧卡片无 citationId：按注解+页码回退匹配
        const match = citationsRef.current.find(c => (
          c.annotationId === attrs.annotationId && Number(c.pageNumber) === Number(attrs.pageNumber)
        ));
        recordId = match?.id || null;
      }
      if (!recordId) return;
      try {
        await repositories.deleteCitation(recordId);
        setCitations(prev => prev.filter(c => c.id !== recordId));
        showToast('引文记录已移除');
      } catch (error) {
        showToast('引文记录删除失败：' + String(error.message || error), true);
      }
    };
  }, [getCapability, jumpToPage, showToast]);

  // v13：引文卡片分类/标签（从关联逐句笔记解析）
  const sentenceNotesRef = useRef([]);
  sentenceNotesRef.current = sentenceNotes;
  useEffect(() => {
    citationJumpHolder.noteLookup = (annotationId) => {
      if (!annotationId) return null;
      const note = sentenceNotesRef.current.find(n => n.annotationId === annotationId);
      if (!note) return null;
      const category = note.categoryId ? categories.find(c => c.id === note.categoryId) : null;
      return {
        categoryName: category?.name || null,
        categoryColor: category?.color || null,
        tags: note.tags || [],
      };
    };
  }, [categories]);

  // ── 批注变更同步（EmbedPDF store → 本地列表 + 保存队列） ──
  const syncAnnotationsFromEngineRef = useRef(null);
  const syncAnnotationsFromEngine = useCallback(() => {
    return exportAnnotationsSafe().then((items) => {
      // 空数组也是合法状态（用户删光全部批注）：必须同步到后端
      const list = Array.isArray(items) ? items : [];
      setAnnDirty(true);
      annotationsQueue.current?.schedule({ items: toStorageTransferItems(list) });
      // 本地列表刷新（含页面、摘要）
      const merged = list.map(item => {
        const annotation = item.annotation || {};
        return {
          id: annotation.id || '',
          pageNumber: (item.pageIndex ?? annotation.pageIndex ?? 0) + 1,
          subtype: annotation.type || '',
          selectedText: annotation.contents || '',
          color: annotation.strokeColor || annotation.color || '',
          embedPdf: item,
        };
      });
      setAnnotations(merged);
    });
  }, [exportAnnotationsSafe]);
  syncAnnotationsFromEngineRef.current = syncAnnotationsFromEngine;

  useEffect(() => {
    if (!registry) return;
    const annotationCap = registry.getPlugin?.('annotation')?.provides?.();
    const selectionCap = registry.getPlugin?.('selection')?.provides?.();
    if (!annotationCap || !selectionCap) return;
    let disposed = false;
    // 订阅 annotation store 变化 → 防抖保存（action type 形如 ANNOTATION/CREATE_ANNOTATION）
    try {
      const store = registry.getStore();
      const unsub = store.subscribe((action) => {
        const type = String(action?.type || '');
        if (type.startsWith('ANNOTATION/')) {
          syncAnnotationsFromEngine();
        }
      });
      return () => { try { unsub?.(); } catch { /* ignore */ } };
    } catch { /* ignore */ }
    return () => { disposed = true; };
  }, [registry, syncAnnotationsFromEngine]);

  // ── 选择工具条 ──
  const currentDocId = useCallback(() => {
    if (documentId) return documentId;
    const selectionCap = getCapability('selection');
    const state = selectionCap?.getState?.();
    const docs = state?.documents || {};
    return Object.keys(docs)[0] || 'default';
  }, [documentId, getCapability]);

  /** 关闭插件选择工具栏（同时清理引擎选区与 AI 弹层；不重复触发 placement 事件）。 */
  const dismissSelection = useCallback(() => {
    setSelectionMenu(null);
    setExplainBox(null);
    try {
      const selectionCap = getCapability('selection');
      selectionCap?.clear?.(currentDocId());
    } catch { /* ignore */ }
  }, [getCapability, currentDocId]);

  /** 同步校验批注是否已进入引擎状态（createAnnotation 为同步派发）。 */
  const annotationExistsInEngine = useCallback((pageIndex, id) => {
    const annotationCap = getCapability('annotation');
    try {
      const state = annotationCap?.getState?.() || {};
      const uids = state.pages?.[pageIndex];
      if (Array.isArray(uids)) {
        return uids.some((u) => (u && typeof u === 'object' ? u?.id : u) === id);
      }
    } catch { /* ignore */ }
    return false;
  }, [getCapability]);

  /**
   * 创建批注并用「同步检查 + 导出核对」确认存在（真 Promise，无固定延时猜测）。
   * 返回 true 表示批注已注册；false 表示创建失败。
   */
  const ensureAnnotationCreated = useCallback(async (pageIndex, annotation) => {
    const annotationCap = getCapability('annotation');
    try {
      annotationCap?.createAnnotation?.(pageIndex, annotation);
    } catch (error) {
      console.warn('createAnnotation failed', error);
      return false;
    }
    if (annotationExistsInEngine(pageIndex, annotation.id)) return true;
    try {
      const items = await exportAnnotationsSafe();
      return Array.isArray(items) && items.some((i) => i.annotation?.id === annotation.id);
    } catch {
      return false;
    }
  }, [getCapability, annotationExistsInEngine, exportAnnotationsSafe]);

  useEffect(() => {
    if (!registry) return;
    // onMenuPlacement 是 SelectionPlugin 实例方法（不在 capability 上）
    const selectionPlugin = registry.getPlugin?.('selection');
    const selectionCap = selectionPlugin?.provides?.();
    if (!selectionPlugin?.onMenuPlacement || !selectionCap) return;
    let unsubscribe = () => {};
    try {
      unsubscribe = selectionPlugin.onMenuPlacement(currentDocId(), (placement) => {
        if (!placement?.isVisible) {
          setSelectionMenu(null);
          setExplainBox(null);
          return;
        }
        const docId = currentDocId();
        try {
          const textTask = selectionCap.getSelectedText(docId);
          const toPromise = textTask?.toPromise ? textTask.toPromise() : Promise.resolve(textTask);
          toPromise.then((texts) => {
            const text = Array.isArray(texts) ? texts.join(' ') : String(texts || '');
            if (!text.trim()) { setSelectionMenu(null); return; }
            // 快照：文本/页码/几何在 placement 时刻一并捕获，
            // 避免点击工具栏按钮时选区已被清理导致的竞态。
            let formatted = [];
            try { formatted = selectionCap.getFormattedSelection(docId) || []; } catch { /* ignore */ }
            setSelectionMenu({
              placement,
              text: text.trim().slice(0, 5000),
              pageIndex: placement.pageIndex,
              formatted,
            });
          }).catch(() => setSelectionMenu(null));
        } catch {
          setSelectionMenu(null);
        }
      });
    } catch { /* ignore */ }
    return () => { try { unsubscribe?.(); } catch { /* ignore */ } };
  }, [registry, currentDocId]);

  // 滚动/缩放/翻页时收起选择工具栏（capture 捕获任意滚动容器）
  useEffect(() => {
    if (!selectionMenu) return;
    const close = () => setSelectionMenu(null);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close, { passive: true });
    window.addEventListener('wheel', close, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close, { capture: true });
    };
  }, [selectionMenu]);

  // ── 选择动作 ──
  const noteEditorRef = useRef(null);

  // ── 笔记保存（供选择动作与编辑器共用；置于动作之前避免 TDZ） ──
  const noteDocRef = useRef(null);
  noteDocRef.current = noteDoc;
  const summaryMetaRef = useRef({ categoryId: noteDoc?.categoryId || null, tags: noteDoc?.tags || [] });
  summaryMetaRef.current = { categoryId: noteDoc?.categoryId || null, tags: noteDoc?.tags || [] };
  const handleNoteChange = useCallback((editor) => {
    const converter = createMarkdownConverter(editor);
    const json = editor.getJSON();
    const markdown = converter.toMarkdown(editor);
    setNoteDirty(true);
    noteQueue.current?.schedule({
      title: noteDocRef.current?.title || '',
      tiptapJson: json,
      markdown,
      categoryId: summaryMetaRef.current.categoryId,
      tags: summaryMetaRef.current.tags,
    });
  }, []);

  /** 汇总笔记分类/标签变更（随当前编辑器内容一并保存，避免覆盖未保存内容）。 */
  const handleSummaryMeta = useCallback((patch) => {
    const meta = { ...summaryMetaRef.current, ...patch };
    summaryMetaRef.current = meta;
    const editor = noteEditorRef.current;
    const converter = createMarkdownConverter(editor);
    setNoteDirty(true);
    noteQueue.current?.schedule({
      title: noteDocRef.current?.title || '',
      tiptapJson: editor ? editor.getJSON() : noteDocRef.current?.tiptapJson,
      markdown: editor ? converter.toMarkdown(editor) : noteDocRef.current?.markdown,
      categoryId: meta.categoryId,
      tags: meta.tags,
    });
  }, []);

  const applyMarkup = useCallback(async (type, color) => {
    const annotationCap = getCapability('annotation');
    if (!annotationCap || !selectionMenu) { showToast('批注工具尚未就绪，请稍后重试', true); return; }
    const annotation = buildMarkupAnnotation({
      id: 'anno-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      kind: type,
      text: selectionMenu.text,
      color: color || MARKUP_COLORS[0],
      opacity: 0.45,
      pageIndex: selectionMenu.pageIndex,
      formatted: selectionMenu.formatted,
    });
    if (!annotation) { showToast('未获取到可批注的选中区域，请重新选择文字', true); return; }
    try {
      const created = await ensureAnnotationCreated(selectionMenu.pageIndex, annotation);
      if (!created) throw new Error('阅读器未能创建批注');
      await syncAnnotationsFromEngine();
      // 对齐旧版行为：高亮（highlight）成功后自动把摘录写一条项目笔记
      // （notes 表 → 项目笔记面板与项目 Markdown 汇总均可见）
      if (type === 'highlight' && selectionMenu.text.trim()) {
        repositories.addHighlightNote(attachmentId, {
          pageNumber: selectionMenu.pageIndex + 1,
          quote: selectionMenu.text,
          content: '',
          tags: ['关键证据'],
          annotationId: annotation.id,
        })
          .then(() => showToast('已添加高亮，摘录已加入项目笔记'))
          .catch((error) => showToast('已添加高亮（项目笔记保存失败：' + String(error.message || error) + '）', true));
      } else {
        showToast(type === 'highlight' ? '已添加高亮' : type === 'underline' ? '已添加下划线' : '已添加删除线');
      }
    } catch (error) {
      showToast('批注失败：' + String(error.message || error), true);
    } finally {
      dismissSelection();
    }
  }, [selectionMenu, getCapability, ensureAnnotationCreated, syncAnnotationsFromEngine, attachmentId, dismissSelection, showToast]);

  // ── 添加逐句笔记（完整链路：选区快照 → 高亮 → 笔记 API → 右侧列表 → 聚焦编辑） ──
  const addSentenceNote = useCallback(async () => {
    if (!selectionMenu?.text) { showToast('没有选中文字', true); return; }
    const { text, pageIndex, formatted } = selectionMenu;
    const pageNumber = pageIndex + 1;
    // 1) 创建高亮（失败不阻断笔记保存，仅标记定位不完整）
    let annotationId = null;
    let highlightFailed = false;
    const annotation = buildMarkupAnnotation({
      id: 'snote-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      kind: 'highlight',
      text,
      color: MARKUP_COLORS[1],
      opacity: 0.35,
      pageIndex,
      formatted,
    });
    try {
      const ok = annotation && await ensureAnnotationCreated(pageIndex, annotation);
      if (ok) annotationId = annotation.id;
      else highlightFailed = true;
      syncAnnotationsFromEngine();
    } catch (error) {
      console.warn('sentence note highlight failed', error);
      highlightFailed = true;
    }
    // 2) 创建逐句笔记（后端按 annotation_id/文本幂等去重）
    try {
      const res = await repositories.createSentenceNote(paperId, {
        attachmentId,
        annotationId,
        quotedText: text,
        comment: '',
        pageNumber,
        position: { formatted: formatted || [] },
        categoryId: null,
        tags: [],
        importance: 2,
        starred: false,
        status: 'inbox',
      });
      const note = res.note;
      setSentenceNotes(prev => upsertSentenceNote(prev, note));
      setRightTab('sentence');
      setPendingFocusNoteId(note.id);
      showToast(highlightFailed
        ? '笔记已保存（原文定位不完整，可在卡片上重新建立定位）'
        : '已添加逐句笔记');
    } catch (error) {
      showToast('笔记保存失败：' + String(error.message || error), true);
      // 保留高亮（不删除）；提供重试条目
      const draft = {
        id: 'draft-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        paperId,
        attachmentId,
        annotationId,
        quotedText: text,
        comment: '',
        pageNumber,
        position: { formatted: formatted || [] },
        categoryId: null,
        tags: [],
        importance: 2,
        starred: false,
        status: 'inbox',
        annotationDeleted: highlightFailed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        saveFailed: true,
        saveError: String(error.message || error),
      };
      setSentenceNotes(prev => [draft, ...prev]);
      setRightTab('sentence');
    } finally {
      dismissSelection();
    }
  }, [selectionMenu, ensureAnnotationCreated, syncAnnotationsFromEngine, paperId, attachmentId, dismissSelection, showToast]);

  // ── 逐句笔记保存（防抖 + 失败保留 + 可重试） ──
  // entry 不变式：patch 只存"尚未送达"的增量；promise 非空当且仅当有在途请求。
  const scheduleSentenceSave = useCallback((noteId, patch) => {
    const map = sentenceSavesRef.current;
    const entry = map.get(noteId) || { timer: null, patch: {}, promise: null, failed: false };
    entry.patch = { ...entry.patch, ...patch };
    entry.failed = false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      const payload = { ...entry.patch };
      entry.patch = {}; // 已发送内容移出待保存区；发送期间的新编辑会再次并入 entry.patch
      setNoteSaveState('saving');
      entry.promise = repositories.updateSentenceNote(noteId, payload)
        .then((res) => {
          setSentenceNotes(prev => upsertSentenceNote(prev, res.note));
          setNoteSaveState('saved');
          entry.failed = false;
          entry.promise = null;
        })
        .catch((error) => {
          entry.failed = true;
          entry.promise = null;
          entry.patch = { ...payload, ...entry.patch }; // 未送达内容放回（保留发送期间的新值）
          setNoteSaveError(String(error.message || error));
          setNoteSaveState('error');
        });
    }, 800);
    map.set(noteId, entry);
    setNoteSaveState('pending');
  }, []);

  /** 冲刷全部待保存/失败中的逐句笔记（返回是否全部成功）。 */
  const flushSentenceSaves = useCallback(async () => {
    const map = sentenceSavesRef.current;
    const jobs = [];
    for (const [noteId, entry] of map) {
      jobs.push((async () => {
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
        // 先等在途保存落地（其成功/失败回调已把增量留在 entry.patch）
        if (entry.promise) {
          try { await entry.promise; } catch { /* 失败内容已放回 entry.patch，下方统一补发 */ }
          entry.promise = null;
        }
        if (!entry.patch || !Object.keys(entry.patch).length) return true;
        const payload = { ...entry.patch };
        entry.patch = {};
        try {
          const res = await repositories.updateSentenceNote(noteId, payload);
          setSentenceNotes(prev => upsertSentenceNote(prev, res.note));
          entry.failed = false;
          return true;
        } catch (error) {
          entry.patch = { ...payload, ...entry.patch };
          entry.failed = true;
          setNoteSaveError(String(error.message || error));
          return false;
        }
      })());
    }
    if (!jobs.length) return true;
    const results = await Promise.allSettled(jobs);
    const ok = results.every(r => r.status === 'fulfilled' && r.value !== false);
    setNoteSaveState(ok ? 'saved' : 'error');
    return ok;
  }, []);

  /** 重试全部保存失败的逐句笔记。 */
  const retryNoteSaves = useCallback(() => {
    const map = sentenceSavesRef.current;
    let any = false;
    for (const [noteId, entry] of map) {
      if (entry.failed) {
        any = true;
        entry.failed = false;
        entry.promise = null;
        scheduleSentenceSave(noteId, entry.patch);
      }
    }
    if (any) setNoteSaveState('pending');
  }, [scheduleSentenceSave]);

  /** 重试单条失败草稿（重新 POST，后端幂等去重）。 */
  const retryDraftNote = useCallback((draft) => {
    repositories.createSentenceNote(draft.paperId, {
      attachmentId: draft.attachmentId,
      annotationId: draft.annotationId,
      quotedText: draft.quotedText,
      comment: draft.comment,
      pageNumber: draft.pageNumber,
      position: draft.position,
      categoryId: draft.categoryId,
      tags: draft.tags,
      importance: draft.importance,
      starred: draft.starred,
      status: draft.status,
    })
      .then((res) => {
        setSentenceNotes(prev => upsertSentenceNote(prev.filter(n => n.id !== draft.id), res.note));
        setNoteSaveState('saved');
        showToast('笔记已保存');
      })
      .catch((error) => {
        setNoteSaveError(String(error.message || error));
        setNoteSaveState('error');
      });
  }, [showToast]);

  /** 新建自定义分类（统一阅读器弹窗，颜色使用默认值）。 */
  const createCategory = useCallback(() => {
    setInputBox({
      title: '新建分类', label: '分类名称', value: '', submitLabel: '创建',
      onSubmit: async (name) => {
        const res = await repositories.createNoteCategory({ name });
        setCategories(prev => [...prev, res.category]);
        showToast('已创建分类「' + name + '」');
      },
    });
  }, [showToast]);

  // ── v14 补充：分类/标签管理（改名/改色/删除；删除不删笔记） ──

  /** 标签/笔记数据重拉（分类或标签变更后同步卡片显示）。 */
  const refreshTagsAndNotes = useCallback(async () => {
    try {
      const [tagsRes, snRes] = await Promise.all([
        repositories.listTags().catch(() => ({ tags: [] })),
        repositories.listSentenceNotes(paperId, { attachmentId }).catch(() => ({ notes: [] })),
      ]);
      const colors = {};
      const stats = {};
      const list = (tagsRes.tags || []).map((t) => {
        if (t.color) colors[t.tag] = t.color;
        stats[t.tag] = t.count;
        return t.tag;
      });
      setAllTags(list);
      setTagColors(colors);
      setTagStats(stats);
      setSentenceNotes(snRes.notes || []);
    } catch { /* 刷新失败保持旧数据 */ }
  }, [paperId, attachmentId]);

  const renameCategory = useCallback(async (id, name) => {
    const res = await repositories.updateNoteCategory(id, { name });
    setCategories(prev => prev.map(c => c.id === id ? res.category : c));
    await refreshTagsAndNotes();
    return res.category;
  }, [refreshTagsAndNotes]);

  const recolorCategory = useCallback(async (id, color) => {
    const res = await repositories.updateNoteCategory(id, { color });
    setCategories(prev => prev.map(c => c.id === id ? res.category : c));
  }, []);

  const deleteCategory = useCallback(async (id) => {
    const res = await repositories.deleteNoteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
    await refreshTagsAndNotes(); // 相关笔记归入未分类（后端已处理，前端同步显示）
    return res;
  }, [refreshTagsAndNotes]);

  const renameTag = useCallback(async (oldTag, newTag) => {
    const res = await repositories.renameTag(oldTag, newTag);
    await refreshTagsAndNotes();
    return res;
  }, [refreshTagsAndNotes]);

  const removeTag = useCallback(async (tag) => {
    const res = await repositories.removeTag(tag);
    await refreshTagsAndNotes();
    return res;
  }, [refreshTagsAndNotes]);

  const setTagColor = useCallback(async (tag, color) => {
    const res = await repositories.saveTagColor(tag, color);
    setTagColors(prev => ({ ...prev, [res.tag]: res.color }));
  }, []);

  /** 删除逐句笔记；deleteAnnotation=true 时同时删除关联高亮。 */
  const deleteSentenceNote = useCallback(async (note, deleteAnnotation) => {
    try {
      await repositories.deleteSentenceNote(note.id);
    } catch (error) {
      showToast('笔记删除失败：' + String(error.message || error), true);
      return;
    }
    if (deleteAnnotation && note.annotationId && !note.annotationDeleted) {
      try {
        const annotationCap = getCapability('annotation');
        annotationCap?.deleteAnnotation?.(note.pageNumber - 1, note.annotationId);
        syncAnnotationsFromEngine();
      } catch { /* 高亮删除失败不阻断 */ }
    }
    setSentenceNotes(prev => prev.filter(n => n.id !== note.id));
    sentenceSavesRef.current.delete(note.id);
    showToast(deleteAnnotation ? '笔记与对应高亮已删除' : '已删除笔记（高亮保留）');
  }, [getCapability, syncAnnotationsFromEngine, showToast]);

  /** 重新建立定位：按保存的几何重建高亮并关联到笔记。 */
  const relocateSentenceNote = useCallback(async (note) => {
    const formatted = Array.isArray(note.position?.formatted) ? note.position.formatted : [];
    const annotation = buildMarkupAnnotation({
      id: 'reloc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      kind: 'highlight',
      text: note.quotedText,
      color: MARKUP_COLORS[1],
      opacity: 0.35,
      pageIndex: note.pageNumber - 1,
      formatted,
    });
    const ok = annotation && await ensureAnnotationCreated(note.pageNumber - 1, annotation);
    if (!ok) { showToast('重新建立定位失败：无法创建高亮', true); return; }
    syncAnnotationsFromEngine();
    try {
      const res = await repositories.relocateSentenceNote(note.id, annotation.id);
      setSentenceNotes(prev => upsertSentenceNote(prev, res.note));
      showToast('已重新建立原文定位');
    } catch (error) {
      showToast('定位关联保存失败：' + String(error.message || error), true);
    }
  }, [ensureAnnotationCreated, syncAnnotationsFromEngine, showToast]);

  /** 跳回原文：翻页 + 选中批注强化显示；批注已删除时仅提示失效。 */
  const jumpToSentenceSource = useCallback((note) => {
    if (!note.annotationDeleted && note.annotationId) {
      const annotationCap = getCapability('annotation');
      try {
        annotationCap?.selectAnnotation?.(note.pageNumber - 1, note.annotationId);
      } catch { /* ignore */ }
    }
    jumpToPage(note.pageNumber || 1);
    showToast(note.annotationDeleted ? '原定位已失效，仅保留摘录文本' : '已定位到第 ' + (note.pageNumber || 1) + ' 页');
  }, [getCapability, jumpToPage, showToast]);

  const copySelection = useCallback(() => {
    const selectionCap = getCapability('selection');
    try {
      selectionCap?.copyToClipboard?.(currentDocId());
      showToast('已复制到剪贴板');
    } catch (error) {
      showToast('复制失败', true);
    } finally {
      dismissSelection();
    }
  }, [getCapability, currentDocId, dismissSelection, showToast]);

  const explainSelection = useCallback(() => {
    if (!selectionMenu?.text) { showToast('没有选中文字', true); return; }
    const anchor = selectionMenu.placement;
    setExplainBox({ status: 'loading', text: selectionMenu.text, anchor, result: null });
    repositories.explainSelection(attachmentId, 'selection', selectionMenu.text, '')
      .then((res) => setExplainBox(prev => ({ ...prev, status: 'done', result: res.text })))
      .catch((error) => setExplainBox(prev => ({ ...prev, status: 'error', result: String(error.message || error) })));
  }, [selectionMenu, attachmentId]);

  // ── 引文卡片插入（选区引用 与 逐句笔记→汇总 共用的核心链路） ──

  /** 确保汇总编辑器挂载（首次/卸载后自动切 Tab 并等待重挂载；最多 5s）。返回 editor 或 null。 */
  const ensureSummaryEditor = useCallback(async () => {
    let editor = noteEditorRef.current;
    if (!editor || editor.isDestroyed) {
      setRightTab('summary');
      const deadline = Date.now() + 5000;
      while ((!noteEditorRef.current || noteEditorRef.current.isDestroyed) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      editor = noteEditorRef.current;
    }
    return editor && !editor.isDestroyed ? editor : null;
  }, []);

  /**
   * 插入 CitationCard 到汇总编辑器并持久化（文档不存在时以当前 JSON 建档；引文记录含评论）。
   * 返回是否成功。不负责切换 Tab / toast（由调用方决定）。
   */
  const insertCitationIntoSummary = useCallback(async ({ text, pageNumber, annotationId = null, comment = '', noteId = null, stale = false }) => {
    const editor = await ensureSummaryEditor();
    if (!editor) { showToast('汇总笔记编辑器尚未就绪', true); return false; }
    // 1) 插入引文卡片（数组一次性插入：链式 insertContent 会相互替换）
    try {
      editor.chain().focus().insertContent([
        {
          type: 'citationCard',
          attrs: {
            citationId: null, // 保存后由后端分配
            annotationId,
            pageNumber,
            quotedText: text,
            stale,
            comment: String(comment || '').slice(0, 2000),
            noteId,
          },
        },
        { type: 'paragraph' },
      ]).run();
      const probe = editor.getJSON();
      const hasCard = (probe.content || []).some((n) => n.type === 'citationCard');
      if (!hasCard) {
        console.warn('citation insert probe failed, doc:', JSON.stringify(probe).slice(0, 200));
        return false;
      }
    } catch (error) {
      console.warn('citation insert failed', error);
      showToast('引文插入失败：' + String(error?.message || error), true);
      return false;
    }
    // 2) 持久化：文档不存在时用「当前编辑器 JSON（含新卡片）」建档，随后写引文记录；
    //    编辑器 JSON 同时进入保存队列。
    const doc = noteDocRef.current;
    let docId = doc?.id;
    try {
      if (!docId) {
        const converter = createMarkdownConverter(editor);
        const res = await repositories.putNoteDocument(paperId, {
          title: '',
          tiptapJson: editor.getJSON(),
          markdown: converter.toMarkdown(editor),
        });
        docId = res.document.id;
        noteDocRef.current = res.document;
        setNoteDoc(res.document);
      }
      handleNoteChange(editor);
      const localId = 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setCitations(prev => [...prev, {
        id: localId,
        annotationId, pageNumber, quotedText: text, annotationDeleted: stale,
      }]);
      const res = await repositories.addCitation(docId, {
        paperId, annotationId, pageNumber, quotedText: text,
        prefix: '', suffix: String(comment || '').slice(0, 2000),
      });
      // 回填真实引文 ID 到卡片节点（供就地移除时删除服务端记录）
      try {
        const pending = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'citationCard' && !node.attrs.citationId
            && node.attrs.annotationId === annotationId
            && node.attrs.quotedText === text
            && Number(node.attrs.pageNumber) === Number(pageNumber)) {
            pending.push(pos);
          }
        });
        if (pending.length) {
          const pos = pending[pending.length - 1]; // 最近插入的一张
          const node = editor.state.doc.nodeAt(pos);
          if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, citationId: res.citation.id }));
        }
      } catch { /* 回填失败不影响主流程 */ }
      setCitations(prev => prev.map(c => c.id === localId ? res.citation : c));
      return true;
    } catch (error) {
      showToast('引文记录保存失败：' + String(error.message || error), true);
      return false;
    }
  }, [ensureSummaryEditor, paperId, handleNoteChange, showToast]);

  /** 选区 → 引用到汇总（创建高亮 + 插入 CitationCard）。 */
  const quoteToSummary = useCallback(async () => {
    if (!selectionMenu?.text) { showToast('没有选中文字', true); return; }
    const { text, pageIndex, formatted } = selectionMenu;
    const pageNumber = pageIndex + 1;
    // 创建高亮（失败不阻断引用，卡片标记失效）
    let annotationId = null;
    const annotation = buildMarkupAnnotation({
      id: 'cite-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      kind: 'highlight',
      text,
      color: MARKUP_COLORS[0],
      opacity: 0.35,
      pageIndex,
      formatted,
    });
    try {
      const ok = annotation && await ensureAnnotationCreated(pageIndex, annotation);
      if (ok) annotationId = annotation.id;
      syncAnnotationsFromEngine();
    } catch (error) {
      console.warn('quote highlight failed', error);
    }
    const ok = await insertCitationIntoSummary({
      text, pageNumber, annotationId, stale: !annotationId,
    });
    if (ok) { showToast('已引用到汇总笔记'); setRightTab('summary'); }
    dismissSelection();
  }, [selectionMenu, ensureAnnotationCreated, syncAnnotationsFromEngine, insertCitationIntoSummary, showToast, dismissSelection]);

  /** 逐句笔记 → 添加到汇总（组装主链路：摘录 + 我的理解 + 页码 + 分类/标签联动）。 */
  const addSentenceNoteToSummary = useCallback(async (note) => {
    if (!note?.quotedText) { showToast('逐句笔记缺少摘录', true); return; }
    const ok = await insertCitationIntoSummary({
      text: note.quotedText,
      pageNumber: note.pageNumber || 1,
      annotationId: note.annotationId || null,
      comment: String(note.comment || '').trim(),
      noteId: note.id,
      stale: Boolean(note.annotationDeleted),
    });
    if (ok) { setRightTab('summary'); showToast('已添加到汇总笔记'); }
  }, [insertCitationIntoSummary, showToast]);

  // ── 批注删除 / 编辑评论 ──
  const deleteAnnotationItem = useCallback((item) => {
    setConfirmBox({
      title: '删除批注',
      message: '已插入笔记的引文文本会保留，但原文定位将标记为失效。',
      options: [
        { label: '删除批注', danger: true, action: () => {
          const annotationCap = getCapability('annotation');
          try {
            annotationCap?.deleteAnnotation?.(item.pageNumber - 1, item.id);
            setAnnotationPeek(null);
            syncAnnotationsFromEngine();
            showToast('批注已删除');
          } catch (error) {
            showToast('删除失败：' + String(error.message || error), true);
          }
        } },
        { label: '取消', action: () => {} },
      ],
    });
  }, [getCapability, syncAnnotationsFromEngine]);

  const editAnnotationComment = useCallback((item) => {
    setInputBox({
      title: '编辑批注评论', label: '评论', value: item.embedPdf?.annotation?.contents || item.selectedText || '',
      multiline: true, submitLabel: '保存', allowEmpty: true,
      onSubmit: async (comment) => {
        const annotationCap = getCapability('annotation');
        annotationCap?.updateAnnotation?.(item.pageNumber - 1, item.id, { contents: comment });
        await syncAnnotationsFromEngine();
        showToast('评论已更新');
      },
    });
  }, [getCapability, syncAnnotationsFromEngine]);

  const recolorAnnotation = useCallback((item, color) => {
    try {
      getCapability('annotation')?.updateAnnotation?.(item.pageNumber - 1, item.id, { strokeColor: color });
      setAnnotationPeek(prev => prev ? { ...prev, item: { ...prev.item, color } } : null);
      syncAnnotationsFromEngine();
      showToast('批注颜色已更新');
    } catch (error) {
      showToast('改色失败：' + String(error.message || error), true);
    }
  }, [getCapability, syncAnnotationsFromEngine, showToast]);

  // ── 导出带批注 PDF ──
  const exportAnnotatedPdf = useCallback(async () => {
    const exportCap = getCapability('export');
    const annotationCap = getCapability('annotation');
    if (!exportCap?.saveAsCopy) { showToast('导出功能不可用', true); return; }
    showToast('正在生成带批注 PDF…');
    try {
      // 先提交批注到引擎内存文档（原始文件不变），再另存副本
      try {
        const commitTask = annotationCap?.commit?.();
        if (commitTask?.toPromise) await commitTask.toPromise();
      } catch { /* 无批注或 commit 失败不阻断导出 */ }
      const task = exportCap.saveAsCopy();
      const buffer = task?.toPromise ? await task.toPromise() : await task;
      if (!buffer) { showToast('导出结果为空', true); return; }
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = (paperTitle || 'document') + '-annotated.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('带批注 PDF 已导出');
    } catch (error) {
      showToast('导出失败：' + String(error.message || error), true);
    }
  }, [getCapability, paperTitle]);

  // ── 返回导航：保存后离开 + 失败重试/仍然返回 + 状态恢复 ──

  /** 冲刷全部保存队列（笔记/批注/进度/逐句笔记）。任一失败返回 false。 */
  const saveEverythingBeforeLeave = useCallback(async () => {
    const jobs = [];
    const push = (promise) => { if (promise && typeof promise.then === 'function') jobs.push(promise.catch(() => null)); };
    // 逐句笔记（防抖中的定时器 → 立即提交）
    push(flushSentenceSaves());
    // 汇总笔记 / 批注 / 阅读进度
    push(noteQueue.current?.flushImmediately?.());
    push(annotationsQueue.current?.flushImmediately?.());
    push(progressQueue.current?.flushImmediately?.());
    // 阅读状态（页码/缩放/Tab/布局）兜底直接写库
    push(repositories.putReadingState(paperId, {
      currentPage: activePageRef.current,
      zoom: getCurrentZoom(),
      leftPanelWidth: layoutRef.current.leftWidth,
      rightPanelWidth: layoutRef.current.rightWidth,
      leftPanelCollapsed: layoutRef.current.leftCollapsed,
      rightPanelCollapsed: layoutRef.current.rightCollapsed,
      rightTab: rightTabRef.current,
    }).catch(() => null));
    const results = await Promise.all(jobs);
    return results.every(r => r !== false && r !== null);
  }, [flushSentenceSaves, paperId, getCurrentZoom]);

  const navigateBack = useCallback(() => {
    // 放行 beforeunload 守卫（保存流程已完成；否则导航会被静默取消）
    allowUnloadRef.current = true;
    const nav = readNavContext();
    if (nav.from === 'literature-center') {
      try { sessionStorage.setItem('hana-return-literature', '1'); } catch { /* ignore */ }
      window.location.href = '/ui/hana-research/literature';
      return;
    }
    // project-detail / search-result / 缺省 → 项目库（并恢复原项目抽屉）
    if (nav.projectId) {
      try { sessionStorage.setItem('hana-return-project', nav.projectId); } catch { /* ignore */ }
    }
    window.location.href = '/ui/hana-research/projects';
  }, []);

  const goBack = useCallback(async () => {
    if (backBusyRef.current) return; // 防重复导航
    backBusyRef.current = true;
    setBackState('saving');
    // 合理超时：8s 未完成视为失败，交给用户选择
    let saved = false;
    try {
      saved = await Promise.race([
        saveEverythingBeforeLeave(),
        new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
    } catch {
      saved = false;
    }
    if (saved) {
      setBackState('idle');
      backBusyRef.current = false;
      navigateBack();
      return;
    }
    setBackState('error');
    backBusyRef.current = false;
  }, [saveEverythingBeforeLeave, navigateBack]);

  /** 保存失败弹窗：重试保存 / 仍然返回。 */
  const retryBackSave = useCallback(() => {
    setBackState('saving');
    backBusyRef.current = true;
    Promise.race([
      saveEverythingBeforeLeave(),
      new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
    ])
      .then((ok) => {
        if (ok) {
          setBackState('idle');
          backBusyRef.current = false;
          navigateBack();
        } else {
          setBackState('error');
          backBusyRef.current = false;
        }
      })
      .catch(() => { setBackState('error'); backBusyRef.current = false; });
  }, [saveEverythingBeforeLeave, navigateBack]);

  const leaveAnyway = useCallback(() => {
    setBackState('idle');
    backBusyRef.current = false;
    navigateBack();
  }, [navigateBack]);

  // ── P6：阅读 → 证据闭环（进入证据矩阵 / 建为研究任务 / 建议论证关系） ──
  // 注意：置于 goBack / leaveAnyway 之后，避免依赖 TDZ（const 尚未初始化）。
  const openEvidenceMatrixFromNote = useCallback((note) => {
    try {
      sessionStorage.setItem('hana-open-evidence', projectId || '');
      if (paperId) sessionStorage.setItem('hana-focus-paper-' + projectId, paperId);
    } catch { /* ignore */ }
    goBack();
  }, [goBack, projectId, paperId]);

  const createTaskFromNote = useCallback((note) => {
    const quoteHint = String(note.comment || note.quotedText || '').trim();
    const taskContent = quoteHint ? quoteHint.slice(0, 80) : ('整理第 ' + (note.pageNumber || 1) + ' 页摘录证据');
    setConfirmBox({
      title: '建为研究任务',
      message: '将这条逐句笔记创建为项目任务（写入任务清单，Agent 与项目「任务与笔记」页都能看到）：「' + taskContent + '」。',
      options: [
        { label: '取消', action: () => {} },
        { label: '创建研究任务', primary: true, action: () => {
          repositories.createProjectNote(projectId, {
            content: taskContent,
            tags: ['研究任务', '状态:待办', '优先级:普通'],
            paperId: paperId || null,
          })
            .then(() => showToast('已建为研究任务，可在项目「任务与笔记」查看'))
            .catch((error) => showToast('创建任务失败：' + String(error.message || error), true));
        } },
      ],
    });
  }, [projectId, paperId, setConfirmBox, showToast]);

  const suggestRelationHandoff = useCallback((note) => {
    const prompt = `我在精读《${paperTitle || '当前文献'}》（projectId: ${projectId}; paperId: ${paperId || ''}），第 ${note.pageNumber || 1} 页有一条逐句笔记：摘录「${String(note.quotedText || '').slice(0, 120)}」。请基于项目证据推荐 1–2 个与其他文献的论证关系（支持 / 反驳 / 被引用），并给出理由。只给出候选解释，不要直接写入关系；经我确认后才建立。`;
    window.top.postMessage({ type: 'hana-research.agent-handoff', prompt, label: '论证关系建议已交给 Agent' }, window.location.origin);
  }, [paperTitle, projectId, paperId]);

  // Esc 优先关闭浮层；Alt+Left 执行返回逻辑；无浮层时 Esc 不丢弃笔记
  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        if (selectionMenu || explainBox) {
          dismissSelection();
        } else {
          goBack();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      if (selectionMenu) { dismissSelection(); return; }
      if (explainBox) { setExplainBox(null); return; }
      if (annotationPeek) { getCapability('annotation')?.deselectAnnotation?.(); setAnnotationPeek(null); return; }
      if (inputBox) { setInputBox(null); return; }
      if (confirmBox) { setConfirmBox(null); return; }
      if (metaManagerOpen) { setMetaManagerOpen(false); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMenu, explainBox, annotationPeek, inputBox, confirmBox, metaManagerOpen, dismissSelection, goBack, getCapability]);

  // 分类计数（管理弹窗用；逐句笔记当前用量）
  const categoryCounts = {};
  sentenceNotes.forEach((n) => {
    if (n.categoryId) categoryCounts[n.categoryId] = (categoryCounts[n.categoryId] || 0) + 1;
  });

  // ── 渲染 ──
  return (
    <div className={'wb-workspace' + (narrow ? ' wb-narrow' : '')} data-left-collapsed={layout.leftCollapsed ? '1' : '0'} data-right-collapsed={layout.rightCollapsed ? '1' : '0'}>
      {/* 顶部条 */}
      <header className="wb-topbar">
        <a
          className={'wb-back' + (backState === 'saving' ? ' wb-back-busy' : '')}
          href="/ui/hana-research/projects"
          title="返回项目"
          aria-label="返回项目"
          aria-busy={backState === 'saving'}
          onClick={(event) => { event.preventDefault(); goBack(); }}
        >
          <IconBack size={15} /> 返回
        </a>
        <div className="wb-title">
          <span className="wb-title-context">阅读工作台</span>
          <span className="wb-title-copy">
            <strong>{paperTitle || '文献阅读'}</strong>
            {projectTitle && <span>收录于 {projectTitle}</span>}
          </span>
        </div>
        <div className="wb-topbar-actions">
          <span className="wb-save-cluster" aria-label="保存状态">
            <SaveBadge status={saveStates.note} dirty={noteDirty} />
            <SaveBadge status={saveStates.annotations} dirty={annDirty} label="批注" />
          </span>
          <button
            type="button"
            className="wb-icon-btn wb-agent-btn"
            title="把当前文献、项目与阅读页码加入 Agent 输入框"
            aria-busy={agentHandoffState === 'pending'}
            disabled={agentHandoffState === 'pending'}
            onClick={handoffCurrentReader}
          >
            <IconSpark size={15} />
            <span>{agentHandoffState === 'pending' ? '正在交接…' : '交给 Agent'}</span>
          </button>
          <button type="button" className="wb-icon-btn wb-export-btn" title="导出带批注 PDF" onClick={exportAnnotatedPdf}>
            <IconDownload size={15} />
            <span>导出</span>
          </button>
          <ThemeToggle mode={themeMode} onChange={setThemeMode} />
        </div>
      </header>

      <div className="wb-body">
        {/* 左侧栏 */}
        {!layout.leftCollapsed && (
          <aside className="wb-left" style={{ width: layout.leftWidth }}>
            <LeftPanel
              tab={leftTab}
              setTab={setLeftTab}
              annotations={annotations}
              onJump={jumpToPage}
              onDelete={deleteAnnotationItem}
              onEditComment={editAnnotationComment}
              registry={registry}
              documentId={documentId}
              pageCount={pageCount}
              activePage={activePage}
              getCapability={getCapability}
            />
          </aside>
        )}
        {!layout.leftCollapsed && <Resizer side="left" width={layout.leftWidth} onChange={(w) => saveLayout({ ...layout, leftWidth: w })} />}
        <button
          type="button"
          className={'wb-collapse-btn wb-collapse-left' + (layout.leftCollapsed ? ' collapsed' : '')}
          title={layout.leftCollapsed ? '展开左侧栏' : '折叠左侧栏'}
          onClick={() => saveLayout({ ...layout, leftCollapsed: !layout.leftCollapsed })}
        >
          {layout.leftCollapsed ? <IconPanelLeft size={14} /> : <IconCollapseLeft size={14} />}
        </button>

        {/* 中央 PDF */}
        <main className="wb-center" onPointerDownCapture={(event) => {
          lastViewerPointer.current = { x: event.clientX, y: event.clientY };
        }}>
          {pdf.status === 'loading' && <StateBox icon={<IconSearch size={18} />} text="正在加载 PDF…" />}
          {pdf.status === 'error' && (
            <StateBox icon={<IconAlert size={18} />} text={'PDF 加载失败'} detail={pdf.error} error />
          )}
          {pdf.status === 'ready' && (
            <PDFViewer
              key={viewerThemeKey}
              ref={viewerRef}
              className="wb-viewer"
              config={{
                src: pdf.url,
                wasmUrl: ABS('/ui/hana-research/assets/vendor/embedpdf/pdfium.wasm'),
                log: false,
                fontFallback: { fonts: FONT_URLS },
                theme: viewerTheme,
                i18n: { defaultLocale: 'zh-CN' },
                tabBar: 'never',
                disabledCategories: ['signature', 'stamp', 'redaction', 'form', 'attachment', 'print', 'fullscreen'],
                fonts: { ui: null, signature: null },
                stamp: { manifests: [], defaultLibrary: false },
                annotations: {
                  autoCommit: false,
                  annotationAuthor: 'HanaResearch',
                },
              }}
              onInit={(viewer) => { viewerRef.current = viewer; }}
              onReady={onViewerReady}
            />
          )}
          {/* 选择工具条（唯一工具栏：EmbedPDF 原生菜单已在 onViewerReady 从 schema 移除） */}
          {selectionMenu && pdf.status === 'ready' && (
            <SelectionToolbar
              placement={selectionMenu.placement}
              onMarkup={applyMarkup}
              onSentenceNote={addSentenceNote}
              onQuote={quoteToSummary}
              onCopy={copySelection}
              onExplain={explainSelection}
            />
          )}
          {/* AI 解释弹层 */}
          {explainBox && (
            <ExplainPopover
              box={explainBox}
              onClose={() => setExplainBox(null)}
              onRetry={explainSelection}
            />
          )}
          {annotationPeek && (
            <AnnotationPeek
              peek={annotationPeek}
              onEdit={() => editAnnotationComment(annotationPeek.item)}
              onDelete={() => deleteAnnotationItem(annotationPeek.item)}
              onRecolor={(color) => recolorAnnotation(annotationPeek.item, color)}
              onClose={() => {
                getCapability('annotation')?.deselectAnnotation?.();
                setAnnotationPeek(null);
              }}
            />
          )}
        </main>

        {/* 右侧笔记栏（v13：逐句笔记 / 汇总笔记 双视图） */}
        {!layout.rightCollapsed && (
          <aside className="wb-right" style={{ width: layout.rightWidth }}>
            <RightPanel
              rightTab={rightTab}
              onTabChange={(tab) => {
                setRightTab(tab);
                // 记住 Tab：写阅读状态（布局保存队列）
                progressQueue.current?.schedule({
                  pageNumber: activePageRef.current,
                  zoom: getCurrentZoom(),
                  leftPanelWidth: layoutRef.current.leftWidth,
                  rightPanelWidth: layoutRef.current.rightWidth,
                  leftPanelCollapsed: layoutRef.current.leftCollapsed,
                  rightPanelCollapsed: layoutRef.current.rightCollapsed,
                  rightTab: tab,
                });
              }}
              noteDoc={noteDoc}
              citations={citations}
              editorRef={noteEditorRef}
              onChange={handleNoteChange}
              onSummaryMeta={handleSummaryMeta}
              onJumpCitation={citationJumpHolder.onJump}
              sentenceNotes={sentenceNotes}
              categories={categories}
              tagColors={tagColors}
              allTags={allTags}
              filters={noteFilters}
              onFiltersChange={setNoteFilters}
              noteSaveState={noteSaveState}
              noteSaveError={noteSaveError}
              onRetryNoteSave={retryNoteSaves}
              pendingFocusNoteId={pendingFocusNoteId}
              onFocusDone={() => setPendingFocusNoteId(null)}
              onUpdateNote={scheduleSentenceSave}
              onDeleteNote={deleteSentenceNote}
              onJumpNote={jumpToSentenceSource}
              onRelocateNote={relocateSentenceNote}
              onRetryDraft={retryDraftNote}
              onCreateCategory={createCategory}
              onOpenMetaManager={() => setMetaManagerOpen(true)}
              onAddToSummary={addSentenceNoteToSummary}
              onConfirm={setConfirmBox}
              onEvidenceMatrix={openEvidenceMatrixFromNote}
              onCreateTask={createTaskFromNote}
              onSuggestRelation={suggestRelationHandoff}
              evidenceCapable={evidenceCapable}
            />
          </aside>
        )}
        {!layout.rightCollapsed && <Resizer side="right" width={layout.rightWidth} onChange={(w) => saveLayout({ ...layout, rightWidth: w })} />}
        <button
          type="button"
          className={'wb-collapse-btn wb-collapse-right' + (layout.rightCollapsed ? ' collapsed' : '')}
          title={layout.rightCollapsed ? '展开笔记栏' : '折叠笔记栏'}
          onClick={() => saveLayout({ ...layout, rightCollapsed: !layout.rightCollapsed })}
        >
          {layout.rightCollapsed ? <IconPanelRight size={14} /> : <IconCollapseRight size={14} />}
        </button>
      </div>

      {toast && <div className={'wb-toast' + (toast.isError ? ' wb-toast-error' : '')}>{toast.message}</div>}

      {/* 返回保存失败弹窗 */}
      {backState === 'error' && (
        <BackFailOverlay
          onRetry={retryBackSave}
          onLeaveAnyway={leaveAnyway}
        />
      )}

      {/* 三选一确认框（删除笔记等） */}
      {confirmBox && (
        <ConfirmDialog
          title={confirmBox.title}
          message={confirmBox.message}
          options={confirmBox.options}
          onClose={() => setConfirmBox(null)}
        />
      )}

      {inputBox && (
        <TextInputDialog
          config={inputBox}
          onClose={() => setInputBox(null)}
        />
      )}

      {/* 分类/标签管理 */}
      {metaManagerOpen && (
        <MetaManagerModal
          categories={categories}
          tagStats={tagStats}
          tagColors={tagColors}
          categoryCounts={categoryCounts}
          onClose={() => setMetaManagerOpen(false)}
          onRenameCategory={renameCategory}
          onRecolorCategory={recolorCategory}
          onDeleteCategory={deleteCategory}
          onRenameTag={renameTag}
          onRemoveTag={removeTag}
          onSetTagColor={setTagColor}
          onRequestText={setInputBox}
        />
      )}
    </div>
  );
}

// ══════════ 子组件 ══════════

function SaveBadge({ status, dirty, label = '笔记' }) {
  if (status === 'saving') return <span className="wb-save-status wb-saving">正在保存{label}…</span>;
  if (status === 'error') return <span className="wb-save-status wb-error" title="点击重试"><IconAlert size={12} /> 保存失败</span>;
  if (status === 'saved') return <span className="wb-save-status wb-saved"><IconCheck size={12} /> 已保存</span>;
  if (dirty) return <span className="wb-save-status wb-pending">待保存</span>;
  return null;
}

function ThemeToggle({ mode, onChange }) {
  const cycle = () => onChange(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto');
  const label = mode === 'auto' ? '跟随宿主' : mode === 'light' ? '浅色' : '深色';
  return (
    <button type="button" className="wb-icon-btn wb-theme-btn" title={'主题模式：' + label + '（点击切换）'} onClick={cycle}>
      <IconTheme size={15} /> <span>{label}</span>
    </button>
  );
}

function StateBox({ icon, text, detail, error = false }) {
  return (
    <div className={'wb-state' + (error ? ' wb-state-error' : '')}>
      {icon}
      <p>{text}</p>
      {detail && <pre>{detail}</pre>}
    </div>
  );
}

/** 左右侧栏拖拽调宽条。 */
function Resizer({ side, width, onChange }) {
  const dragRef = useRef(null);
  const onPointerDown = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (e) => {
      const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
      const next = Math.max(side === 'left' ? 180 : 260, Math.min(720, startWidth + delta));
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('wb-resizing');
    };
    document.body.classList.add('wb-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div ref={dragRef} className={'wb-resizer wb-resizer-' + side} onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" title="拖动调整宽度" />;
}

/** 左侧导航面板：文档目录 / 按需缩略图 / 搜索 / 批注列表。 */
function LeftPanel({ tab, setTab, annotations, onJump, onDelete, onEditComment, registry, documentId, pageCount, activePage, getCapability }) {
  const [keyword, setKeyword] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [outline, setOutline] = useState({ status: 'idle', items: [], error: '' });
  const thumbCache = useRef(new Map());
  const thumbsRoot = useRef(null);

  // 目录只在打开目录页时读取；Bookmark API 返回完整的层级树。
  useEffect(() => {
    if (tab !== 'outline' || !registry || !documentId) return undefined;
    let cancelled = false;
    (async () => {
      setOutline({ status: 'loading', items: [], error: '' });
      try {
        const cap = getCapability('bookmark');
        const task = cap?.forDocument?.(documentId)?.getBookmarks?.() || cap?.getBookmarks?.();
        const result = task?.toPromise ? await task.toPromise() : await Promise.resolve(task);
        if (!cancelled) setOutline({ status: 'ready', items: result?.bookmarks || [], error: '' });
      } catch (error) {
        if (!cancelled) setOutline({ status: 'error', items: [], error: String(error.message || error) });
      }
    })();
    return () => { cancelled = true; };
  }, [tab, registry, documentId, getCapability]);

  // 文档切换或面板卸载时释放所有 Blob URL，避免长文档反复进入后堆积内存。
  useEffect(() => () => {
    thumbCache.current.forEach((entry) => entry.url && URL.revokeObjectURL(entry.url));
    thumbCache.current.clear();
  }, [documentId]);

  const filtered = useMemo(() => {
    let list = annotations.filter(a => a.embedPdf || a.subtype);
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(a => String(a.selectedText || a.embedPdf?.annotation?.contents || '').toLowerCase().includes(kw));
    }
    if (colorFilter) {
      list = list.filter(a => (a.color || '') === colorFilter);
    }
    return list.slice().sort((a, b) => (a.pageNumber - b.pageNumber));
  }, [annotations, keyword, colorFilter]);

  const tabs = [
    ['outline', '目录', IconOutline],
    ['thumbnails', '缩略图', IconThumbnails],
    ['search', '搜索', IconSearch],
    ['annotations', '批注', IconAnnotations],
  ];

  return (
    <div className="wb-left-inner">
      <nav className="wb-tabs" role="tablist">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={'wb-tab' + (tab === id ? ' active' : '')} title={label} onClick={() => setTab(id)}>
            <Icon size={14} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'annotations' && (
        <div className="wb-annotation-list">
          <div className="wb-list-tools">
            <div className="wb-search-box">
              <IconSearch size={12} />
              <input value={keyword} placeholder="搜索批注…" onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="wb-color-filters">
              <button type="button" className={colorFilter === '' ? 'active' : ''} onClick={() => setColorFilter('')} title="全部颜色">全部</button>
              {MARKUP_COLORS.map(color => (
                <button key={color} type="button" className={colorFilter === color ? 'active' : ''}
                  style={{ background: color }} title={'筛选' + color}
                  onClick={() => setColorFilter(colorFilter === color ? '' : color)} />
              ))}
            </div>
          </div>
          {filtered.length === 0 && <p className="wb-empty">暂无批注。在 PDF 中选中文字即可高亮、评论或引用。</p>}
          {filtered.map(item => (
            <AnnotationItem key={item.id} item={item} onJump={onJump} onDelete={onDelete} onEditComment={onEditComment} />
          ))}
        </div>
      )}

      {tab === 'outline' && (
        <div className="wb-outline">
          <div className="wb-outline-head">
            <strong>文档大纲</strong>
            {outline.status === 'ready' && outline.items.length > 0 && <span>{countBookmarks(outline.items)} 节</span>}
          </div>
          {outline.status === 'loading' && <p className="wb-empty">正在读取目录…</p>}
          {outline.status === 'error' && <p className="wb-empty">目录读取失败<br />{outline.error}</p>}
          {outline.status === 'ready' && outline.items.length === 0 && <p className="wb-empty">这份 PDF 没有内置目录。</p>}
          {outline.items.length > 0 && <OutlineTree items={outline.items} activePage={activePage} onJump={onJump} />}
        </div>
      )}

      {tab === 'thumbnails' && (
        <div className="wb-thumbs" ref={thumbsRoot}>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(page => (
            <ThumbnailItem key={page} page={page} active={page === activePage} rootRef={thumbsRoot}
              cache={thumbCache.current} getCapability={getCapability} onJump={onJump} />
          ))}
          {!pageCount && <p className="wb-empty">正在读取页面…</p>}
        </div>
      )}

      {tab === 'search' && (
        <SearchTab getCapability={getCapability} documentId={documentId} onJump={onJump} />
      )}
    </div>
  );
}

function OutlineTree({ items, activePage, onJump, level = 0 }) {
  return (
    <ul className="wb-outline-tree" data-level={level}>
      {items.map((item, index) => (
        <OutlineNode key={`${level}-${index}-${item.title}`} item={item} activePage={activePage} onJump={onJump} level={level} />
      ))}
    </ul>
  );
}

function OutlineNode({ item, activePage, onJump, level }) {
  const [open, setOpen] = useState(level < 1);
  const children = item.children || [];
  const page = bookmarkPageNumber(item.target);
  return (
    <li>
      <div className={'wb-outline-row' + (page === activePage ? ' active' : '')} style={{ '--outline-depth': level }}>
        {children.length ? (
          <button type="button" className="wb-outline-toggle" aria-label={open ? '折叠章节' : '展开章节'} aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <IconChevronDown size={11} />
          </button>
        ) : <span className="wb-outline-leaf" />}
        <button type="button" className="wb-outline-link" disabled={!page} title={item.title} onClick={() => page && onJump(page)}>
          <span>{item.title || '未命名章节'}</span>
          {page && <em>{page}</em>}
        </button>
      </div>
      {open && children.length > 0 && <OutlineTree items={children} activePage={activePage} onJump={onJump} level={level + 1} />}
    </li>
  );
}

const THUMB_CACHE_MAX_ENTRIES = 200;

/** 缩略图 LRU 写入：ready 条目刷新使用顺序，超限驱逐最旧并回收其 blob URL。 */
function setThumbnailCacheEntry(cache, page, entry) {
  if (entry.status === 'ready') cache.delete(page);
  cache.set(page, entry);
  while (cache.size > THUMB_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === page) break; // 防御：不驱逐刚写入的条目
    const oldest = cache.get(oldestKey);
    if (oldest?.url) URL.revokeObjectURL(oldest.url);
    cache.delete(oldestKey);
  }
}

function ThumbnailItem({ page, active, rootRef, cache, getCapability, onJump }) {
  const hostRef = useRef(null);
  const [state, setState] = useState(() => cache.get(page) || { status: 'idle', url: '' });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;
    let cancelled = false;
    let loading = false;
    const load = async () => {
      if (loading || cancelled) return;
      const cached = cache.get(page);
      if (cached?.status === 'ready') { setState(cached); return; }
      // 失败条目有限重试（≤2 次），避免坏页反复打渲染引擎
      if (cached?.status === 'error' && (cached.attempts || 0) >= 2) return;
      loading = true;
      setState({ status: 'loading', url: '' });
      try {
        const task = getCapability('thumbnail')?.renderThumb?.(page - 1, 0.42);
        const blob = task?.toPromise ? await task.toPromise() : await Promise.resolve(task);
        if (!(blob instanceof Blob)) throw new Error('empty thumbnail');
        const url = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        const next = { status: 'ready', url };
        setThumbnailCacheEntry(cache, page, next);
        setState(next);
      } catch {
        if (!cancelled) {
          const next = { status: 'error', url: '', attempts: (cache.get(page)?.attempts || 0) + 1 };
          setThumbnailCacheEntry(cache, page, next);
          setState(next);
        }
      } finally {
        loading = false;
      }
    };
    // 持续观察（不在首次加载后断开）：被 LRU 驱逐的页面再次可见时可重载
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) load();
    }, { root: rootRef.current, rootMargin: '320px 0px', threshold: 0.01 });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); };
  }, [page, cache, getCapability, rootRef]);

  return (
    <button ref={hostRef} type="button" className={'wb-thumb' + (active ? ' active' : '')}
      title={'第 ' + page + ' 页'} onClick={() => onJump(page)} aria-current={active ? 'page' : undefined}>
      {state.url
        ? <img src={state.url} alt={'第 ' + page + ' 页'} onError={() => setState({ status: 'idle', url: '' })} />
        : <span className="wb-thumb-placeholder">{state.status === 'error' ? '预览不可用' : '正在载入…'}</span>}
      <em>{page}</em>
    </button>
  );
}

function SearchTab({ getCapability, documentId, onJump }) {
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const runSearch = async () => {
    const cap = getCapability('search');
    const kw = keyword.trim();
    if (!cap || !kw) return;
    setBusy(true);
    setResults(null);
    try {
      const task = cap.searchAllPages(kw, documentId || undefined);
      const res = await (task?.toPromise ? task.toPromise() : Promise.resolve(task));
      // SearchAllPagesResult: { results: SearchResult[], total }
      const list = (res?.results || []).map((r) => {
        const ctx = r.context || {};
        const before = ctx.truncatedLeft ? '…' : '';
        const after = ctx.truncatedRight ? '…' : '';
        return {
          pageNumber: (r.pageIndex ?? 0) + 1,
          preview: before + (ctx.before || '') + (ctx.match || '') + (ctx.after || '') + after,
          charIndex: r.charIndex,
        };
      });
      setResults({ items: list, total: res?.total ?? list.length });
      setActiveIndex(0);
      if (list.length) {
        cap.goToResult?.(0, documentId || undefined);
      }
    } catch (error) {
      setResults({ items: [], total: 0, error: String(error.message || error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wb-search-tab">
      <div className="wb-search-box">
        <IconSearch size={12} />
        <input
          value={keyword}
          placeholder="搜索全文（中英文）…"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
        />
        <button type="button" className="wb-mini-btn" disabled={busy || !keyword.trim()} onClick={runSearch}>
          {busy ? '搜索中…' : '搜索'}
        </button>
      </div>
      {results && results.error && <p className="wb-empty wb-error-text">{results.error}</p>}
      {results && !results.error && (
        <>
          <p className="wb-search-summary">
            共 {results.total} 处匹配
          </p>
          <div className="wb-search-results">
            {(results.items || []).map((item, index) => (
              <button key={index} type="button"
                className={'wb-search-result' + (index === activeIndex ? ' active' : '')}
                title={'第 ' + item.pageNumber + ' 页：' + item.preview}
                onClick={() => {
                  setActiveIndex(index);
                  getCapability('search')?.goToResult?.(index, documentId || undefined);
                  onJump(item.pageNumber);
                }}>
                <em>第 {item.pageNumber} 页</em>
                <span>{item.preview || ''}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


function AnnotationItem({ item, onJump, onDelete, onEditComment }) {
  const stale = item.stale;
  const color = item.color || '#FFD54F';
  const kind = markupKind(item.subtype || 'highlight');
  const kindLabel = { highlight: '高亮', underline: '下划线', strikeout: '删除线', text: '文本', note: '便签', ink: '手绘', square: '框选' }[kind] || kind;
  return (
    <article className="wb-anno-item">
      <header>
        <span className="wb-anno-kind" style={{ background: color }}>{kindLabel}</span>
        <button type="button" className="wb-anno-jump" title={'跳转到第 ' + item.pageNumber + ' 页'} onClick={() => onJump(item.pageNumber)}>
          第 {item.pageNumber} 页
        </button>
        <span className="wb-anno-actions">
          {kind === 'note' ? (
            <button type="button" title="编辑评论" onClick={() => onEditComment(item)}><IconEdit size={11} /></button>
          ) : null}
          <button type="button" title="删除批注" onClick={() => onDelete(item)}><IconDelete size={11} /></button>
        </span>
      </header>
      {(item.selectedText || item.embedPdf?.annotation?.contents) && (
        <blockquote>{item.selectedText || item.embedPdf?.annotation?.contents}</blockquote>
      )}
    </article>
  );
}

/** 唯一文本选择工具栏（Portal 渲染到 body，fixed 视口坐标，防 PDF 容器裁切）。 */
function SelectionToolbar({ placement, onMarkup, onSentenceNote, onQuote, onCopy, onExplain }) {
  const [showColors, setShowColors] = useState(false);
  if (!placement?.rect) return null;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const WIDTH = 316;
  // 视口坐标钳制：左/右各保留 8px 安全边距；优先放在选区上方，空间不足放下方
  const rawX = placement.rect.origin.x;
  const rawY = placement.suggestTop ? placement.rect.origin.y - 50 : placement.rect.origin.y + placement.rect.size.height + 10;
  const px = Math.min(Math.max(8, rawX), Math.max(8, viewportW - WIDTH - 8));
  let py = rawY;
  if (py < 8) py = placement.rect.origin.y + placement.rect.size.height + 10;
  if (py + 46 > viewportH - 8) py = Math.max(8, viewportH - 54);
  const toolbar = (
    <div className="wb-selection-toolbar" style={{ left: px, top: py }} role="toolbar" aria-label="文本操作">
      <button type="button" title="复制选中文字" aria-label="复制选中文字" onClick={onCopy}><IconCopy size={13} /></button>
      <span className="wb-tb-divider" />
      <span className="wb-tb-color-wrap">
        <button type="button" title="高亮（默认色）" aria-label="高亮" onClick={() => onMarkup('highlight', MARKUP_COLORS[0])}>
          <IconHighlighter size={13} />
        </button>
        <button type="button" className={'wb-tb-color-toggle' + (showColors ? ' active' : '')}
          title={showColors ? '收起颜色' : '选择高亮颜色'} aria-label={showColors ? '收起颜色' : '选择高亮颜色'}
          aria-expanded={showColors}
          onClick={() => setShowColors(v => !v)}>
          <IconChevronDown size={10} />
        </button>
        {showColors && (
          <span className="wb-tb-colors">
            {MARKUP_COLORS.map(color => (
              <button key={color} type="button" title={'高亮颜色 ' + color} aria-label={'高亮颜色 ' + color}
                style={{ background: color }} onClick={() => { setShowColors(false); onMarkup('highlight', color); }} />
            ))}
          </span>
        )}
      </span>
      <button type="button" title="下划线" aria-label="下划线" onClick={() => onMarkup('underline', MARKUP_COLORS[2])}><IconUnderline size={13} /></button>
      <button type="button" title="删除线" aria-label="删除线" onClick={() => onMarkup('strikeout', MARKUP_COLORS[3])}><IconStrike size={13} /></button>
      <span className="wb-tb-divider" />
      <button type="button" title="添加逐句笔记" aria-label="添加逐句笔记" onClick={onSentenceNote}><IconNote title="添加逐句笔记" size={13} /></button>
      <button type="button" title="引用到汇总笔记" aria-label="引用到汇总笔记" onClick={onQuote}><IconQuote title="引用到汇总笔记" size={13} /></button>
      <button type="button" title="让 AI 解释选中文字" aria-label="让 AI 解释选中文字" onClick={onExplain}><IconSpark title="让 AI 解释" size={13} /></button>
    </div>
  );
  return createPortal(toolbar, document.body);
}

/** 画布批注就地操作浮层：改色、评论、删除，不打断当前阅读位置。 */
function AnnotationPeek({ peek, onEdit, onDelete, onRecolor, onClose }) {
  const width = 248;
  const x = Math.min(Math.max(8, peek.x + 10), Math.max(8, window.innerWidth - width - 8));
  const y = Math.min(Math.max(58, peek.y + 10), Math.max(58, window.innerHeight - 118));
  return createPortal((
    <aside className="wb-annotation-peek" style={{ left: x, top: y }} aria-label="批注操作">
      <header>
        <strong>第 {peek.item.pageNumber} 页批注</strong>
        <button type="button" onClick={onClose} aria-label="关闭批注操作">×</button>
      </header>
      <div className="wb-annotation-peek-colors" aria-label="批注颜色">
        {MARKUP_COLORS.map(color => (
          <button key={color} type="button" style={{ background: color }} aria-label={'设为 ' + color}
            className={(peek.item.color || peek.item.embedPdf?.annotation?.strokeColor) === color ? 'active' : ''}
            onClick={() => onRecolor(color)} />
        ))}
      </div>
      <div className="wb-annotation-peek-actions">
        <button type="button" onClick={onEdit}><IconEdit size={12} /> 评论</button>
        <button type="button" className="danger" onClick={onDelete}><IconDelete size={12} /> 删除</button>
      </div>
    </aside>
  ), document.body);
}

function ReaderDialog({ title, icon, children, actions, onClose, alert = false, className = '', overlayClass = '' }) {
  return (
    <div className={'wb-overlay ' + overlayClass} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={'wb-overlay-panel ' + className} onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{icon}{title}</strong>
          {onClose && <button type="button" className="wb-overlay-close" title="关闭" aria-label="关闭" onClick={onClose}>×</button>}
        </header>
        {children}
        {actions && <div className="wb-overlay-actions">{actions}</div>}
      </div>
    </div>
  );
}

function TextInputDialog({ config, onClose }) {
  const [value, setValue] = useState(config.value || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select?.(); }, []);
  const submit = async (event) => {
    event.preventDefault();
    const next = value.trim();
    if (!next && !config.allowEmpty) { setError('请输入内容'); return; }
    setBusy(true); setError('');
    try {
      await config.onSubmit(next);
      onClose();
    } catch (reason) {
      setError(String(reason.message || reason));
      setBusy(false);
    }
  };
  return (
    <ReaderDialog title={config.title} onClose={busy ? undefined : onClose} className="wb-input-dialog" overlayClass="wb-overlay-front">
      <form onSubmit={submit}>
        <label htmlFor="wb-dialog-input">{config.label || '内容'}</label>
        {config.multiline
          ? <textarea ref={inputRef} id="wb-dialog-input" value={value} rows={5} onChange={(event) => setValue(event.target.value)} />
          : <input ref={inputRef} id="wb-dialog-input" value={value} onChange={(event) => setValue(event.target.value)} />}
        {error && <p className="wb-dialog-error"><IconAlert size={12} /> {error}</p>}
        <div className="wb-overlay-actions">
          <button type="button" className="wb-btn-plain" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="wb-btn-primary" disabled={busy}>{busy ? '处理中…' : (config.submitLabel || '确定')}</button>
        </div>
      </form>
    </ReaderDialog>
  );
}

/** 返回保存失败弹窗：重试保存 / 仍然返回。 */
function BackFailOverlay({ onRetry, onLeaveAnyway }) {
  return (
    <ReaderDialog title="部分内容保存失败" icon={<IconAlert size={14} />} alert className="wb-back-fail"
      actions={<>
          <button type="button" className="wb-btn-primary" onClick={onRetry}><IconRetry size={13} /> 重试保存</button>
          <button type="button" className="wb-btn-plain" onClick={onLeaveAnyway}>仍然返回</button>
      </>}>
      <p>返回前未能完成全部保存（网络或磁盘异常）。可以选择重试保存，或放弃未保存内容直接返回。</p>
    </ReaderDialog>
  );
}

/** 三选一确认框。 */
function ConfirmDialog({ title, message, options, onClose }) {
  return (
    <ReaderDialog title={title} onClose={onClose} alert actions={
      <>
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              className={option.danger ? 'wb-btn-danger' : option.primary ? 'wb-btn-primary' : 'wb-btn-plain'}
              onClick={() => { onClose(); option.action(); }}
            >
              {option.label}
            </button>
          ))}
      </>
    }>
      {message && <p>{message}</p>}
    </ReaderDialog>
  );
}

/** 分类/标签管理弹窗（v14：改名/改色/删除；删除不删笔记，标签复用单一体系）。 */
function MetaManagerModal({ categories, tagStats, tagColors, categoryCounts, onClose,
  onRenameCategory, onRecolorCategory, onDeleteCategory, onRenameTag, onRemoveTag, onSetTagColor, onRequestText }) {
  const [tab, setTab] = useState('categories'); // categories | tags
  const [colorFor, setColorFor] = useState(null); // 正在改色的行 id（分类 id 或 'tag:'+name）
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { kind: 'category'|'tag', id, name } 待删除确认
  const COLOR_PALETTE = ['#8bb8e8', '#f0c94f', '#e88b8b', '#8be0b8', '#c98be8', '#e8a08b', '#8be0e0', '#b8b8b8', '#d97c6d', '#7cc27f', '#f2b04f', '#a8a8a8'];

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  return (
    <div className="wb-overlay" role="dialog" aria-label="分类与标签管理" onClick={onClose}>
      <div className="wb-overlay-panel wb-meta-manager" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong><IconTag size={14} /> 分类与标签管理</strong>
          <button type="button" className="wb-overlay-close" title="关闭" aria-label="关闭" onClick={onClose}>×</button>
        </header>
        <nav className="wb-meta-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'categories'} className={'wb-meta-tab' + (tab === 'categories' ? ' active' : '')} onClick={() => setTab('categories')}>
            分类（{categories.length}）
          </button>
          <button type="button" role="tab" aria-selected={tab === 'tags'} className={'wb-meta-tab' + (tab === 'tags' ? ' active' : '')} onClick={() => setTab('tags')}>
            标签（{Object.keys(tagStats).length}）
          </button>
        </nav>
        {error && <p className="wb-meta-error"><IconAlert size={12} /> {error}</p>}

        {tab === 'categories' ? (
          <ul className="wb-meta-list">
            {categories.map((category) => (
              <li key={category.id} className="wb-meta-row">
                <span className="wb-meta-swatch" style={{ background: category.color }} title="分类颜色" />
                <span className="wb-meta-name" title={category.name}>{category.name}</span>
                <em className="wb-meta-count" title="使用中的逐句笔记数">{categoryCounts[category.id] || 0}</em>
                <span className="wb-meta-actions">
                  <button type="button" title="改名" aria-label={'改名单：' + category.name} disabled={busy}
                    onClick={() => {
                      onRequestText({ title: '重命名分类', label: '分类名称', value: category.name, submitLabel: '保存',
                        onSubmit: (name) => run(() => onRenameCategory(category.id, name)) });
                    }}>改名</button>
                  <button type="button" title="改色" aria-label={'改色：' + category.name} disabled={busy}
                    onClick={() => setColorFor(colorFor === category.id ? null : category.id)}>颜色</button>
                  <button type="button" className="danger" title="删除分类（笔记归入未分类）" aria-label={'删除分类：' + category.name} disabled={busy}
                    onClick={() => setPending({ kind: 'category', id: category.id, name: category.name })}>删除</button>
                </span>
                {colorFor === category.id && (
                  <span className="wb-meta-colors">
                    {COLOR_PALETTE.map(color => (
                      <button key={color} type="button" title={color} aria-label={'分类颜色 ' + color}
                        style={{ background: color, outline: category.color === color ? '2px solid var(--wb-accent)' : undefined }}
                        onClick={() => run(async () => { await onRecolorCategory(category.id, color); setColorFor(null); })} />
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="wb-meta-list">
            {Object.keys(tagStats).sort((a, b) => (tagStats[b] - tagStats[a]) || a.localeCompare(b, 'zh')).map((tag) => (
              <li key={tag} className="wb-meta-row">
                <span className="wb-meta-swatch" style={{ background: tagColors[tag] || '#8bb8e8' }} title="标签颜色" />
                <span className="wb-meta-name" title={tag}>{tag}</span>
                <em className="wb-meta-count" title="使用次数">{tagStats[tag]}</em>
                <span className="wb-meta-actions">
                  <button type="button" title="改名/合并（会同步到全部笔记）" aria-label={'改名标签：' + tag} disabled={busy}
                    onClick={() => {
                      onRequestText({ title: '重命名标签', label: '标签名称', value: tag, submitLabel: '保存',
                        onSubmit: (name) => name === tag ? undefined : run(() => onRenameTag(tag, name)) });
                    }}>改名</button>
                  <button type="button" title="改色" aria-label={'改色标签：' + tag} disabled={busy}
                    onClick={() => setColorFor(colorFor === 'tag:' + tag ? null : 'tag:' + tag)}>颜色</button>
                  <button type="button" className="danger" title="删除标签（从全部笔记移除，不删笔记）" aria-label={'删除标签：' + tag} disabled={busy}
                    onClick={() => setPending({ kind: 'tag', id: tag, name: tag })}>删除</button>
                </span>
                {colorFor === 'tag:' + tag && (
                  <span className="wb-meta-colors">
                    {COLOR_PALETTE.map(color => (
                      <button key={color} type="button" title={color} aria-label={'标签颜色 ' + color}
                        style={{ background: color, outline: tagColors[tag] === color ? '2px solid var(--wb-accent)' : undefined }}
                        onClick={() => run(async () => { await onSetTagColor(tag, color); setColorFor(null); })} />
                    ))}
                  </span>
                )}
              </li>
            ))}
            {Object.keys(tagStats).length === 0 && <li className="wb-meta-empty">暂无标签。为笔记添加标签后会出现在这里。</li>}
          </ul>
        )}

        <footer className="wb-meta-foot">
          <span className="wb-meta-hint">删除分类/标签不会删除任何笔记</span>
          <button type="button" className="wb-btn-plain" onClick={onClose}>完成</button>
        </footer>
      </div>

      {pending && (
        <div className="wb-overlay" role="alertdialog" aria-label={'删除' + (pending.kind === 'category' ? '分类' : '标签')}>
          <div className="wb-overlay-panel">
            <header><strong><IconAlert size={14} /> 确认删除{pending.kind === 'category' ? '分类' : '标签'}</strong></header>
            <p>
              {pending.kind === 'category'
                ? `删除分类「${pending.name}」后，相关笔记将归入未分类，笔记内容保留。`
                : `删除标签「${pending.name}」后，将从全部笔记中移除该标签，笔记内容保留。`}
            </p>
            <div className="wb-overlay-actions">
              <button type="button" className="wb-btn-primary" disabled={busy} onClick={() => run(async () => {
                if (pending.kind === 'category') await onDeleteCategory(pending.id);
                else await onRemoveTag(pending.id);
                setPending(null);
              })}>确认删除</button>
              <button type="button" className="wb-btn-plain" onClick={() => setPending(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 右侧笔记面板：逐句笔记 / 汇总笔记 双视图。 */
function RightPanel(props) {
  const {
    rightTab, onTabChange, noteDoc, citations, editorRef, onChange, onSummaryMeta,
    onJumpCitation, sentenceNotes, categories, tagColors, allTags, filters, onFiltersChange,
    noteSaveState, noteSaveError, onRetryNoteSave, pendingFocusNoteId, onFocusDone,
    onUpdateNote, onDeleteNote, onJumpNote, onRelocateNote, onRetryDraft, onCreateCategory, onOpenMetaManager,
    onAddToSummary, onConfirm,
    onEvidenceMatrix, onCreateTask, onSuggestRelation, evidenceCapable,
  } = props;
  const filtered = useMemo(() => applyNoteFilters(sentenceNotes, filters), [sentenceNotes, filters]);
  const savedCount = sentenceNotes.filter(n => !n.saveFailed).length;

  const setFilter = (patch) => onFiltersChange(prev => ({ ...prev, ...patch }));
  const clearFilters = () => onFiltersChange({ q: '', category: '', tag: '', status: '', starred: false, importance: '', sort: 'page' });
  const hasFilter = Boolean(filters.q || filters.category || filters.tag || filters.status || filters.starred || filters.importance);

  const handleDelete = (note) => {
    onConfirm({
      title: '删除逐句笔记',
      message: '原文摘录与用户笔记将被删除。默认只删除笔记，高亮保留。',
      options: [
        { label: '仅删除笔记', primary: true, action: () => onDeleteNote(note, false) },
        { label: '删除笔记及对应高亮', action: () => onDeleteNote(note, true) },
        { label: '取消', action: () => {} },
      ],
    });
  };

  return (
    <div className="wb-note-panel">
      <header className="wb-note-head">
        <IconNote size={14} />
        <strong>文献笔记</strong>
        <NoteSaveBadge state={noteSaveState} error={noteSaveError} onRetry={onRetryNoteSave} />
      </header>
      <nav className="wb-note-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={rightTab === 'sentence'}
          className={'wb-note-tab' + (rightTab === 'sentence' ? ' active' : '')}
          title="摘录笔记：原文与个人理解" onClick={() => onTabChange('sentence')}>
          摘录{filtered.length ? <em>{filtered.length}</em> : null}
        </button>
        <button type="button" role="tab" aria-selected={rightTab === 'summary'}
          className={'wb-note-tab' + (rightTab === 'summary' ? ' active' : '')}
          title="文献总结：整篇文献的结构化笔记" onClick={() => onTabChange('summary')}>
          总结
        </button>
      </nav>

      {rightTab === 'sentence' ? (
        <SentenceNotesTab
          notes={filtered}
          categories={categories}
          tagColors={tagColors}
          allTags={allTags}
          filters={filters}
          setFilter={setFilter}
          clearFilters={clearFilters}
          hasFilter={hasFilter}
          pendingFocusNoteId={pendingFocusNoteId}
          onFocusDone={onFocusDone}
          onUpdate={onUpdateNote}
          onDelete={handleDelete}
          onJump={onJumpNote}
          onRelocate={onRelocateNote}
          onCreateCategory={onCreateCategory}
          onOpenMetaManager={onOpenMetaManager}
          onAddToSummary={onAddToSummary}
          onEvidenceMatrix={onEvidenceMatrix}
          onCreateTask={onCreateTask}
          onSuggestRelation={onSuggestRelation}
          evidenceCapable={evidenceCapable}
        />
      ) : (
        <SummaryTab
          noteDoc={noteDoc}
          citations={citations}
          editorRef={editorRef}
          onChange={onChange}
          onSummaryMeta={onSummaryMeta}
          onJumpCitation={onJumpCitation}
          categories={categories}
          tagColors={tagColors}
          allTags={allTags}
        />
      )}
    </div>
  );
}

function NoteSaveBadge({ state, error, onRetry }) {
  if (state === 'saving') return <span className="wb-note-save wb-note-saving">正在保存…</span>;
  if (state === 'error') return (
    <button type="button" className="wb-note-save wb-note-error" title={error || '保存失败，点击重试'} onClick={onRetry}>
      <IconAlert size={11} /> 保存失败<IconRetry size={11} />
    </button>
  );
  if (state === 'saved') return <span className="wb-note-save wb-note-saved"><IconCheck size={11} /> 已保存</span>;
  if (state === 'pending') return <span className="wb-note-save wb-note-pending">待保存</span>;
  return null;
}

/** 逐句笔记视图：搜索 / 筛选 / 排序 + 卡片列表。 */
function SentenceNotesTab({ notes, categories, tagColors, allTags, filters, setFilter, clearFilters, hasFilter,
  pendingFocusNoteId, onFocusDone, onUpdate, onDelete, onJump, onRelocate, onRetryDraft, onCreateCategory, onOpenMetaManager, onAddToSummary,
  onEvidenceMatrix, onCreateTask, onSuggestRelation, evidenceCapable }) {
  const categoryOptions = categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>);
  const tagOptions = allTags.map(tag => <option key={tag} value={tag}>{tag}</option>);
  const showEmpty = notes.length === 0 && !hasFilter;
  const [showFilters, setShowFilters] = useState(false);
  return (
    <div className="wb-sentence-tab">
      <div className="wb-sentence-tools">
        <div className="wb-sentence-primary-tools">
          <div className="wb-search-box">
            <IconSearch size={12} />
            <input value={filters.q} placeholder="搜索摘录或笔记" aria-label="搜索摘录或笔记"
              onChange={(e) => setFilter({ q: e.target.value })} />
          </div>
          <button type="button" className={'wb-filter-toggle' + (hasFilter ? ' active' : '')}
            aria-expanded={showFilters} onClick={() => setShowFilters(value => !value)}>
            筛选 <IconChevronDown size={11} />
          </button>
        </div>
        {showFilters && <div className="wb-filter-row">
          <select value={filters.category} title="按分类筛选" aria-label="按分类筛选"
            onChange={(e) => setFilter({ category: e.target.value })}>
            <option value="">全部分类</option>
            <option value="none">未分类</option>
            {categoryOptions}
          </select>
          <select value={filters.tag} title="按标签筛选" aria-label="按标签筛选"
            onChange={(e) => setFilter({ tag: e.target.value })}>
            <option value="">全部标签</option>
            {tagOptions}
          </select>
          <select value={filters.status} title="按状态筛选" aria-label="按状态筛选"
            onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">全部状态</option>
            {NOTE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.importance} title="按重要程度筛选" aria-label="按重要程度筛选"
            onChange={(e) => setFilter({ importance: e.target.value })}>
            <option value="">全部重要程度</option>
            <option value="3">★★★</option>
            <option value="2">★★</option>
            <option value="1">★</option>
          </select>
          <select value={filters.sort} title="排序方式" aria-label="排序方式"
            onChange={(e) => setFilter({ sort: e.target.value })}>
            <option value="page">按页码</option>
            <option value="created">按创建时间</option>
            <option value="updated">按更新时间</option>
          </select>
          <button type="button" className="wb-clear-filter" title="管理分类与标签（改名/改色/删除）" aria-label="管理分类与标签"
            onClick={onOpenMetaManager}>
            <IconMore size={12} /> 管理
          </button>
          <button type="button" className="wb-clear-filter" title="新建自定义分类" aria-label="新建自定义分类"
            onClick={onCreateCategory}>
            <IconPlus size={12} /> 分类
          </button>
          <button type="button" className={'wb-star-filter' + (filters.starred ? ' active' : '')}
            title={filters.starred ? '显示全部（取消收藏筛选）' : '只显示收藏'}
            aria-pressed={filters.starred}
            onClick={() => setFilter({ starred: !filters.starred })}>
            {filters.starred ? <IconStarFilled size={13} /> : <IconStar size={13} />}
          </button>
          {hasFilter && (
            <button type="button" className="wb-clear-filter" title="清除全部筛选" aria-label="清除全部筛选" onClick={clearFilters}>
              <IconDelete size={12} /> 清除
            </button>
          )}
        </div>}
      </div>

      {showEmpty ? (
        <p className="wb-empty">还没有摘录。选中 PDF 文字后，点击「添加笔记」。</p>
      ) : notes.length === 0 ? (
        <p className="wb-empty">没有符合筛选条件的笔记。<button type="button" className="wb-mini-btn" onClick={clearFilters}>清除筛选</button></p>
      ) : (
        <div className="wb-sentence-list">
          {notes.map(note => (
            <SentenceNoteCard
              key={note.id}
              note={note}
              categories={categories}
              tagColors={tagColors}
              allTags={allTags}
              focusRequested={pendingFocusNoteId === note.id}
              onFocusDone={onFocusDone}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onJump={onJump}
              onRelocate={onRelocate}
              onRetryDraft={onRetryDraft}
              onAddToSummary={onAddToSummary}
              onEvidenceMatrix={onEvidenceMatrix}
              onCreateTask={onCreateTask}
              onSuggestRelation={onSuggestRelation}
              evidenceCapable={evidenceCapable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 逐句笔记卡片（P6：结构化证据 + 证据矩阵/建任务/论证关系入口）。 */
function SentenceNoteCard({ note, categories, tagColors, allTags, focusRequested, onFocusDone, onUpdate, onDelete, onJump, onRelocate, onRetryDraft, onAddToSummary, onEvidenceMatrix, onCreateTask, onSuggestRelation, evidenceCapable }) {
  const [comment, setComment] = useState(note.comment);
  const [tagInput, setTagInput] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [showOrganize, setShowOrganize] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidence, setEvidence] = useState(() => ({ ...(note.evidence || {}) }));
  const commentRef = useRef(note.comment);
  commentRef.current = comment;
  // 本地编辑即真相源：连续填写多个字段时以上一次本地值为基准，避免防抖窗口内被未刷新的 props 覆盖
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  const inputRef = useRef(null);
  const moreRef = useRef(null);

  const setEvidenceField = (key, value) => {
    const next = { ...evidenceRef.current, [key]: value };
    if (!String(value).trim()) delete next[key];
    evidenceRef.current = next;
    setEvidence(next);
    if (evidenceCapable) onUpdate(note.id, { evidence: next });
  };

  useEffect(() => {
    if (focusRequested) {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: 'nearest' });
      onFocusDone?.();
    }
  }, [focusRequested, onFocusDone]);

  // 更多菜单：点击外部或 Esc 关闭
  useEffect(() => {
    if (!showMore) return;
    const close = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) setShowMore(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setShowMore(false);
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [showMore]);

  const changeComment = (value) => {
    setComment(value);
    onUpdate(note.id, { comment: value });
  };
  const addTag = (raw) => {
    const tag = String(raw || '').trim().replace(/^#/, '').slice(0, 30);
    if (!tag) return;
    const tags = note.tags || [];
    if (tags.includes(tag)) { setTagInput(''); return; }
    setTagInput('');
    onUpdate(note.id, { tags: [...tags, tag].slice(0, 8) });
  };
  const removeTag = (tag) => onUpdate(note.id, { tags: (note.tags || []).filter(t => t !== tag) });
  const category = note.categoryId ? categories.find(c => c.id === note.categoryId) : null;

  return (
    <article className={'wb-snote-card' + (note.saveFailed ? ' wb-snote-failed' : '') + (note.annotationDeleted ? ' wb-snote-stale' : '')} data-note-id={note.id}>
      <header className="wb-snote-head">
        <button type="button" className="wb-snote-page" title={note.annotationDeleted ? '原定位已失效' : '跳回原文'}
          aria-label={note.annotationDeleted ? '原定位已失效' : '定位到第 ' + note.pageNumber + ' 页'}
          onClick={() => onJump(note)}>
          {note.annotationDeleted ? <IconStale size={12} /> : <IconLocate size={12} />}
          第 {note.pageNumber} 页
        </button>
        <button type="button" className={'wb-snote-star' + (note.starred ? ' active' : '')}
          title={note.starred ? '取消收藏' : '收藏'} aria-pressed={note.starred}
          onClick={() => onUpdate(note.id, { starred: !note.starred })}>
          {note.starred ? <IconStarFilled size={13} /> : <IconStar size={13} />}
        </button>
        <span className="wb-snote-more-anchor" ref={moreRef}>
          <button type="button" className="wb-snote-more" title="更多操作" aria-label="更多操作" aria-expanded={showMore}
            onClick={() => setShowMore(v => !v)}>
            <IconMore size={14} />
          </button>
          {showMore && (
            <span className="wb-snote-more-pop" role="menu">
              <label className="wb-more-field">状态
                <select value={note.status} aria-label="笔记状态"
                  onChange={(e) => onUpdate(note.id, { status: e.target.value })}>
                  {NOTE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <span className="wb-snote-importance" role="menuitem" title="重要程度">
                {[1, 2, 3].map(level => (
                  <button key={level} type="button" className={note.importance === level ? 'active' : ''}
                    title={IMPORTANCE_LABELS[level]} aria-label={'重要程度 ' + level}
                    onClick={() => { onUpdate(note.id, { importance: level }); setShowMore(false); }}>
                    {IMPORTANCE_LABELS[level]}
                  </button>
                ))}
              </span>
              <span className="wb-snote-created" title="创建时间">创建于 {formatShortTime(note.createdAt)}</span>
              <button type="button" role="menuitem" title="把这条逐句笔记（摘录+我的理解）插入汇总笔记" onClick={() => { setShowMore(false); onAddToSummary(note); }}>
                <IconQuote size={12} /> 添加到汇总
              </button>
              <span className="wb-more-sep" role="separator" />
              <button type="button" role="menuitem" title="回到项目打开证据矩阵（该条摘录已入库，可在矩阵中核对）" onClick={() => { setShowMore(false); onEvidenceMatrix(note); }}>
                <IconAnnotations size={12} /> 进入证据矩阵
              </button>
              <button type="button" role="menuitem" title="把这条证据建为项目研究任务（写入任务清单，需确认）" onClick={() => { setShowMore(false); onCreateTask(note); }}>
                <IconPlus size={12} /> 建议创建任务
              </button>
              <button type="button" role="menuitem" title="让 Agent 基于项目证据推荐与其他文献的论证关系（只出候选，不直接写入）" onClick={() => { setShowMore(false); onSuggestRelation(note); }}>
                <IconLocate size={12} /> 建议论证关系
              </button>
              <span className="wb-more-sep" role="separator" />
              {note.annotationDeleted && note.position?.formatted?.length ? (
                <button type="button" role="menuitem" title="按保存的坐标重新创建高亮并关联" onClick={() => { setShowMore(false); onRelocate(note); }}>
                  <IconLocate size={12} /> 重新建立定位
                </button>
              ) : null}
              <button type="button" role="menuitem" title="删除逐句笔记（可同时删除高亮）" onClick={() => { setShowMore(false); onDelete(note); }}>
                <IconDelete size={12} /> 删除
              </button>
            </span>
          )}
        </span>
      </header>

      <blockquote className="wb-snote-quote">{note.quotedText}</blockquote>

      <label className="wb-snote-comment">
        <span>我的理解</span>
        <textarea ref={inputRef} rows={2} placeholder="补充理解、评价或疑问…（自动保存）"
          value={comment} onChange={(e) => changeComment(e.target.value)} />
      </label>

      <button type="button" className="wb-snote-organize-toggle" aria-expanded={showOrganize}
        onClick={() => setShowOrganize(value => !value)}>
        整理信息{(category || note.tags?.length || Object.keys(note.evidence || {}).length) ? <em>已填写</em> : null}
        <IconChevronDown size={11} />
      </button>

      {showOrganize && <div className="wb-snote-organize">
      <div className="wb-snote-meta">
        <select className="wb-snote-category" value={note.categoryId || ''} title="主要分类" aria-label="主要分类"
          onChange={(e) => onUpdate(note.id, { categoryId: e.target.value || null })}>
          <option value="">未分类</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="wb-snote-tags">
          {(note.tags || []).map(tag => (
            <span key={tag} className="wb-snote-tag" title={tag} style={tagColors[tag] ? { borderColor: tagColors[tag], color: tagColors[tag] } : undefined}>
              {tag}
              <button type="button" title="移除标签 ' + tag" aria-label={'移除标签 ' + tag} onClick={() => removeTag(tag)}>×</button>
            </span>
          ))}
          <label className="wb-snote-tag-input" title="输入标签后回车（支持中文）">
            <input value={tagInput} placeholder="＋ 标签" list={'hana-tag-list-' + note.id} maxLength={30}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} />
          </label>
          <datalist id={'hana-tag-list-' + note.id}>{allTags.map(tag => <option key={tag} value={tag} />)}</datalist>
        </div>
      </div>

      {/* P6：结构化证据卡（问题/方法/局限/章节，保存后进入证据矩阵/建任务/论证链） */}
      <div className="wb-snote-evidence">
        <button type="button" className="wb-snote-evidence-toggle" aria-expanded={showEvidence}
          onClick={() => setShowEvidence(v => !v)}>
          结构化证据 <i></i>
          {note.evidence && Object.keys(note.evidence).length ? <em className="wb-snote-evidence-dot" title="已填写">●</em> : null}
        </button>
        {showEvidence && (
          <div className="wb-snote-evidence-grid">
            {!evidenceCapable && (
              <p className="wb-snote-evidence-hint"><IconStale size={11} /> 结构化证据已部署为只读预览，重启宿主后可保存（避免旧宿主静默丢弃写入）。</p>
            )}
            <label><span>研究问题 / 论点</span>
              <input value={evidence.question || ''} disabled={!evidenceCapable} maxLength={200}
                placeholder="这条摘录回答哪个研究问题或论证哪个论点？"
                onChange={(e) => setEvidenceField('question', e.target.value)} />
            </label>
            <label><span>方法 / 样本</span>
              <input value={evidence.method || ''} disabled={!evidenceCapable} maxLength={200}
                placeholder="研究设计、样本量、测量等"
                onChange={(e) => setEvidenceField('method', e.target.value)} />
            </label>
            <label><span>局限</span>
              <input value={evidence.limitation || ''} disabled={!evidenceCapable} maxLength={200}
                placeholder="样本/方法/结论的局限或注意点"
                onChange={(e) => setEvidenceField('limitation', e.target.value)} />
            </label>
            <label><span>可用于章节</span>
              <input value={evidence.section || ''} disabled={!evidenceCapable} maxLength={80}
                placeholder="如：方法 · 样本 或 讨论 · 局限"
                onChange={(e) => setEvidenceField('section', e.target.value)} />
            </label>
          </div>
        )}
      </div>
      </div>}

      {note.saveFailed && (
        <p className="wb-snote-savefail">
          <IconAlert size={12} /> 保存失败：{note.saveError || '网络异常'}
          <button type="button" className="wb-mini-btn" onClick={() => onRetryDraft(note)}>重试</button>
        </p>
      )}
      {note.annotationDeleted && !note.saveFailed && (
        <p className="wb-snote-stale-hint"><IconStale size={12} /> 原文定位已失效（摘录与笔记已保留）</p>
      )}
    </article>
  );
}

/** 汇总笔记视图：Tiptap 编辑器 + 分类/标签 + 引文条。 */
function SummaryTab({ noteDoc, citations, editorRef, onChange, onSummaryMeta, onJumpCitation, categories, tagColors, allTags }) {
  const category = noteDoc?.categoryId ? categories.find(c => c.id === noteDoc.categoryId) : null;
  const [tagInput, setTagInput] = useState('');
  const tags = noteDoc?.tags || [];
  const addTag = (raw) => {
    const tag = String(raw || '').trim().replace(/^#/, '').slice(0, 30);
    if (!tag || tags.includes(tag)) { setTagInput(''); return; }
    setTagInput('');
    onSummaryMeta({ tags: [...tags, tag].slice(0, 8) });
  };
  const removeTag = (tag) => onSummaryMeta({ tags: tags.filter(t => t !== tag) });
  return (
    <div className="wb-summary-tab">
      <details className="wb-summary-organize">
        <summary>整理信息{(category || tags.length) ? <em>已填写</em> : null}</summary>
      <div className="wb-summary-meta">
        <select className="wb-snote-category" value={noteDoc?.categoryId || ''} title="汇总笔记分类" aria-label="汇总笔记分类"
          onChange={(e) => onSummaryMeta({ categoryId: e.target.value || null })}>
          <option value="">未分类</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="wb-snote-tags">
          {tags.map(tag => (
            <span key={tag} className="wb-snote-tag" title={tag} style={tagColors[tag] ? { borderColor: tagColors[tag], color: tagColors[tag] } : undefined}>
              {tag}
              <button type="button" title={'移除标签 ' + tag} aria-label={'移除标签 ' + tag} onClick={() => removeTag(tag)}>×</button>
            </span>
          ))}
          <label className="wb-snote-tag-input" title="输入标签后回车（支持中文）">
            <input value={tagInput} placeholder="＋ 标签" list="hana-tag-list-summary" maxLength={30}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} />
          </label>
          <datalist id="hana-tag-list-summary">{allTags.map(tag => <option key={tag} value={tag} />)}</datalist>
        </div>
      </div>
      </details>
      <NoteEditor
        initialJson={noteDoc?.tiptapJson}
        onChange={onChange}
        editorRef={editorRef}
      />
      {citations.length > 0 && (
        <footer className="wb-citation-strip">
          <span>引文（{citations.length}）</span>
          {citations.map(c => (
            <button key={c.id} type="button" className={'wb-cite-chip' + (c.annotationDeleted ? ' stale' : '')}
              title={'第 ' + c.pageNumber + ' 页：' + c.quotedText.slice(0, 40)}
              onClick={() => onJumpCitation?.(c)}>
              {c.annotationDeleted ? <IconStale size={11} /> : <IconLocate size={11} />}
              第 {c.pageNumber} 页
            </button>
          ))}
        </footer>
      )}
    </div>
  );
}

/** AI 解释弹层。 */
function ExplainPopover({ box, onClose, onRetry }) {
  return (
    <div className="wb-explain" style={{ left: box.anchor?.origin?.x ?? 200, top: (box.anchor?.origin?.y ?? 300) + 40 }}>
      <header>
        <strong><IconSpark size={12} /> AI 解释</strong>
        <button type="button" title="关闭" onClick={onClose}>×</button>
      </header>
      <div className="wb-explain-body">
        {box.status === 'loading' && <p className="wb-empty">正在调用宿主模型…</p>}
        {box.status === 'done' && <p>{box.result}</p>}
        {box.status === 'error' && (
          <p className="wb-error-text">{box.result}<br /><button type="button" className="wb-mini-btn" onClick={onRetry}>重试</button></p>
        )}
      </div>
    </div>
  );
}
