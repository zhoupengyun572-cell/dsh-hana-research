// v13 阅读工作区验证：逐句笔记 / 分类 / 标签颜色 / 幂等迁移与备份 / 标签全覆盖 / 失效标记。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ResearchStore,
  clearResearchStoreCache,
  RESEARCH_SCHEMA_VERSION,
  DEFAULT_NOTE_CATEGORIES,
} from "../lib/store.js";
import { storeUploadedPdf } from "../lib/pdf-import.js";

function makeStore(t, dirName = "hana-v13-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), dirName));
  const store = new ResearchStore(dir);
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
  // 每个附件写入唯一标记，避免内容相同被跨项目去重复用（同论文ID）
  buffer.write(String(originalName || "").padEnd(64, " "), 40, "latin1");
  return storeUploadedPdf({ store, projectId, buffer, originalName, title });
}

function sampleNote(store, projectId, paperId, attachmentId, overrides = {}) {
  return store.createSentenceNote({
    paperId,
    attachmentId,
    annotationId: overrides.annotationId ?? "anno-v13-1",
    quotedText: overrides.quotedText ?? "资源稀缺会改变消费者的注意分配方式",
    comment: overrides.comment ?? "注意隧道假说相关",
    pageNumber: overrides.pageNumber ?? 3,
    position: { formatted: [{ pageIndex: 2, segmentRects: [{ origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } }] }] },
    categoryId: overrides.categoryId ?? null,
    tags: overrides.tags ?? ["资源稀缺"],
    importance: overrides.importance ?? 2,
    starred: overrides.starred ?? false,
    status: overrides.status ?? "inbox",
    evidence: overrides.evidence ?? null,
  });
}

// ── v13 迁移：备份 + 幂等 ──────────────────────────────────

test("v13 migration backs up pre-13 DB once and is idempotent on reopen", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v13-mig-"));
  try {
    const store1 = new ResearchStore(dir);
    assert.equal(store1.getMetaValue("schema_version"), "19");
    assert.equal(RESEARCH_SCHEMA_VERSION, 19);
    const backupsAfterFirstOpen = fs.readdirSync(dir).filter(f => f.includes(".bak-v13-")).length;
    assert.ok(backupsAfterFirstOpen >= 1, "首次打开（旧版本库）应生成备份");
    store1.close();
    clearResearchStoreCache();
    // 二次打开：不应再生成新备份
    const store2 = new ResearchStore(dir);
    const backupsAfterSecondOpen = fs.readdirSync(dir).filter(f => f.includes(".bak-v13-")).length;
    assert.equal(backupsAfterSecondOpen, backupsAfterFirstOpen, "重复打开不得重复备份");
    // 默认分类种子
    const categories = store2.listNoteCategories();
    assert.ok(categories.length >= DEFAULT_NOTE_CATEGORIES.length, "默认分类已种子化");
    assert.ok(categories.some(c => c.name === "研究结果" && /^#[0-9a-f]{6}$/i.test(c.color)), "默认分类含颜色");
    store2.close();
    clearResearchStoreCache();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 逐句笔记 CRUD + 幂等去重 ──────────────────────────────

test("sentence notes: create / dedupe by annotationId / dedupe by text", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "逐句测试" });
  const up = seedAttachment(store, project.id, "逐句论文", "逐句.pdf");
  const paperId = up.paper.id;

  const note = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-dup-1" });
  assert.ok(note.id);
  assert.equal(note.pageNumber, 3);
  assert.equal(note.categoryId, null);
  assert.deepEqual(note.tags, ["资源稀缺"]);
  assert.equal(note.importance, 2);
  assert.equal(note.starred, false);
  assert.equal(note.status, "inbox");
  assert.ok(Array.isArray(note.position.formatted));

  // 同 annotationId 重复创建 → 返回同一记录（幂等重试）
  const dup1 = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-dup-1", comment: "不应生效" });
  assert.equal(dup1.id, note.id);
  assert.equal(dup1.comment, note.comment, "去重命中后不得覆盖原内容");

  // 无 annotationId：同 文献+页码+摘录 → 返回同一记录
  const a = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: null, quotedText: "完全相同的一段" });
  const b = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: null, quotedText: "完全相同的一段" });
  assert.equal(b.id, a.id, "文本级去重");

  // 更新：评论/分类/标签/星级/状态/重要程度（使用迁移种子里的「研究结果」分类）
  const cat = store.listNoteCategories().find(c => c.name === "研究结果");
  assert.ok(cat, "默认分类「研究结果」存在");
  const updated = store.updateSentenceNote(note.id, {
    comment: "我的理解：注意隧道影响决策",
    categoryId: cat.id,
    tags: ["资源稀缺", "注意分配"],
    starred: true,
    status: "organized",
    importance: 3,
  });
  assert.equal(updated.comment, "我的理解：注意隧道影响决策");
  assert.equal(updated.categoryId, cat.id);
  assert.equal(updated.categoryName, "研究结果");
  assert.equal(updated.categoryColor, "#f0c94f");
  assert.deepEqual(updated.tags, ["资源稀缺", "注意分配"]);
  assert.equal(updated.starred, true);
  assert.equal(updated.status, "organized");
  assert.equal(updated.importance, 3);

  // 列表 + 筛选（note + 文本去重记录 a，共 2 条）
  const all = store.listSentenceNotes({ paperId });
  assert.equal(all.length, 2);
  assert.equal(store.listSentenceNotes({ paperId, q: "注意隧道" })[0].id, note.id, "搜索评论命中");
  assert.equal(store.listSentenceNotes({ paperId, categoryId: cat.id }).length, 1, "分类筛选");
  assert.equal(store.listSentenceNotes({ paperId, tag: "注意分配" }).length, 1, "标签筛选");
  assert.equal(store.listSentenceNotes({ paperId, status: "organized" }).length, 1, "状态筛选");
  assert.equal(store.listSentenceNotes({ paperId, starred: true }).length, 1, "收藏筛选");
  assert.equal(store.listSentenceNotes({ paperId, categoryId: "none" }).length, 1, "未分类筛选");

  // 删除
  const del = store.deleteSentenceNote(note.id);
  assert.equal(del.deleted, true);
  assert.equal(del.annotationId, "anno-dup-1");
  assert.equal(store.listSentenceNotes({ paperId }).length, 1);
});

// ── 分类：改名/删除不删笔记 ────────────────────────────────

test("categories: rename, delete detaches notes without deleting them", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "分类测试" });
  const up = seedAttachment(store, project.id, "分类论文", "分类.pdf");
  const paperId = up.paper.id;

  const cat = store.createNoteCategory({ name: "自定义分类", color: "#8be0b8" });
  const dup = () => store.createNoteCategory({ name: "自定义分类" });
  assert.throws(dup, (error) => error.code === "CATEGORY_EXISTS");

  const note = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-cat-1", categoryId: cat.id });
  assert.equal(note.categoryName, "自定义分类");

  const renamed = store.updateNoteCategory(cat.id, { name: "改名分类", color: "#e88b8b" });
  assert.equal(renamed.name, "改名分类");
  assert.equal(renamed.color, "#e88b8b");
  assert.equal(store.getSentenceNote(note.id).categoryName, "改名分类", "改名联动笔记显示");

  // 汇总笔记分类/标签
  store.putPaperNoteDocument({ paperId, title: "汇总", tiptapJson: { type: "doc", content: [] }, markdown: "# 核心问题", categoryId: cat.id, tags: ["理论"] });
  const doc = store.getPaperNoteDocument(paperId);
  assert.equal(doc.categoryId, cat.id);
  assert.deepEqual(doc.tags, ["理论"]);

  // 删除分类 → 笔记保留、归入未分类
  const removed = store.deleteNoteCategory(cat.id);
  assert.equal(removed.deleted, true);
  const after = store.getSentenceNote(note.id);
  assert.equal(after.categoryId, null, "删除分类后笔记归入未分类");
  assert.equal(after.quotedText, "资源稀缺会改变消费者的注意分配方式", "笔记内容保留");
  assert.equal(store.getPaperNoteDocument(paperId).categoryId, null, "汇总笔记同样归入未分类");
});

// ── 标签颜色 + 标签聚合覆盖 ────────────────────────────────

test("tag colors persist; listTags covers notes + sentence notes + summary docs", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "标签测试" });
  const up = seedAttachment(store, project.id, "标签论文", "标签.pdf");
  const paperId = up.paper.id;

  store.saveTagColor("资源稀缺", "#e88b8b");
  assert.equal(store.listTagColors()["资源稀缺"], "#e88b8b");
  // 空格归一化
  store.saveTagColor("  注意分配 ", "#8be0e0");
  assert.ok(store.listTagColors()["注意分配"], "标签名 trim 后存储");

  store.createNote({ projectId: project.id, content: "项目笔记", tags: ["资源稀缺"] });
  sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-tag-1", tags: ["资源稀缺", "注意分配"] });
  store.putPaperNoteDocument({ paperId, title: "", tiptapJson: {}, markdown: "", tags: ["理论"] });

  const tags = store.listTags(project.id);
  const names = tags.map(x => x.tag);
  assert.ok(names.includes("资源稀缺") && names.includes("注意分配") && names.includes("理论"), "三类笔记标签聚合");
  assert.equal(tags.find(x => x.tag === "资源稀缺").count, 2);
  assert.equal(tags.find(x => x.tag === "资源稀缺").color, "#e88b8b", "标签颜色随聚合返回");

  // 重命名标签覆盖逐句笔记
  const affected = store.renameNoteTag("注意分配", "注意偏向");
  assert.ok(affected >= 1);
  const list = store.listSentenceNotes({ paperId });
  assert.ok(list.some(n => n.tags.includes("注意偏向")), "逐句笔记标签已重命名");
  assert.ok(!list.some(n => n.tags.includes("注意分配")));

  // 删除标签覆盖汇总笔记
  const removedCount = store.removeNoteTag("理论");
  assert.ok(removedCount >= 1);
  assert.equal(store.getPaperNoteDocument(paperId).tags.length, 0);
});

// ── 批注删除 → 逐句笔记失效标记 + 关联保护 ──────────────────

test("annotation removal marks sentence notes stale; linked notes protect annotations", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "失效测试" });
  const up = seedAttachment(store, project.id, "失效论文", "失效.pdf");
  const paperId = up.paper.id;

  // 有逐句笔记关联的批注：差集删除时保留
  sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-keep-1" });
  store.replaceAnnotationsV2(up.attachment.id, [
    { pageIndex: 2, annotation: { id: "anno-keep-1", type: "highlight", contents: "保留", segmentRects: [{ origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] } },
    { pageIndex: 0, annotation: { id: "anno-gone-1", type: "highlight", contents: "删除", segmentRects: [{ origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] } },
  ]);
  // 再次全量保存时移除 anno-gone-1（纯 UI 批注、无笔记关联 → 删除）
  store.replaceAnnotationsV2(up.attachment.id, [
    { pageIndex: 2, annotation: { id: "anno-keep-1", type: "highlight", contents: "保留", segmentRects: [{ origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] } },
  ]);
  const remaining = store.listAnnotationsV2(up.attachment.id).map(a => a.id);
  assert.ok(remaining.includes("anno-keep-1"), "有逐句笔记关联的批注不得被差集删除");
  assert.ok(!remaining.includes("anno-gone-1"), "无关联批注正常删除");

  // 有笔记关联的批注被删除 → 仅标记失效（笔记保留）
  const linkedNote = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-gone-1" });
  assert.equal(linkedNote.annotationDeleted, false);
  const changed = store.markSentenceNotesStaleByAnnotation("anno-gone-1");
  assert.equal(changed, 1);
  assert.equal(store.getSentenceNote(linkedNote.id).annotationDeleted, true, "笔记保留但标记定位失效");

  // relocate：重新关联
  const relocated = store.relocateSentenceNote(linkedNote.id, { annotationId: "anno-keep-1" });
  assert.equal(relocated.annotationId, "anno-keep-1");
  assert.equal(relocated.annotationDeleted, false);
});

// ── 项目删除 → 逐句笔记级联 ────────────────────────────────

test("deleteProject cascades sentence notes (but not the paper)", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "级联测试" });
  const up = seedAttachment(store, project.id, "级联论文", "级联.pdf");
  const paperId = up.paper.id;
  const note = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-cascade-1" });
  assert.ok(note.id);
  store.deleteProject(project.id);
  assert.equal(store.listSentenceNotes({ paperId }).length, 0, "项目删除后逐句笔记级联删除");
  assert.ok(store.getPaper(paperId), "文献本身保留在文献中心");
});

// ── 阅读状态 / 汇总文档扩展字段 ─────────────────────────────

test("reading state persists rightTab; note document persists category/tags", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "状态扩展" });
  const up = seedAttachment(store, project.id, "状态论文", "状态.pdf");
  const paperId = up.paper.id;

  let state = store.putReadingState({ paperId, currentPage: 4, zoom: 1.35, rightTab: "summary" });
  assert.equal(state.rightTab, "summary");
  assert.equal(state.currentPage, 4);
  assert.ok(Math.abs(state.zoom - 1.35) < 0.001);

  state = store.putReadingState({ paperId, currentPage: 5 });
  assert.equal(state.rightTab, "summary", "未提供的 rightTab 保留旧值");
  state = store.putReadingState({ paperId, rightTab: "bogus" });
  assert.equal(state.rightTab, "sentence", "非法值回退 sentence");

  const doc = store.putPaperNoteDocument({
    paperId, title: "汇总",
    tiptapJson: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "核心问题" }] }] },
    markdown: "# 核心问题", categoryId: null, tags: ["理论", "局限"],
  });
  assert.deepEqual(doc.tags, ["理论", "局限"]);
  assert.equal(doc.markdown, "# 核心问题");
});

// ── P6：结构化证据卡（position_json.__evidence） ─────────────

test("sentence note evidence: create / update / clear, preserves position", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "证据测试" });
  const up = seedAttachment(store, project.id, "证据论文", "证据.pdf");
  const paperId = up.paper.id;

  const evidence = {
    question: "稀缺启动是否改变注意分配？",
    method: "实验 2，大学生 N=98",
    limitation: "仅限实验室情境",
    section: "讨论 · 局限",
  };
  const note = sampleNote(store, project.id, paperId, up.attachment.id, { annotationId: "anno-evidence-1", evidence });
  assert.deepEqual(note.evidence, evidence, "创建时写入结构化证据");
  assert.deepEqual(note.position.formatted, [{ pageIndex: 2, segmentRects: [{ origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } }] }], "定位数据不受影响");

  // 更新单个字段：其余保留
  const updated = store.updateSentenceNote(note.id, { evidence: { question: "更新后的问题", method: "实验 3" } });
  assert.deepEqual(updated.evidence, { question: "更新后的问题", method: "实验 3" }, "部分更新证据字段");

  // 清空字段 → evidence 为 null，position 仍保留
  const cleared = store.updateSentenceNote(note.id, { evidence: {} });
  assert.equal(cleared.evidence, null, "空证据对象清除存储");
  assert.ok(cleared.position && Array.isArray(cleared.position.formatted), "清除证据不破坏定位");

  // 超长截断 + 非法字段忽略
  const long = store.updateSentenceNote(note.id, { evidence: { question: "x".repeat(5000), bogus: "ignored" } });
  assert.equal(long.evidence.question.length, 2000, "字段截断到 2000 字符");
  assert.equal(long.evidence.bogus, undefined, "非法字段不入库");
});

// ── P6：研究驾驶舱聚合（真实数据，不伪造进度） ────────────────

test("buildCockpitStats aggregates papers/evidence/tasks/relations/reading", (t) => {
  const store = makeStore(t);
  const project = store.createProject({ title: "驾驶舱测试", description: "研究稀缺与注意" });
  const up1 = seedAttachment(store, project.id, "论文甲", "甲.pdf");
  const up2 = seedAttachment(store, project.id, "论文乙", "乙.pdf");
  const paperA = up1.paper.id, paperB = up2.paper.id;

  // 论文 A：已读 + 有逐句笔记（含结构化证据）
  store.setPaperStatus(paperA, { readStatus: "read" });
  sampleNote(store, project.id, paperA, up1.attachment.id, { annotationId: "anno-cockpit-1" });
  store.updateSentenceNote(
    store.listSentenceNotes({ paperId: paperA })[0].id,
    { evidence: { question: "Q1", method: "实验", limitation: "L", section: "讨论" } }
  );
  // 论文 B：已读（未精读笔记）
  store.setPaperStatus(paperB, { readStatus: "read" });
  // 阅读位置
  store.putReadingState({ paperId: paperA, currentPage: 7 });
  // 关系（A 支持 B）
  store.addPaperRelation({ projectId: project.id, fromPaperId: paperA, toPaperId: paperB, relation: "supports", note: "支持" });
  // 任务：两条待办 + 一条完成
  store.createNote({ projectId: project.id, content: "补读论文乙", tags: ["研究任务", "状态:待办", "优先级:高", "截止:2026-08-30"] });
  store.createNote({ projectId: project.id, content: "整理证据矩阵", tags: ["研究任务", "状态:待办"] });
  store.createNote({ projectId: project.id, content: "已完成的综述段落", tags: ["研究任务", "状态:完成"] });
  // 汇总文档
  store.putPaperNoteDocument({ paperId: paperA, title: "", tiptapJson: {}, markdown: "# 汇总", categoryId: null, tags: [] });

  const stats = store.buildCockpitStats(project.id);
  assert.equal(stats.papers.total, 2);
  assert.equal(stats.papers.withPdf, 2);
  assert.equal(stats.papers.read, 2);
  assert.equal(stats.evidence.sentenceNotes, 1);
  assert.equal(stats.evidence.notes, 3, "任务笔记计入笔记总数");
  assert.equal(stats.tasks.todo, 2);
  assert.equal(stats.tasks.done, 1);
  assert.equal(stats.tasks.open.length, 2);
  assert.equal(stats.tasks.open.find(x => x.content === "补读论文乙").priority, "高", "任务优先级解析（按内容定位，不依赖列表顺序）");
  assert.equal(stats.tasks.open.find(x => x.content === "补读论文乙").due, "2026-08-30");
  assert.equal(stats.relations.total, 1);
  assert.equal(stats.relations.supports, 1);
  assert.equal(stats.writing.noteDocuments, 1);
  assert.equal(stats.reading.length, 1);
  assert.equal(stats.reading[0].paperId, paperA);
  assert.equal(stats.reading[0].page, 7);
  assert.equal(stats.candidates.length, 1, "有 PDF 但无笔记的论文列为证据缺口候选");
  assert.equal(stats.candidates[0].paperId, undefined);
  assert.ok(stats.candidates[0].id === paperB);
  assert.equal(typeof stats.searches.saved, "number");
  assert.equal(store.hostCapabilities().evidence, true);
});
