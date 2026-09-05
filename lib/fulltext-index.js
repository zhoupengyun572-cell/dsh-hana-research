/**
 * HanaResearch 全文检索（schema v21）。
 *
 * - 服务端用 vendored pdf.js 逐页提取 PDF 文本，写入 SQLite FTS5 虚表 `papers_fts`；
 * - 索引只含本地附件内容，任何检索与提取都不外发；
 * - unicode61 不切分 CJK，这里在索引与查询两侧对 CJK 字符做逐字切分（unigram），
 *   短语引号保证「正念」等词的相邻匹配；拉丁词保持原样；
 * - 后台任务跟随 v43 翻译队列模式：1 并发、按附件去重、失败落状态可重试。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_PATH = path.join(HERE, '..', 'assets', 'vendor', 'pdfjs.mjs');

const MAX_PAGES = 400;
const MAX_CHARS_PER_PAGE = 20_000;
const FULLTEXT_MAX_CONCURRENT = 1;

const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_GLOBAL = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/gu;
const CJK_TRAILING_SPACE = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]) (?=[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/gu;

export const FULLTEXT_STATUSES = ['pending', 'ready', 'empty', 'failed'];

/** 索引侧 CJK 切分：每个 CJK 字符后补一个空格，让 unicode61 按字建 token。 */
export function segmentCjk(text) {
  return String(text || '').replace(CJK_GLOBAL, '$1 ');
}

/** 展示侧还原：去掉索引时注入的 CJK 字间空格（不影响高亮标记与拉丁词）。 */
export function restoreCjkSpacing(text) {
  return String(text || '').replace(CJK_TRAILING_SPACE, '$1');
}

/**
 * 把用户查询转换为 FTS5 MATCH 表达式：
 * 按空白拆词，各词独立成引号短语（词间 AND），CJK 词内部逐字切分。
 * 例如 `正念 干预 mindfulness` → `"正 念" "干 预" "mindfulness"`。
 */
export function buildMatchQuery(query) {
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!terms.length) return null;
  const phrases = terms.map(term => {
    const tokens = segmentCjk(term).trim().split(/\s+/).join(' ');
    return `"${tokens.replace(/"/g, '""')}"`;
  });
  const joined = phrases.join(' ').trim();
  return joined || null;
}

/**
 * 用 vendored pdf.js 逐页提取文本。
 * @returns {Promise<{ pageCount: number, textPages: Array<{page:number, text:string}>, truncated: boolean }>}
 */
export async function extractPages(pdfjs, pdfData) {
  const loadingTask = pdfjs.getDocument({ data: pdfData, disableFontFace: true });
  let pdf = null;
  try {
    pdf = await loadingTask.promise;
    const pageCount = Number(pdf.numPages || 0);
    const limit = Math.min(pageCount, MAX_PAGES);
    const textPages = [];
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = (content.items || [])
        .map(item => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) textPages.push({ page: pageNumber, text: text.slice(0, MAX_CHARS_PER_PAGE) });
    }
    return { pageCount, textPages, truncated: pageCount > MAX_PAGES };
  } finally {
    try { await loadingTask.destroy(); } catch { /* 释放失败不影响索引结果 */ }
  }
}

/** 索引单个附件：提取 → 整体替换该附件的 FTS 行 → 落状态。 */
export async function indexAttachment(store, attachmentId) {
  const attachment = store.getAttachment(attachmentId);
  if (!attachment) throw new FulltextIndexError('FULLTEXT_ATTACHMENT_NOT_FOUND', '附件不存在', 404);
  if (!attachment.absolutePath || !fs.existsSync(attachment.absolutePath)) {
    store.markAttachmentFulltextFailed(attachmentId, 'PDF 文件不存在');
    return { status: 'failed', error: 'PDF 文件不存在' };
  }
  try {
    const pdfjs = await import(pathToFileURL(PDFJS_PATH).href);
    const pdfData = new Uint8Array(fs.readFileSync(attachment.absolutePath));
    const { textPages } = await extractPages(pdfjs, pdfData);
    const pages = textPages.map(item => ({ page: item.page, text: segmentCjk(item.text) }));
    store.replaceAttachmentFulltext({ attachmentId, paperId: attachment.paperId, pages });
    return { status: pages.length ? 'ready' : 'empty', pageCount: pages.length };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 300);
    store.markAttachmentFulltextFailed(attachmentId, message);
    return { status: 'failed', error: message };
  }
}

export class FulltextIndexError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'FulltextIndexError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ── 后台串行队列（1 并发，按附件去重；跟随翻译队列模式） ──

const fulltextQueue = [];
const fulltextQueuedAttachments = new Set();
let fulltextRunning = 0;

export function queueFulltextIndex(ctx, store, attachmentId) {
  const id = String(attachmentId || '');
  if (!id || fulltextQueuedAttachments.has(id)) return false;
  fulltextQueuedAttachments.add(id);
  fulltextQueue.push({ attachmentId: id });
  pumpFulltextQueue(ctx, store);
  return true;
}

function pumpFulltextQueue(ctx, store) {
  while (fulltextRunning < FULLTEXT_MAX_CONCURRENT && fulltextQueue.length) {
    const task = fulltextQueue.shift();
    fulltextRunning += 1;
    runFulltextIndexTask(ctx, store, task).finally(() => {
      fulltextQueuedAttachments.delete(task.attachmentId);
      fulltextRunning -= 1;
      pumpFulltextQueue(ctx, store);
    });
  }
}

async function runFulltextIndexTask(ctx, store, { attachmentId }) {
  try {
    await indexAttachment(store, attachmentId);
  } catch (error) {
    ctx?.logger?.error?.('hana-research fulltext index %s failed: %s', attachmentId, error?.stack || error);
    try {
      if (error?.code === 'FULLTEXT_ATTACHMENT_NOT_FOUND') return;
      store.markAttachmentFulltextFailed(attachmentId, error?.message || '索引失败');
    } catch { /* 状态写失败不中断队列 */ }
  }
}

/**
 * 重建全库索引：把待索引附件按串行队列分批入队。
 * @returns {{ queued: number, status: object }}
 */
export function rebuildFulltextIndex(ctx, store, { force = false, limit = 500 } = {}) {
  const statuses = force ? ['pending', 'ready', 'empty', 'failed'] : ['pending', 'failed'];
  const attachments = store.listAttachmentsForFulltextIndex({ statuses, limit });
  let queued = 0;
  for (const attachment of attachments) {
    if (queueFulltextIndex(ctx, store, attachment.id)) queued += 1;
  }
  return { queued, status: store.fulltextIndexStatus() };
}
