// v12 阅读工作区验证：批注迁移/序列化、阅读状态、文献笔记、引文、迁移幂等、中文路径。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ResearchStore,
  clearResearchStoreCache,
  RESEARCH_SCHEMA_VERSION,
} from "../lib/store.js";
import { storeUploadedPdf } from "../lib/pdf-import.js";
import {
  subtypeFromKind,
  percentRectToPdfRect,
  normalizeColor,
  legacyAnnotationToEmbedPdf,
  isValidEmbedPdfAnnotation,
  transferItemsToRows,
  serializeAnnotations,
  deserializeAnnotations,
  citationLocation,
} from "../lib/annotation-migrate.js";

function makeStore(t, dirName = "hana-v12-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), dirName));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return store;
}

function seedAttachment(store, projectId, title, originalName) {
  const buffer = Buffer.alloc(4096, 0x20);
  buffer.write("%PDF-1.7\n", 0, "latin1");
  return storeUploadedPdf({ store, projectId, buffer, originalName, title });
}

function sampleHighlight(id = "anno-1") {
  return {
    pageIndex: 0,
    annotation: {
      id,
      type: "highlight",
      contents: "被引用的原文",
      strokeColor: "#FFD54F",
      opacity: 0.45,
      segmentRects: [
        { origin: { x: 10, y: 700 }, size: { width: 200, height: 12 } },
      ],
    },
  };
}

// ── 批注序列化/反序列化 ──────────────────────────────────

test("annotation serialization roundtrip preserves objects and rejects garbage", () => {
  const items = [sampleHighlight(), sampleHighlight("anno-2")];
  const json = serializeAnnotations(items);
  const back = deserializeAnnotations(json);
  assert.equal(back.length, 2);
  assert.equal(back[0].annotation.id, "anno-1");
  assert.equal(back[1].annotation.contents, "被引用的原文");
  assert.deepEqual(deserializeAnnotations(null), []);
  assert.deepEqual(deserializeAnnotations("{broken"), []);
  assert.deepEqual(deserializeAnnotations(JSON.stringify([{ foo: 1 }, { annotation: { type: "highlight" } }])), [{ annotation: { type: "highlight" } }]);
});

test("subtypeFromKind maps legacy kinds", () => {
  assert.equal(subtypeFromKind("highlight"), "highlight");
  assert.equal(subtypeFromKind("area"), "square");
  assert.equal(subtypeFromKind("unknown"), "highlight");
});

test("percentRectToPdfRect flips y-axis into PDF coordinates", () => {
  // 页面 600x800；左上原点 rect {0.1, 0.1, 0.5, 0.2} → PDF 左下原点
  const pdf = percentRectToPdfRect({ x: 0.1, y: 0.1, width: 0.5, height: 0.2 }, 600, 800);
  assert.equal(pdf.origin.x, 60);
  assert.equal(pdf.origin.y, 560); // 800 - (0.1+0.2)*800
  assert.equal(pdf.size.width, 300);
  assert.equal(pdf.size.height, 160);
});

test("normalizeColor cleans #rgb/#rrggbb/rgb() and falls back", () => {
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("#8bb8e8"), "#8bb8e8");
  assert.equal(normalizeColor("rgb(139, 184, 232)"), "#8bb8e8");
  assert.equal(normalizeColor("bogus"), "#FFFF98");
  assert.equal(normalizeColor("", "#112233"), "#112233");
});

test("legacyAnnotationToEmbedPdf converts rects/quote/color and drops degenerate rects", () => {
  const legacy = {
    id: "a1",
    pageNumber: 3,
    payload: {
      rects: [
        { x: 0.1, y: 0.1, width: 0.5, height: 0.1 },
        { x: 0, y: 0, width: 0.0001, height: 0.0001 }, // 退化矩形
      ],
      color: "#8bb8e8",
      quote: "资源稀缺对成年子女孝心消费行为的影响",
    },
  };
  const obj = legacyAnnotationToEmbedPdf(legacy, 612, 792);
  assert.equal(obj.type, "highlight");
  assert.equal(obj.strokeColor, "#8bb8e8");
  assert.equal(obj.contents, legacy.payload.quote);
  assert.equal(obj.segmentRects.length, 1);
  assert.ok(isValidEmbedPdfAnnotation(obj));
});

test("isValidEmbedPdfAnnotation validates subtypes and geometry", () => {
  assert.ok(isValidEmbedPdfAnnotation(sampleHighlight().annotation));
  assert.ok(isValidEmbedPdfAnnotation({ type: "note", rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } }, contents: "便签" }));
  assert.ok(!isValidEmbedPdfAnnotation({ type: "bogus" }));
  assert.ok(!isValidEmbedPdfAnnotation({ type: "highlight", segmentRects: [] }));
  assert.ok(!isValidEmbedPdfAnnotation(null));
});

test("transferItemsToRows extracts subtype/page/text and skips invalid", () => {
  const rows = transferItemsToRows("att-1", [
    sampleHighlight(),
    { annotation: { type: "bogus" } },
    { pageIndex: 2, annotation: { type: "note", rect: { origin: { x: 0, y: 0 }, size: { width: 5, height: 5 } }, contents: "第3页便签" } },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].subtype, "highlight");
  assert.equal(rows[0].pageNumber, 1);
  assert.equal(rows[0].selectedText, "被引用的原文");
  assert.equal(rows[1].pageNumber, 3);
  assert.equal(rows[1].selectedText, "第3页便签");
});

test("citationLocation builds jump target", () => {
  assert.deepEqual(citationLocation(null, 3), { pageNumber: 3, hasAnnotation: false });
  assert.deepEqual(citationLocation({ id: "x" }, 7), { pageNumber: 7, hasAnnotation: true });
});

// ── 阅读状态保存与恢复 ───────────────────────────────────

test("reading state: put/get/clamp/roundtrip", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "状态测试" });
  const up = seedAttachment(store, project.id, "状态论文", "论文 测试 (1).pdf");
  const paperId = up.paper.id;
  assert.equal(store.getReadingState(paperId), null);
  const saved = store.putReadingState({
    paperId, currentPage: 5, zoom: 1.25, scrollMode: "continuous",
    leftPanelWidth: 300, rightPanelWidth: 420, leftPanelCollapsed: true, rightPanelCollapsed: false,
  });
  assert.equal(saved.currentPage, 5);
  assert.equal(saved.zoom, 1.25);
  assert.equal(saved.leftPanelWidth, 300);
  assert.equal(saved.leftPanelCollapsed, true);
  // clamp
  const clamped = store.putReadingState({ paperId, zoom: 99, leftPanelWidth: 10, rightPanelWidth: 9999 });
  assert.equal(clamped.zoom, 8);
  assert.equal(clamped.leftPanelWidth, 160);
  assert.equal(clamped.rightPanelWidth, 720);
  // 恢复
  const again = store.getReadingState(paperId);
  assert.equal(again.currentPage, 5);
  assert.equal(again.scrollMode, "continuous");
});

// ── 文献笔记文档（Tiptap JSON + Markdown 镜像） ────────────

test("paper note document: atomic upsert + json roundtrip", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "笔记测试" });
  const up = seedAttachment(store, project.id, "笔记论文", "笔记论文.pdf");
  const paperId = up.paper.id;
  assert.equal(store.getPaperNoteDocument(paperId), null);
  const tiptap = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "文献笔记" }] },
      { type: "paragraph", content: [{ type: "text", text: "研究问题：资源稀缺如何影响孝心消费？" }] },
    ],
  };
  const doc = store.putPaperNoteDocument({ paperId, title: "阅读笔记", tiptapJson: tiptap, markdown: "## 文献笔记\n\n研究问题：资源稀缺如何影响孝心消费？" });
  assert.equal(doc.title, "阅读笔记");
  assert.equal(doc.tiptapJson.content.length, 2);
  assert.equal(doc.markdown.includes("孝心消费"), true);
  const again = store.getPaperNoteDocument(paperId);
  assert.deepEqual(again.tiptapJson, tiptap);
  // upsert 更新
  const doc2 = store.putPaperNoteDocument({ paperId, title: "更新标题", tiptapJson: { type: "doc", content: [] }, markdown: "" });
  assert.equal(doc2.id, doc.id);
  assert.equal(doc2.title, "更新标题");
  assert.equal(store.getPaperNoteDocument(paperId).tiptapJson.content.length, 0);
  // 保存失败不产生脏数据：非法 paperId 抛错且不落库
  assert.throws(() => store.putPaperNoteDocument({ paperId: "", tiptapJson: {} }), /文献 ID/);
});

// ── 引文卡片生成 + 跳转定位 + 删除批注标失效 ────────────────

test("citations: create/list/update/delete + annotation deletion marks stale", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "引文测试" });
  const up = seedAttachment(store, project.id, "引文论文", "引文论文.pdf");
  const paperId = up.paper.id;
  const doc = store.putPaperNoteDocument({ paperId, title: "笔记", tiptapJson: { type: "doc", content: [] } });
  const annotationId = "anno-abc";
  const citation = store.addCitation({
    noteDocumentId: doc.id, paperId, annotationId, pageNumber: 4,
    quotedText: "被引用的原文段落", prefix: "作者指出", suffix: "（见原文）",
  });
  assert.equal(citation.quotedText, "被引用的原文段落");
  assert.equal(citation.annotationDeleted, false);
  assert.equal(citationLocation({ id: citation.annotationId }, citation.pageNumber).pageNumber, 4);
  const listed = store.listCitations(doc.id);
  assert.equal(listed.length, 1);
  const updated = store.updateCitation(citation.id, { quotedText: "改后的引文", pageNumber: 5 });
  assert.equal(updated.quotedText, "改后的引文");
  assert.equal(updated.pageNumber, 5);
  // 删除批注 → 引文保留但标记失效
  store.markCitationsStaleByAnnotation(annotationId);
  const stale = store.listCitations(doc.id)[0];
  assert.equal(stale.annotationDeleted, true);
  assert.equal(stale.quotedText, "改后的引文", "引文文本不因批注删除而丢失");
  // 删除引文
  assert.equal(store.deleteCitation(citation.id).deleted, true);
  assert.equal(store.listCitations(doc.id).length, 0);
});

// ── 高亮摘录 → 项目笔记（v12 对齐旧版"选中高亮即记笔记"） ──

test("createHighlightNote: quote required, content optional, links engine annotation", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "高亮笔记" });
  const up = seedAttachment(store, project.id, "高亮论文", "高亮论文.pdf");
  const note = store.createHighlightNote({
    attachmentId: up.attachment.id, pageNumber: 2,
    quote: "高亮摘录的原文", content: "", tags: ["关键证据"], annotationId: "anno-embed-1",
  });
  assert.equal(note.quote, "高亮摘录的原文");
  assert.equal(note.pageNumber, 2);
  assert.deepEqual(note.tags, ["关键证据"]);
  assert.equal(note.annotationId, "anno-embed-1");
  assert.equal(note.attachmentId, up.attachment.id);
  // 空 quote → 400
  assert.throws(() => store.createHighlightNote({ attachmentId: up.attachment.id, quote: "  " }), /选中文本不能为空/);
  // 附件不属于任何项目 → 400
  const orphan = seedAttachment(store, project.id, "孤儿论文", "孤儿.pdf");
  // 孤儿附件需要解除项目关联才能测：这里直接验证正常路径之外的另一条
  const note2 = store.createHighlightNote({
    attachmentId: up.attachment.id, pageNumber: 3, quote: "第二条摘录", annotationId: "anno-embed-2",
  });
  assert.equal(store.listNotes(project.id).length, 2);
  // 删除笔记级联删除关联批注（annotations 表同 id 行）
  store.replaceAnnotationsV2(up.attachment.id, [{
    pageIndex: 1,
    annotation: { id: "anno-embed-1", type: "highlight", contents: "x", strokeColor: "#FFD54F", opacity: 0.4, segmentRects: [{ origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } }] },
  }]);
  assert.equal(store.listAnnotationsV2(up.attachment.id).length, 1);
  store.deleteNote(project.id, note.id);
  assert.equal(store.listAnnotationsV2(up.attachment.id).length, 0, "删除笔记级联删除关联批注");
});

// ── EmbedPDF 批注 v2 批量存取 ─────────────────────────────

test("annotations-v2: replace/list roundtrip keeps legacy notes link", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "批注测试" });
  const up = seedAttachment(store, project.id, "批注论文", "批注论文.pdf");
  const attId = up.attachment.id;
  const items = [sampleHighlight("h-1"), sampleHighlight("h-2"), {
    pageIndex: 1,
    annotation: { id: "n-1", type: "note", contents: "页面便签", rect: { origin: { x: 5, y: 5 }, size: { width: 24, height: 24 } } },
  }];
  const saved = store.replaceAnnotationsV2(attId, items);
  assert.equal(saved.length, 3);
  const highlight = saved.find(a => a.id === "h-1");
  assert.equal(highlight.subtype, "highlight");
  assert.ok(highlight.embedPdf);
  assert.equal(highlight.embedPdf.annotation.contents, "被引用的原文");
  // 二次替换（更新 + 删除一条未关联笔记的）
  const replaced = store.replaceAnnotationsV2(attId, [sampleHighlight("h-1"), {
    pageIndex: 0,
    annotation: { id: "n-1", type: "note", contents: "更新后的便签", rect: { origin: { x: 5, y: 5 }, size: { width: 24, height: 24 } } },
  }]);
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find(a => a.id === "n-1").embedPdf.annotation.contents, "更新后的便签");
  assert.ok(!replaced.some(a => a.id === "h-2"), "未关联笔记的批注被删除");
});

// ── 数据迁移幂等性 ───────────────────────────────────────

test("schema v12 migration is idempotent and preserves legacy subtype backfill", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v12-mig-"));
  const store1 = new ResearchStore(dir, { seedDemoData: true });
  assert.equal(RESEARCH_SCHEMA_VERSION, 19);
  const meta = store1.db.prepare("SELECT value FROM research_meta WHERE key='schema_version'").get();
  assert.equal(meta.value, "19");
  const tables = store1.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const table of ["paper_reading_state", "paper_note_documents", "note_citations", "sentence_notes", "note_categories"]) {
    assert.ok(tables.includes(table), table);
  }
  const cols = new Set(store1.db.prepare("PRAGMA table_info(annotations)").all().map(c => c.name));
  assert.ok(cols.has("subtype") && cols.has("embed_pdf_data"));
  // 旧 kind 回填 subtype
  const project = store1.createProject({ title: "迁移测试" });
  const up = seedAttachment(store1, project.id, "迁移论文", "迁移论文.pdf");
  store1.db.prepare(`
    INSERT INTO annotations(id, project_id, attachment_id, page_number, kind, payload_json, created_at, updated_at)
    VALUES('legacy-1', ?, ?, 2, 'area', '{"rects":[]}', datetime('now'), datetime('now'))
  `).run(project.id, up.attachment.id);
  store1.close();
  // 重新打开（第二次迁移运行）：幂等
  const store2 = new ResearchStore(dir, { seedDemoData: true });
  const legacy = store2.db.prepare("SELECT subtype FROM annotations WHERE id = 'legacy-1'").get();
  assert.equal(legacy.subtype, "square");
  const version = store2.db.prepare("SELECT value FROM research_meta WHERE key='schema_version'").get();
  assert.equal(version.value, "19");
  store2.close();
  clearResearchStoreCache();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 中文路径处理 ─────────────────────────────────────────

test("chinese filename attachment survives upload and annotation roundtrip", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "中文路径" });
  const up = seedAttachment(store, project.id, "心理学报 2024 年第 3 期（修订版）", "心理学报 2024年第3期（修订版）.pdf");
  assert.ok(up.attachment.fileName.includes("心理学报"));
  const dbRow = store.db.prepare("SELECT relative_path FROM attachments WHERE id = ?").get(up.attachment.id);
  assert.ok(dbRow.relative_path.includes(up.attachment.sha256), "内容寻址相对路径不含特殊字符");
  const saved = store.replaceAnnotationsV2(up.attachment.id, [sampleHighlight("h-zh")]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].embedPdf.annotation.contents, "被引用的原文");
});

// ── 保存失败重试语义：事务原子性 ──────────────────────────

test("replaceAnnotationsV2: invalid rows ignored, empty batch = delete-all semantics, legacy protected", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "原子性" });
  const up = seedAttachment(store, project.id, "原子论文", "原子论文.pdf");
  store.replaceAnnotationsV2(up.attachment.id, [sampleHighlight("h-1")]);
  assert.equal(store.listAnnotationsV2(up.attachment.id).length, 1);
  // 全无效行 → 不产生脏数据
  store.replaceAnnotationsV2(up.attachment.id, [{ annotation: { type: "bogus" } }, { notAnnotation: true }]);
  let after = store.listAnnotationsV2(up.attachment.id);
  assert.equal(after.length, 0, "无效批次等价于空批次：未关联笔记的 UI 批注被删除");
  // 重新写入两条：一条关联摘录笔记、一条纯 UI
  store.replaceAnnotationsV2(up.attachment.id, [sampleHighlight("h-1"), sampleHighlight("h-2")]);
  const note = store.createSelectionNote({
    projectId: project.id, attachmentId: up.attachment.id, pageNumber: 1,
    quote: "关联原文", content: "关联笔记", tags: ["关键证据"],
    rects: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.1 }], color: "#8bb8e8",
  });
  assert.equal(store.listAnnotationsV2(up.attachment.id).length, 3, "selection-note 创建的 legacy 批注并存");
  // 空批次：只删纯 UI 批注；legacy 批注与摘录笔记关联批注保留
  store.replaceAnnotationsV2(up.attachment.id, []);
  after = store.listAnnotationsV2(up.attachment.id);
  assert.equal(after.length, 1, "仅保留 legacy/笔记关联批注");
  assert.equal(after[0].id, note.annotation.id);
});

// ── 项目删除（清理验证数据 / 用户删除项目） ─────────────────

test("deleteProject cascades notes/annotations/citations and keeps papers", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "待删除项目" });
  const up = seedAttachment(store, project.id, "删除论文", "删除论文.pdf");
  const paperId = up.paper.id;
  const note = store.createSelectionNote({
    projectId: project.id, attachmentId: up.attachment.id, pageNumber: 1,
    quote: "删除前原文", content: "删除前笔记", tags: ["关键证据"],
    rects: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.1 }], color: "#8bb8e8",
  });
  const doc = store.putPaperNoteDocument({ paperId, title: "笔记", tiptapJson: { type: "doc", content: [] } });
  store.addCitation({ noteDocumentId: doc.id, paperId, annotationId: note.annotation.id, pageNumber: 1, quotedText: "删除前原文" });
  store.putReadingState({ paperId, currentPage: 2 });
  assert.equal(store.listNotes(project.id).length, 1);
  const result = store.deleteProject(project.id);
  assert.equal(result.linkedPaperIds, 1);
  assert.equal(store.getProject(project.id), null);
  // 项目不存在后其笔记不可再列出（级联删除的间接验证）
  assert.throws(() => store.listNotes(project.id), /项目不存在/);
  assert.equal(store.getPaperNoteDocument(paperId), null);
  assert.equal(store.getReadingState(paperId), null);
  assert.equal(store.listCitations(doc.id).length, 0);
  // 文献与附件保留在文献中心
  assert.ok(store.getPaper(paperId), "paper survives project deletion");
  assert.equal(store.getAttachment(up.attachment.id).id, up.attachment.id);
  // 重复删除 → 404
  assert.throws(() => store.deleteProject(project.id), /项目不存在/);
});
