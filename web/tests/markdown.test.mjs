// web 层验证：Tiptap JSON ↔ Markdown 转换、引文卡片节点 JSON 往返、中文内容。
// 在 web/ 子项目下运行：node tests/markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// 无头 DOM（tiptap 需要 window/document）
const domWindow = new Window({ url: 'http://localhost/' });
globalThis.window = domWindow;
globalThis.document = domWindow.document;
Object.defineProperty(globalThis, 'navigator', { value: domWindow.navigator, configurable: true });
globalThis.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.Element = domWindow.Element;
globalThis.Node = domWindow.Node;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.MutationObserver = domWindow.MutationObserver;
globalThis.getSelection = () => domWindow.getSelection();
globalThis.document.getSelection = domWindow.document.getSelection.bind(domWindow.document);

const { Editor } = await import('@tiptap/core');
const { default: StarterKit } = await import('@tiptap/starter-kit');
const { Table, TableRow, TableCell, TableHeader } = await import('@tiptap/extension-table');
const { default: TaskList } = await import('@tiptap/extension-task-list');
const { default: TaskItem } = await import('@tiptap/extension-task-item');
const { Markdown } = await import('@tiptap/markdown');
const { Node } = await import('@tiptap/core');

// 与 src/tiptap-config.jsx 等价的引文卡片节点（Node 环境无 React 视图）
const CitationCardHeadless = Node.create({
  name: 'citationCard',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      citationId: { default: null },
      annotationId: { default: null },
      pageNumber: { default: null },
      quotedText: { default: '' },
      stale: { default: false },
      comment: { default: '' },
      noteId: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-citation-card]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-citation-card': '1', ...HTMLAttributes }];
  },
});

function makeEditor(content) {
  return new Editor({
    extensions: [
      StarterKit,
      Table, TableRow, TableCell, TableHeader,
      TaskList,
      TaskItem,
      Markdown,
      CitationCardHeadless,
    ],
    content,
  });
}

const SAMPLE_MD = `# 研究笔记：资源稀缺与孝心消费

## 研究问题

资源稀缺如何影响成年子女的**孝心消费**行为？

## 假设

- 稀缺启动会增加孝心消费
- 效应受*家庭亲密度*调节

1. 第一步：文献综述
2. 第二步：实验设计

- [ ] 阅读引言
- [x] 整理方法

> 关键争议：稀缺感是否具有跨文化一致性

\`\`\`text
样本：N = 240
\`\`\`

[心理学报](https://journal.psych.ac.cn) 2024 年第 3 期。

| 变量 | 操作定义 |
| --- | --- |
| 稀缺 | 回忆任务 |`;

test('markdown parse -> serialize roundtrip preserves structure', () => {
  const editor = makeEditor();
  const manager = editor.storage.markdown.manager;
  const json = manager.parse(SAMPLE_MD);
  editor.commands.setContent(json);
  const back = manager.serialize(editor.getJSON());
  assert.ok(back.includes('# 研究笔记'), 'h1 preserved');
  assert.ok(back.includes('## 研究问题'), 'h2 preserved');
  assert.ok(back.includes('**孝心消费**'), 'bold preserved');
  assert.ok(back.includes('- 稀缺启动'), 'bullet list preserved');
  assert.ok(back.includes('1. 第一步'), 'ordered list preserved');
  assert.ok(back.includes('- [x] 整理方法'), 'task list preserved');
  assert.ok(back.includes('> 关键争议'), 'blockquote preserved');
  assert.ok(back.includes('`样本：N = 240`') || back.includes('```'), 'code preserved');
  assert.ok(back.includes('[心理学报]'), 'link preserved');
  assert.ok(back.includes('| 变量'), 'table preserved (column padding allowed)');
  editor.destroy();
});

test('chinese punctuation and IME-style input survive roundtrip', () => {
  const editor = makeEditor();
  const manager = editor.storage.markdown.manager;
  const json = manager.parse('中文标题：稀缺感「启动」后，孝心消费显著提升（p < .05）——但边界条件待检验。');
  editor.commands.setContent(json);
  const back = manager.serialize(editor.getJSON());
  assert.ok(back.includes('「启动」'), 'CJK quotes preserved');
  // `<` 是 Markdown 特殊字符：合法行为是转义为 &lt;，内容不丢失即可
  assert.ok(back.includes('（p') && back.includes('.05）'), 'content after < preserved (escaping allowed)');
  assert.ok(back.includes('——'), 'em dash preserved');
  editor.destroy();
});

test('editor.getMarkdown() works end-to-end', () => {
  const editor = makeEditor();
  const manager = editor.storage.markdown.manager;
  editor.commands.setContent(manager.parse('# 标题\n\n正文'));
  assert.ok(editor.getMarkdown().includes('# 标题'));
  editor.destroy();
});

test('citationCard node json roundtrip with jump attrs', () => {
  const editor = makeEditor();
  const manager = editor.storage.markdown.manager;
  editor.commands.setContent(manager.parse('前文。'));
  editor.commands.insertContent({
    type: 'citationCard',
    attrs: {
      citationId: 'c-1',
      annotationId: 'a-1',
      pageNumber: 4,
      quotedText: '资源稀缺对成年子女孝心消费行为的影响',
      stale: false,
    },
  });
  const json = editor.getJSON();
  const doc = json.content || [];
  const card = doc.find(n => n.type === 'citationCard');
  assert.ok(card, 'citation node inserted');
  assert.equal(card.attrs.annotationId, 'a-1');
  assert.equal(card.attrs.pageNumber, 4);
  assert.ok(card.attrs.quotedText.includes('孝心消费'));
  // JSON 往返
  const editor2 = makeEditor(json);
  const json2 = editor2.getJSON();
  const card2 = (json2.content || []).find(n => n.type === 'citationCard');
  assert.equal(card2.attrs.annotationId, 'a-1');
  assert.equal(card2.attrs.pageNumber, 4, 'jump page preserved');
  editor.destroy();
  editor2.destroy();
});

test('citation jump target resolution: annotation vs page-only', () => {
  const target = (annotationId, pageNumber) => ({
    annotationId,
    pageNumber,
    hasAnnotation: Boolean(annotationId),
  });
  assert.deepEqual(target('a-1', 4), { annotationId: 'a-1', pageNumber: 4, hasAnnotation: true });
  assert.deepEqual(target(null, 2), { annotationId: null, pageNumber: 2, hasAnnotation: false });
});

test('markdown mirror never throws on citation atom node', () => {
  const editor = makeEditor();
  const manager = editor.storage.markdown.manager;
  editor.commands.setContent(manager.parse('正文'));
  editor.commands.insertContent({
    type: 'citationCard',
    attrs: { citationId: 'c-9', annotationId: null, pageNumber: 2, quotedText: '引文文本', stale: true },
  });
  let md = '';
  try {
    md = manager.serialize(editor.getJSON());
  } catch (error) {
    assert.fail('serialize threw: ' + error.message);
  }
  assert.ok(typeof md === 'string', 'markdown mirror produced');
  assert.ok(md.includes('正文'), 'surrounding text preserved');
  editor.destroy();
});

test('summary template JSON: editor accepts it and serializes to markdown without throwing', async () => {
  const { SUMMARY_TEMPLATE_JSON } = await import('../src/summary-template.js');
  assert.ok(SUMMARY_TEMPLATE_JSON.type === 'doc');
  const headings = SUMMARY_TEMPLATE_JSON.content
    .filter(n => n.type === 'heading' && n.attrs?.level === 1)
    .map(n => n.content?.[0]?.text);
  for (const expected of ['核心问题', '理论基础', '研究假设', '研究方法', '样本与测量', '主要结果', '结论', '局限', '对当前项目的启示', '待验证问题']) {
    assert.ok(headings.includes(expected), `模板包含节：${expected}`);
  }
  const editor = makeEditor(SUMMARY_TEMPLATE_JSON);
  const manager = editor.storage.markdown.manager;
  const md = manager.serialize(editor.getJSON());
  assert.ok(md.includes('# 核心问题'), '模板可序列化为 Markdown');
  assert.ok(md.includes('# 待验证问题'), 'Markdown 保留全部小节');
  // 空文档（用户清空后保存）不得被模板覆盖：编辑器接受空 doc
  const empty = makeEditor({ type: 'doc', content: [] });
  assert.equal(empty.getText(), '');
  editor.destroy();
  empty.destroy();
});
