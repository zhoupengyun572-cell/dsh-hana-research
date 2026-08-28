/**
 * 全文翻译任务：提取 PDF 全文 → 段落分块 → 串行 AI 翻译 → 生成 Markdown 译文文档。
 *
 * - 进度写入 translation_docs 表（running/done/failed + 分块进度），可轮询；
 * - 段级译文缓存：中断/失败后重试不重复消耗模型额度；
 * - 译文文档原子写入 library/projects/<projectId>/translations/；
 * - pdfjs 由调用方传入（本插件 assets/vendor/pdfjs.mjs），便于测试注入桩；
 * - 模型经宿主 llm（agentDefaultModel 选中项）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { splitIntoChunks, translateChunk, cachedTranslation, storeTranslationCache, TranslationError } from './translation.js';

const CHUNK_MAX_CHARS = 1600;

/** 从 PDF.js 文档对象逐页提取纯文本（页间以空行分隔）。 */
export async function extractPdfText(pdf) {
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = (content.items || [])
      .map(item => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(text);
  }
  return pageTexts.filter(Boolean).join('\n\n');
}

function safeTranslationFileName(title, docId) {
  const clean = String(title || '文献')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, 60)
    .trim() || '文献';
  return `${clean}-译文-${String(docId).slice(0, 8)}.md`;
}

function renderTranslationMarkdown({ doc, parts, charCount, model }) {
  const lines = [
    `# ${doc.paperTitle || '文献翻译'}（译文）`,
    '',
    `> 由 HanaResearch 自动生成 · 模型 ${model || '宿主模型'} · ${new Date().toISOString()}`,
    `> 原文语言 ${doc.sourceLang} → 目标语言 ${doc.targetLang} · 共 ${charCount} 字符`,
    '',
    '---',
    '',
  ];
  parts.forEach((part, index) => {
    lines.push(`<!-- 段落 ${index + 1} -->`, part, '');
  });
  return lines.join('\n');
}

/**
 * 执行一次全文翻译任务（宿主模型）。
 * @param {{ store: object, llm: object, selection: {provider:string, model:string}, pdfjs: object, pdfData: Uint8Array, docId: string,
 *           config: object, sourceLang?: string, targetLang?: string }} opts
 */
export async function translateDocument({ store, llm, selection, pdfjs, pdfData, docId, config, sourceLang = 'en', targetLang = 'zh' }) {
  const doc = store.getTranslationDoc(docId);
  if (!doc) throw new TranslationError('TRANSLATION_DOC_NOT_FOUND', '译文任务不存在', 404);
  const model = selection?.model || null;
  store.updateTranslationDoc(docId, { status: 'running', progressDone: 0, progressTotal: 0, model });

  let pdf = null;
  try {
    const loadingTask = pdfjs.getDocument({ data: pdfData, disableFontFace: true });
    pdf = await loadingTask.promise;
    const fullText = await extractPdfText(pdf);
    if (!fullText.trim()) {
      throw new TranslationError('TRANSLATE_NO_TEXT', '未能从 PDF 提取到文本（可能是扫描版，需 OCR）', 422);
    }
    const chunks = splitIntoChunks(fullText, CHUNK_MAX_CHARS);
    if (!chunks.length) {
      throw new TranslationError('TRANSLATE_NO_TEXT', '未能从 PDF 提取到可翻译的文本', 422);
    }
    store.updateTranslationDoc(docId, { status: 'running', progressTotal: chunks.length });

    const parts = [];
    let charCount = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      let translated;
      const cached = cachedTranslation(store.dataDir, chunk);
      if (cached.hit) {
        translated = cached.translated;
      } else {
        translated = await translateChunk({ llm, selection, text: chunk, sourceLang, targetLang });
        storeTranslationCache(store.dataDir, cached.key, translated);
      }
      parts.push(translated);
      charCount += chunk.length;
      store.updateTranslationDoc(docId, { progressDone: index + 1 });
    }

    const markdown = renderTranslationMarkdown({ doc, parts, charCount, model });
    const fileName = safeTranslationFileName(doc.paperTitle, doc.id);
    const dir = store.translationFileDir(doc.projectId);
    fs.mkdirSync(dir, { recursive: true });
    const absolutePath = path.join(dir, fileName);
    const relativePath = path.relative(store.dataDir, absolutePath).replace(/\\/g, '/');
    const tempPath = `${absolutePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, markdown, 'utf8');
    fs.renameSync(tempPath, absolutePath);

    return store.updateTranslationDoc(docId, {
      status: 'done',
      progressDone: chunks.length,
      fileName,
      relativePath,
      charCount,
      model,
    });
  } catch (error) {
    const message = error?.message || '翻译失败';
    store.updateTranslationDoc(docId, { status: 'failed', error: message.slice(0, 1000) });
    throw error;
  } finally {
    try {
      pdf?.destroy?.();
    } catch {
      /* 忽略销毁错误 */
    }
  }
}
