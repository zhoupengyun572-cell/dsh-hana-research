// 服务层：API 客户端、PDF 资源（Blob URL）管理、防抖保存队列（进度/批注/笔记）。

const API_BASE = '/api/hana-research';

export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    let message = '请求失败（' + response.status + '）';
    let code = '';
    try {
      const body = await response.json();
      message = body.message || message;
      code = body.error || '';
    } catch { /* ignore */ }
    throw new ApiError(message, response.status, code);
  }
  return response.json();
}

// ── PDF 资源（Blob URL 生命周期管理） ─────────────────────

/** 受控加载附件 PDF → Blob URL；返回 { url, dispose }。 */
export async function loadPdfBlobUrl(attachmentId) {
  const response = await fetch(`${API_BASE}/attachments/${encodeURIComponent(attachmentId)}/file`);
  if (!response.ok) {
    throw new ApiError('PDF 加载失败（' + response.status + '）', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  return {
    url,
    dispose() {
      URL.revokeObjectURL(url);
    },
  };
}

// ── 数据接口 ────────────────────────────────────────────

export const repositories = {
  getReadingState(paperId) {
    return api('/papers/' + encodeURIComponent(paperId) + '/reading-state');
  },
  putReadingState(paperId, state) {
    return api('/papers/' + encodeURIComponent(paperId) + '/reading-state', {
      method: 'PUT', body: JSON.stringify(state),
    });
  },
  getNoteDocument(paperId) {
    return api('/papers/' + encodeURIComponent(paperId) + '/note-document');
  },
  putNoteDocument(paperId, document) {
    return api('/papers/' + encodeURIComponent(paperId) + '/note-document', {
      method: 'PUT', body: JSON.stringify(document),
    });
  },
  listCitations(noteDocumentId) {
    return api('/note-documents/' + encodeURIComponent(noteDocumentId) + '/citations');
  },
  addCitation(noteDocumentId, citation) {
    return api('/note-documents/' + encodeURIComponent(noteDocumentId) + '/citations', {
      method: 'POST', body: JSON.stringify(citation),
    });
  },
  updateCitation(citationId, patch) {
    return api('/citations/' + encodeURIComponent(citationId), {
      method: 'PATCH', body: JSON.stringify(patch),
    });
  },
  deleteCitation(citationId) {
    return api('/citations/' + encodeURIComponent(citationId), { method: 'DELETE' });
  },
  getAnnotations(attachmentId) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/annotations-v2');
  },
  putAnnotations(attachmentId, items) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/annotations-v2', {
      method: 'PUT', body: JSON.stringify({ items }),
    });
  },
  convertLegacyAnnotations(attachmentId, pageSizes) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/annotations/convert-legacy', {
      method: 'POST', body: JSON.stringify({ pageSizes }),
    });
  },
  explainSelection(attachmentId, annotationId, text, context) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/annotations/' + encodeURIComponent(annotationId) + '/explain', {
      method: 'POST', body: JSON.stringify({ text, context }),
    });
  },
  addHighlightNote(attachmentId, payload) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/highlight-note', {
      method: 'POST', body: JSON.stringify(payload),
    });
  },
  // ── v13：逐句笔记 / 分类 / 标签颜色 ──
  listTags(projectId = '') {
    const qs = projectId ? '?projectId=' + encodeURIComponent(projectId) : '';
    return api('/notes/tags' + qs);
  },
  renameTag(oldTag, newTag) {
    return api('/notes/tags/rename', { method: 'POST', body: JSON.stringify({ oldTag, newTag }) });
  },
  removeTag(tag) {
    return api('/notes/tags/remove', { method: 'POST', body: JSON.stringify({ tag }) });
  },
  listSentenceNotes(paperId, filters = {}) {
    const qs = new URLSearchParams();
    for (const key of ['q', 'category', 'tag', 'status', 'sort', 'attachmentId']) {
      if (filters[key]) qs.set(key, filters[key]);
    }
    if (filters.starred) qs.set('starred', '1');
    const suffix = qs.toString() ? '?' + qs.toString() : '';
    return api('/papers/' + encodeURIComponent(paperId) + '/sentence-notes' + suffix);
  },
  createSentenceNote(paperId, payload) {
    return api('/papers/' + encodeURIComponent(paperId) + '/sentence-notes', {
      method: 'POST', body: JSON.stringify(payload),
    });
  },
  updateSentenceNote(noteId, patch) {
    return api('/sentence-notes/' + encodeURIComponent(noteId), {
      method: 'PATCH', body: JSON.stringify(patch),
    });
  },
  deleteSentenceNote(noteId) {
    return api('/sentence-notes/' + encodeURIComponent(noteId), { method: 'DELETE' });
  },
  relocateSentenceNote(noteId, annotationId) {
    return api('/sentence-notes/' + encodeURIComponent(noteId) + '/relocate', {
      method: 'POST', body: JSON.stringify({ annotationId }),
    });
  },
  listNoteCategories() {
    return api('/note-categories');
  },
  createNoteCategory(payload) {
    return api('/note-categories', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateNoteCategory(categoryId, patch) {
    return api('/note-categories/' + encodeURIComponent(categoryId), {
      method: 'PATCH', body: JSON.stringify(patch),
    });
  },
  deleteNoteCategory(categoryId) {
    return api('/note-categories/' + encodeURIComponent(categoryId), { method: 'DELETE' });
  },
  saveTagColor(tag, color) {
    return api('/notes/tags/color', { method: 'PUT', body: JSON.stringify({ tag, color }) });
  },
  // ── P6：宿主能力探测 + 跨视图写操作（研究驾驶舱 / 证据卡闭环） ──
  getCapabilities() {
    return api('/capabilities');
  },
  createProjectNote(projectId, payload) {
    return api('/projects/' + encodeURIComponent(projectId) + '/notes', {
      method: 'POST', body: JSON.stringify(payload),
    });
  },
  getCockpitStats(projectId) {
    return api('/projects/' + encodeURIComponent(projectId) + '/cockpit-stats');
  },
  putProgress(attachmentId, pageNumber) {
    return api('/attachments/' + encodeURIComponent(attachmentId) + '/progress', {
      method: 'PUT', body: JSON.stringify({ pageNumber }),
    }).catch(() => null);
  },
};

// ── 防抖保存队列 ────────────────────────────────────────

/**
 * 通用防抖保存器：debounce 后串行 flush；失败保留数据并回调（可重试）。
 * 状态机：idle → pending → saving → saved | error
 */
export function createSaveQueue({ debounceMs = 600, flush, onStatus }) {
  let timer = null;
  let dirty = false;
  let saving = false;
  let pendingPayload = null;
  let status = 'idle';
  let lastError = null;

  const setStatus = (next) => {
    status = next;
    onStatus?.(next, lastError);
  };

  const schedule = (payload) => {
    pendingPayload = payload;
    dirty = true;
    setStatus('pending');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flushNow(); }, debounceMs);
  };

  const flushNow = async () => {
    if (!dirty || saving) return;
    if (timer) { clearTimeout(timer); timer = null; }
    dirty = false;
    saving = true;
    setStatus('saving');
    try {
      await flush(pendingPayload);
      pendingPayload = null;
      lastError = null;
      setStatus('saved');
    } catch (error) {
      dirty = true; // 保留待保存数据，等待重试
      lastError = error;
      setStatus('error');
    } finally {
      saving = false;
    }
  };

  /** 立即冲刷（退出前调用，可等待）。 */
  const flushImmediately = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty && !saving) return true;
    dirty = false;
    saving = true;
    setStatus('saving');
    try {
      await flush(pendingPayload);
      pendingPayload = null;
      lastError = null;
      setStatus('saved');
      return true;
    } catch (error) {
      dirty = true;
      lastError = error;
      setStatus('error');
      return false;
    } finally {
      saving = false;
    }
  };

  return {
    schedule,
    flushNow,
    flushImmediately,
    getStatus: () => status,
    getError: () => lastError,
    retry: () => { if (status === 'error') { void flushNow(); } },
  };
}

/** 页面卸载时提示未保存内容。 */
export function installBeforeUnloadGuard(hasDirty) {
  const handler = (event) => {
    if (hasDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
