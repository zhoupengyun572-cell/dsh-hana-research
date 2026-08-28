// Tiptap 编辑器配置：StarterKit（含下划线/链接）+ 表格/任务列表/占位符 + 引文卡片节点。
// Markdown 导入导出走 @tiptap/markdown。
import React, { useMemo, useRef, useEffect } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { Node, mergeAttributes } from '@tiptap/core';
import { IconLocate, IconStale, IconNote } from './icons.jsx';
import { SUMMARY_TEMPLATE_JSON } from './summary-template.js';
export { SUMMARY_TEMPLATE_JSON };

// ── 引文卡片节点 ────────────────────────────────────────

/** 跳转回调容器（可变引用：NotePanel 挂载后注入）。 */
export const citationJumpHolder = { onJump: null, onRemove: null, noteLookup: null };

function CitationCardView({ node, deleteNode }) {
  const attrs = node.attrs || {};
  const stale = Boolean(attrs.stale);
  // v13：从关联逐句笔记取分类/标签（若有），用于引文卡片展示
  const linked = citationJumpHolder.noteLookup?.(attrs.annotationId) || null;
  const jump = () => {
    citationJumpHolder.onJump?.({
      annotationId: attrs.annotationId,
      pageNumber: attrs.pageNumber,
      quotedText: attrs.quotedText,
    });
  };
  return (
    <NodeViewWrapper className="wb-citation" data-stale={stale ? '1' : '0'}>
      <div className="wb-citation-inner">
        <div className="wb-citation-meta">
          <span className="wb-citation-page">第 {attrs.pageNumber || '?'} 页</span>
          {linked?.categoryName && (
            <span className="wb-citation-category" style={linked.categoryColor ? { borderColor: linked.categoryColor, color: linked.categoryColor } : undefined}>
              {linked.categoryName}
            </span>
          )}
          {(linked?.tags || []).slice(0, 3).map(tag => (
            <span key={tag} className="wb-citation-tag" title={tag}>{tag}</span>
          ))}
          {attrs.noteId && <span className="wb-citation-from-note" title="来自逐句笔记">逐句笔记</span>}
          {stale && <span className="wb-citation-stale"><IconStale size={11} /> 原定位已失效</span>}
        </div>
        <blockquote className="wb-citation-quote">{attrs.quotedText || ''}</blockquote>
        {attrs.comment ? (
          <p className="wb-citation-comment"><IconNote size={11} /> 我的理解：{attrs.comment}</p>
        ) : null}
        <div className="wb-citation-actions">
          <button type="button" className="wb-citation-jump" onClick={jump} disabled={stale}>
            <IconLocate size={12} /> 定位原文
          </button>
          <button type="button" className="wb-citation-remove" onClick={() => deleteNode()}>
            移除卡片
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const CitationCard = Node.create({
  name: 'citationCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      citationId: { default: null },
      annotationId: { default: null },
      pageNumber: { default: null },
      quotedText: { default: '' },
      stale: { default: false },
      // v14：从逐句笔记添加到汇总时携带评论与来源笔记 id
      comment: { default: '' },
      noteId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-citation-card]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-citation-card': '1' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationCardView);
  },
});

// ── 扩展清单（Markdown 转换与编辑器共用） ─────────────────

export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: {},
      link: { openOnClick: false, autolink: true }, // StarterKit 3.30 已含 underline/link
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: '记录你的理解、评注与结论…（支持 Markdown 语法）' }),
    Markdown.configure({}),
    CitationCard,
  ];
}

/** Tiptap JSON ↔ Markdown 双向转换（走 @tiptap/markdown 的 MarkdownManager）。 */
export function createMarkdownConverter(editor) {
  const manager = editor?.storage?.markdown?.manager;
  return {
    toMarkdown(currentEditor) {
      const target = currentEditor || editor;
      try {
        if (target?.getMarkdown) return target.getMarkdown();
        if (manager?.serialize) return manager.serialize(target.getJSON());
        return String(target?.getText?.() || '');
      } catch (error) {
        return String(target?.getText?.() || '');
      }
    },
    parseMarkdown(text) {
      if (manager?.parse) return manager.parse(String(text || ''));
      return null;
    },
  };
}

/** 汇总笔记默认模板（十节结构化骨架；首次新建注入，已有内容绝不覆盖）。见 summary-template.js。 */

/** 笔记编辑器 React 组件。 */
export function NoteEditor({ initialJson, placeholder, onChange, editorRef }) {
  const extensions = useMemo(() => buildExtensions(), []);
  // 文档从未创建（initialJson 无效）→ 使用默认模板；已有文档（含空文档）绝不覆盖。
  const hasDoc = Boolean(initialJson && initialJson.type);
  const editor = useEditor({
    extensions,
    content: hasDoc ? initialJson : SUMMARY_TEMPLATE_JSON,
    editorProps: {
      attributes: {
        class: 'wb-prose',
        spellcheck: 'false',
      },
    },
    onUpdate({ editor: current }) {
      onChange?.(current);
    },
  });
  // 模板首次注入：主动触发一次保存（模板持久化后用户删节不复活；引文建档也基于当前 JSON）
  const templateSavedRef = useRef(false);
  useEffect(() => {
    if (editor && !hasDoc && !templateSavedRef.current) {
      templateSavedRef.current = true;
      onChange?.(editor);
    }
  }, [editor, hasDoc, onChange]);
  // noteDoc 异步加载晚于编辑器创建时注入内容（仅一次，且编辑器为空时——避免覆盖用户/引文内容）
  const appliedRef = useRef(false);
  useEffect(() => {
    if (editor && initialJson && initialJson.type && !appliedRef.current && editor.isEmpty) {
      editor.commands.setContent(initialJson, { emitUpdate: false });
      appliedRef.current = true;
    }
  }, [editor, initialJson]);
  useEffect(() => {
    if (editor) window.__hanaEditor = editor; // 调试/集成验证句柄
  }, [editor]);
  // 挂载/卸载同步外部引用：卸载时必须置 null，否则调用方会拿到已销毁的编辑器实例
  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);
  return (
    <div className="wb-note-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
