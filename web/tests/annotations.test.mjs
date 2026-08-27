import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { buildMarkupAnnotation, markupKind, toEngineTransferItems, toStorageTransferItems } from '../src/annotations.js';

const rect = (x, y, width, height) => ({ origin: { x, y }, size: { width, height } });

test('buildMarkupAnnotation creates a complete EmbedPDF 2.x highlight', () => {
  const annotation = buildMarkupAnnotation({
    id: 'a1', kind: 'highlight', text: '证据', color: '#FFD54F', opacity: 0.45, pageIndex: 2,
    formatted: [{ pageIndex: 2, rect: rect(10, 20, 80, 14), segmentRects: [rect(10, 20, 80, 14)] }],
  });
  assert.equal(annotation.type, PdfAnnotationSubtype.HIGHLIGHT);
  assert.equal(annotation.pageIndex, 2);
  assert.deepEqual(annotation.rect, rect(10, 20, 80, 14));
  assert.equal(annotation.segmentRects.length, 1);
});

test('buildMarkupAnnotation maps underline and rejects missing geometry', () => {
  const annotation = buildMarkupAnnotation({
    id: 'a2', kind: 'underline', text: '方法', color: '#7FB3E8', opacity: 0.45, pageIndex: 0,
    formatted: [{ pageIndex: 0, rect: rect(1, 2, 30, 8), segmentRects: [rect(1, 2, 30, 8)] }],
  });
  assert.equal(annotation.type, PdfAnnotationSubtype.UNDERLINE);
  assert.equal(markupKind(annotation.type), 'underline');
  assert.equal(buildMarkupAnnotation({ id: 'bad', kind: 'highlight', pageIndex: 0, formatted: [] }), null);
});

test('buildMarkupAnnotation only uses geometry from the requested page', () => {
  const annotation = buildMarkupAnnotation({
    id: 'a3', kind: 'strikeout', pageIndex: 1, color: '#E39A9A', opacity: 0.45,
    formatted: [
      { pageIndex: 0, rect: rect(1, 1, 10, 10), segmentRects: [rect(1, 1, 10, 10)] },
      { pageIndex: 1, rect: rect(8, 8, 22, 9), segmentRects: [rect(8, 8, 22, 9)] },
    ],
  });
  assert.equal(annotation.type, PdfAnnotationSubtype.STRIKEOUT);
  assert.deepEqual(annotation.segmentRects, [rect(8, 8, 22, 9)]);
});

test('annotation transfer adapters preserve storage strings and restore engine geometry', () => {
  const stored = [{ pageIndex: 3, annotation: {
    id: 'saved', type: 'highlight', contents: '摘录', segmentRects: [rect(4, 5, 20, 8)], opacity: 0.4,
  } }];
  const [engineItem] = toEngineTransferItems(stored);
  assert.equal(engineItem.annotation.type, PdfAnnotationSubtype.HIGHLIGHT);
  assert.equal(engineItem.annotation.pageIndex, 3);
  assert.deepEqual(engineItem.annotation.rect, rect(4, 5, 20, 8));
  const [roundtrip] = toStorageTransferItems([engineItem]);
  assert.equal(roundtrip.annotation.type, 'highlight');
});
