// v12 阅读工作区：批注迁移与序列化（纯函数，无 IO，便于单测）。
// 职责：
//  - 旧自研高亮（payload: 百分比 rects + color + quote）→ EmbedPDF 标准 PDF 批注对象
//  - EmbedPDF AnnotationTransferItem[] 与数据库 JSON 之间的序列化/反序列化/校验
//  - 旧 kind → 新 subtype 映射

/** 旧批注 kind → EmbedPDF 批注子类型（PDF 标准 /Subtype）。 */
export function subtypeFromKind(kind) {
  switch (String(kind || '').toLowerCase()) {
    case 'highlight': return 'highlight';
    case 'area': return 'square';
    default: return 'highlight';
  }
}

/** 旧百分比 rect {x,y,width,height}（左上原点）→ EmbedPDF Rect（PDF 坐标，左下原点）。
 *  y 轴翻转：pdfY = pageHeight - (y + height) * pageHeight。 */
export function percentRectToPdfRect(rect, pageWidth, pageHeight) {
  const x = Math.max(0, Math.min(1, Number(rect.x) || 0));
  const y = Math.max(0, Math.min(1, Number(rect.y) || 0));
  const w = Math.max(0, Math.min(1, Number(rect.width) || 0));
  const h = Math.max(0, Math.min(1, Number(rect.height) || 0));
  return {
    origin: { x: x * pageWidth, y: (1 - y - h) * pageHeight },
    size: { width: w * pageWidth, height: h * pageHeight },
  };
}

/** 颜色清洗：#rgb/#rrggbb → '#rrggbb'；非法值回退默认色。 */
export function normalizeColor(color, fallback = '#FFFF98') {
  const raw = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return '#' + raw.slice(1).split('').map(c => c + c).join('');
  }
  if (/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.test(raw)) {
    const hex = raw.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
    return '#' + hex;
  }
  return fallback;
}

/**
 * 旧高亮批注 → EmbedPDF PdfHighlightAnnoObject（不含 id：id 由插件分配）。
 * @param {object} legacy { payload: { rects, color, quote }, pageNumber }
 * @param {number} pageWidth  页面 PDF 宽（pt）
 * @param {number} pageHeight 页面 PDF 高（pt）
 */
export function legacyAnnotationToEmbedPdf(legacy, pageWidth, pageHeight) {
  const payload = legacy?.payload || {};
  const rects = Array.isArray(payload.rects) ? payload.rects : [];
  const color = normalizeColor(payload.color || payload.strokeColor, '#FFFF98');
  return {
    type: 'highlight',
    contents: String(payload.quote || legacy?.quote || ''),
    strokeColor: color,
    opacity: 0.45,
    segmentRects: rects
      .map(r => percentRectToPdfRect(r, pageWidth, pageHeight))
      .filter(r => r.size.width > 0.5 && r.size.height > 0.5),
  };
}

/** 校验一个 EmbedPDF 批注对象的最小结构（subtype 合法 + segmentRects/rect 存在）。 */
export function isValidEmbedPdfAnnotation(annotation) {
  if (!annotation || typeof annotation !== 'object') return false;
  const type = String(annotation.type || '');
  const valid = ['highlight', 'underline', 'strikeout', 'text', 'note', 'ink', 'square', 'circle', 'line', 'freeText', 'squiggly'];
  if (!valid.includes(type)) return false;
  if (type === 'highlight' || type === 'underline' || type === 'strikeout' || type === 'squiggly') {
    return Array.isArray(annotation.segmentRects) && annotation.segmentRects.length > 0;
  }
  return Boolean(annotation.rect) || Array.isArray(annotation.inkList);
}

/** 数据库行 → API 批注视图（兼容旧 payload 与新 embed 数据）。 */
export function annotationRowToView(row) {
  let embedPdf = null;
  try {
    embedPdf = row.embed_pdf_data ? JSON.parse(row.embed_pdf_data) : null;
  } catch {
    embedPdf = null;
  }
  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    attachmentId: row.attachment_id,
    pageNumber: row.page_number,
    kind: row.kind,
    subtype: row.subtype || subtypeFromKind(row.kind),
    payload,
    embedPdf,
    migrated: Boolean(embedPdf),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** EmbedPDF AnnotationTransferItem[] → 可持久化行数组（校验 + 提取 subtype/page/摘要文本）。
 *  注意：pageIndex 位于 item.annotation.pageIndex（PdfAnnotationObjectBase），transfer 外层无此字段。 */
export function transferItemsToRows(attachmentId, items) {
  if (!Array.isArray(items)) throw new Error('批注列表格式无效');
  const rows = [];
  for (const item of items) {
    const annotation = item?.annotation;
    if (!isValidEmbedPdfAnnotation(annotation)) continue;
    const pageIndex = typeof annotation.pageIndex === 'number'
      ? annotation.pageIndex
      : (typeof item?.pageIndex === 'number' ? item.pageIndex : null);
    if (pageIndex === null) continue; // 无页码定位的批注无法持久化：跳过并交由上层报告
    rows.push({
      attachmentId,
      subtype: String(annotation.type),
      embedPdf: item,
      pageNumber: pageIndex + 1,
      selectedText: extractSelectedText(annotation),
    });
  }
  return rows;
}

/** 从批注对象提取可检索文本（高亮类=contents；便签=contents；自由文本=contents）。 */
export function extractSelectedText(annotation) {
  if (!annotation) return '';
  const text = String(annotation.contents || annotation.content || '').trim();
  if (text) return text.slice(0, 5000);
  return '';
}

/** 引文跳转定位描述（存数据库，前端据此调用 selection.setSelection / 页面导航）。 */
export function citationLocation(annotation, pageNumber) {
  return {
    pageNumber: Number(pageNumber) || 1,
    hasAnnotation: Boolean(annotation),
  };
}

/** 序列化批注对象数组（防循环引用、防 undefined）。 */
export function serializeAnnotations(items) {
  return JSON.stringify(items == null ? [] : items);
}

/** 反序列化并校验批注对象数组。 */
export function deserializeAnnotations(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item === 'object' && item.annotation);
  } catch {
    return [];
  }
}
