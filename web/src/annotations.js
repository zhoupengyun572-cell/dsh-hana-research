import { PdfAnnotationSubtype } from '@embedpdf/models';

const ANNOTATION_TYPES = {
  text: PdfAnnotationSubtype.TEXT,
  note: PdfAnnotationSubtype.TEXT,
  freeText: PdfAnnotationSubtype.FREETEXT,
  line: PdfAnnotationSubtype.LINE,
  square: PdfAnnotationSubtype.SQUARE,
  circle: PdfAnnotationSubtype.CIRCLE,
  highlight: PdfAnnotationSubtype.HIGHLIGHT,
  underline: PdfAnnotationSubtype.UNDERLINE,
  squiggly: PdfAnnotationSubtype.SQUIGGLY,
  strikeout: PdfAnnotationSubtype.STRIKEOUT,
  ink: PdfAnnotationSubtype.INK,
};

const ANNOTATION_NAMES = {
  [PdfAnnotationSubtype.TEXT]: 'text',
  [PdfAnnotationSubtype.FREETEXT]: 'freeText',
  [PdfAnnotationSubtype.LINE]: 'line',
  [PdfAnnotationSubtype.SQUARE]: 'square',
  [PdfAnnotationSubtype.CIRCLE]: 'circle',
  [PdfAnnotationSubtype.HIGHLIGHT]: 'highlight',
  [PdfAnnotationSubtype.UNDERLINE]: 'underline',
  [PdfAnnotationSubtype.SQUIGGLY]: 'squiggly',
  [PdfAnnotationSubtype.STRIKEOUT]: 'strikeout',
  [PdfAnnotationSubtype.INK]: 'ink',
};

function isRect(rect) {
  return rect
    && Number.isFinite(rect.origin?.x)
    && Number.isFinite(rect.origin?.y)
    && Number.isFinite(rect.size?.width)
    && Number.isFinite(rect.size?.height)
    && rect.size.width > 0
    && rect.size.height > 0;
}

function boundsOf(rects) {
  const valid = rects.filter(isRect);
  if (!valid.length) return null;
  const left = Math.min(...valid.map(rect => rect.origin.x));
  const top = Math.min(...valid.map(rect => rect.origin.y));
  const right = Math.max(...valid.map(rect => rect.origin.x + rect.size.width));
  const bottom = Math.max(...valid.map(rect => rect.origin.y + rect.size.height));
  return { origin: { x: left, y: top }, size: { width: right - left, height: bottom - top } };
}

/** Build the complete EmbedPDF 2.x text-markup object for one PDF page. */
export function buildMarkupAnnotation({ id, kind, text, color, opacity, pageIndex, formatted }) {
  const type = ANNOTATION_TYPES[kind];
  if (!Number.isInteger(type) || !Number.isInteger(pageIndex) || pageIndex < 0) return null;
  const pageSelection = (Array.isArray(formatted) ? formatted : []).find(item => item?.pageIndex === pageIndex);
  const segmentRects = (pageSelection?.segmentRects || []).filter(isRect);
  const rect = isRect(pageSelection?.rect) ? pageSelection.rect : boundsOf(segmentRects);
  if (!rect || !segmentRects.length) return null;
  return {
    id,
    type,
    pageIndex,
    rect,
    contents: String(text || ''),
    strokeColor: color,
    opacity,
    segmentRects,
  };
}

export function markupKind(type) {
  return ANNOTATION_NAMES[type] || type;
}

/** Convert persisted string subtypes into the numeric EmbedPDF 2.x model. */
export function toEngineTransferItems(items) {
  return (Array.isArray(items) ? items : []).map(item => {
    const source = item?.annotation;
    if (!source) return item;
    const type = typeof source.type === 'number' ? source.type : ANNOTATION_TYPES[source.type];
    if (!Number.isInteger(type)) return item;
    const pageIndex = Number.isInteger(source.pageIndex) ? source.pageIndex : (Number.isInteger(item.pageIndex) ? item.pageIndex : 0);
    const segmentRects = Array.isArray(source.segmentRects) ? source.segmentRects.filter(isRect) : [];
    const rect = isRect(source.rect) ? source.rect : boundsOf(segmentRects);
    return {
      ...item,
      pageIndex,
      annotation: { ...source, type, pageIndex, ...(rect ? { rect } : {}) },
    };
  });
}

/** Keep the existing storage/API contract stable while the engine uses numeric enums. */
export function toStorageTransferItems(items) {
  return (Array.isArray(items) ? items : []).map(item => {
    const source = item?.annotation;
    if (!source) return item;
    return { ...item, annotation: { ...source, type: markupKind(source.type) } };
  });
}
