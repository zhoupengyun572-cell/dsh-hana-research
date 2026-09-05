// P1 增强验证：schema v5 迁移、阅读状态/优先级、自定义期刊、查看标记、阅读进度、BibTeX/RIS 导出。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { storeUploadedPdf } from "../lib/pdf-import.js";
import { paperToBibtex, papersToBibtex, paperToRis, papersToRis, exportCitations, exportFileName, bibtexKey } from "../lib/bibtex.js";

function makeStore(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-enh-"));
	const store = new ResearchStore(dir, { seedDemoData: true });
	t.after(() => {
		clearResearchStoreCache();
		store.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return store;
}

test("current schema: enhancement columns migrate on existing-style init", (t) => {
	const store = makeStore(t);
	assert.equal(RESEARCH_SCHEMA_VERSION, 22);
	const meta = store.db.prepare("SELECT value FROM research_meta WHERE key='schema_version'").get();
	assert.equal(meta.value, "22");
	const paperCols = new Set(store.db.prepare("PRAGMA table_info(papers)").all().map(c => c.name));
	for (const col of ["read_status", "priority", "cited_by_count", "methodology_json", "openalex_id"]) assert.ok(paperCols.has(col), `papers.${col}`);
	const noteCols = new Set(store.db.prepare("PRAGMA table_info(notes)").all().map(c => c.name));
	assert.ok(noteCols.has("linked_paper_id"), "notes.linked_paper_id");
	const projectCols = new Set(store.db.prepare("PRAGMA table_info(projects)").all().map(c => c.name));
	for (const col of ["project_type", "status"]) assert.ok(projectCols.has(col), `projects.${col}`);
	const sourceCols = new Set(store.db.prepare("PRAGMA table_info(journal_sources)").all().map(c => c.name));
	for (const col of ["last_viewed_at", "is_custom", "region"]) assert.ok(sourceCols.has(col), `journal_sources.${col}`);
	const attCols = new Set(store.db.prepare("PRAGMA table_info(attachments)").all().map(c => c.name));
	for (const col of ["last_page", "last_read_at"]) assert.ok(attCols.has(col), `attachments.${col}`);
	const ppCols = new Set(store.db.prepare("PRAGMA table_info(project_papers)").all().map(c => c.name));
	assert.ok(ppCols.has("role"), "project_papers.role");
	// rowToPaper 暴露新字段
	const paper = store.listPapers()[0];
	assert.equal(paper.readStatus, "unread");
	assert.equal(paper.priority, "");
	assert.deepEqual(paper.methodology, []);
	// rowToProject 暴露新字段
	const project = store.listProjects()[0];
	assert.equal(project.status, "active");
	assert.equal(project.projectType, "");
	// 内置期刊源 region：cn / intl 落库
	store.ensureJournalSources([
		{ id: "acta-psychologica-sinica", venue: "心理学报", issn: "0439-755X", topic: "情绪与健康", region: "cn" },
		{ id: "emotion", venue: "Emotion", issn: "1528-3542", topic: "情绪与健康", region: "intl" },
	]);
	const sources = store.listJournalSources();
	assert.equal(sources.find(s => s.id === "acta-psychologica-sinica").region, "cn");
	assert.equal(sources.find(s => s.id === "emotion").region, "intl");
	store.close();
});

test("setPaperStatus: read/priority + audit, invalid values ignored", (t) => {
	const store = makeStore(t);
	const paper = store.listPapers()[0];
	const updated = store.setPaperStatus(paper.id, { readStatus: "reading", priority: "p1" });
	assert.equal(updated.readStatus, "reading");
	assert.equal(updated.priority, "p1");
	// 非法值保持原值
	const kept = store.setPaperStatus(paper.id, { readStatus: "bogus", priority: "p9" });
	assert.equal(kept.readStatus, "reading");
	assert.equal(kept.priority, "p1");
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action='paper.status' ORDER BY id DESC LIMIT 1").get();
	assert.equal(audit.entity_id, paper.id);
	assert.throws(() => store.setPaperStatus("nope", {}), (err) => err.code === "PAPER_NOT_FOUND");
	store.close();
});

test("custom journal source: add, duplicate rejected, audited", (t) => {
	const store = makeStore(t);
	const source = store.addCustomJournalSource({ venue: "Testing Journal", issn: "1234-5679", topic: "测试" });
	assert.ok(source.id.startsWith("custom-"));
	assert.equal(source.isCustom, true);
	assert.equal(source.enabled, true);
	assert.throws(() => store.addCustomJournalSource({ venue: "X", issn: "1234-5679" }), (err) => err.code === "JOURNAL_SOURCE_EXISTS");
	assert.throws(() => store.addCustomJournalSource({ venue: "", issn: "" }), (err) => err.code === "JOURNAL_SOURCE_REQUIRED");
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action='journal.source.custom' ORDER BY id DESC LIMIT 1").get();
	assert.equal(audit.entity_id, source.id);
	store.close();
});

test("journal source manager: normalize, edit, pause, protect built-ins, delete custom", (t) => {
	const store = makeStore(t);
	store.ensureJournalSources([{ id: "emotion", venue: "Emotion", issn: "1528-3542", topic: "情绪与健康" }]);
	const source = store.addCustomJournalSource({ venue: "Testing Journal", issn: "12345679", topic: "测试" });
	assert.equal(source.issn, "1234-5679");
	const edited = store.updateJournalSource(source.id, { venue: "Testing Journal 2", topic: "测量", enabled: false });
	assert.equal(edited.venue, "Testing Journal 2");
	assert.equal(edited.topic, "测量");
	assert.equal(edited.enabled, false);
	const resumed = store.updateJournalSource(source.id, { enabled: true });
	assert.equal(resumed.enabled, true);
	const pausedBuiltin = store.updateJournalSource("emotion", { enabled: false });
	assert.equal(pausedBuiltin.enabled, false);
	assert.throws(() => store.updateJournalSource("emotion", { venue: "X" }), err => err.code === "JOURNAL_SOURCE_BUILTIN_LOCKED");
	assert.throws(() => store.deleteCustomJournalSource("emotion"), err => err.code === "JOURNAL_SOURCE_BUILTIN_LOCKED");
	const removed = store.deleteCustomJournalSource(source.id);
	assert.equal(removed.papersPreserved, true);
	assert.equal(store.listJournalSources().some(item => item.id === source.id), false);
	assert.throws(() => store.addCustomJournalSource({ venue: "Bad", issn: "1234-5678" }), err => err.code === "JOURNAL_SOURCE_REQUIRED");
	store.close();
});

test("touchJournalViewed updates last_viewed_at", (t) => {
	const store = makeStore(t);
	store.ensureJournalSources([{ id: "emotion", venue: "Emotion", issn: "1528-3542", topic: "情绪与健康" }]);
	const before = store.listJournalSources()[0];
	assert.equal(before.lastViewedAt, null);
	store.touchJournalViewed(before.id);
	const after = store.listJournalSources().find(s => s.id === before.id);
	assert.ok(after.lastViewedAt, "last_viewed_at set");
	store.close();
});

test("journalNewCounts counts unread synced papers newer than viewed", (t) => {
	const store = makeStore(t);
	store.ensureJournalSources([{ id: "emotion", venue: "Emotion", issn: "1528-3542", topic: "情绪与健康" }]);
	// 造一篇期刊同步文献（模拟新增）
	store.upsertSearchResult({
		source: "openalex", sourceId: "w-new", doi: "10.9999/new", title: "新文献", authors: "",
		venue: "Emotion", year: 2026, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "期刊同步",
	});
	const counts = store.journalNewCounts();
	assert.ok(counts["emotion"] >= 1, "Emotion has new count");
	// 标记已读后计数归零（该文献 read_status=read）
	store.setPaperStatus(store.listPapers().find(p => p.doi === "10.9999/new").id, { readStatus: "read" });
	const after = store.journalNewCounts();
	assert.equal(after["emotion"], 0);
	store.close();
});

test("citedByCount roundtrip: saved via upsertSearchResult, exposed by rowToPaper", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-cited-"));
	t.after(() => {
		clearResearchStoreCache();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const store = new ResearchStore(dir, { seedDemoData: true });
	const paper = store.upsertSearchResult({
		source: "openalex", sourceId: "w-cited", doi: "10.9999/cited", title: "被引文献", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "OpenAlex",
		citedByCount: 42,
	});
	assert.equal(paper.citedByCount, 42);
	// 重新打开 store（模拟重启）仍能读到
	store.close();
	const store2 = new ResearchStore(dir, { seedDemoData: true });
	const found = store2.listPapers().find(p => p.doi === "10.9999/cited");
	assert.equal(found.citedByCount, 42);
	// 缺失或非法值落库为 null
	const paper2 = store2.upsertSearchResult({
		source: "openalex", sourceId: "w-nocited", doi: "10.9999/nocited", title: "无被引", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "OpenAlex",
	});
	assert.equal(paper2.citedByCount, null);
	// 再次同步时旧值保留（COALESCE）
	const paper3 = store2.upsertSearchResult({
		source: "openalex", sourceId: "w-cited", doi: "10.9999/cited", title: "被引文献（更新）", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "OpenAlex",
	});
	assert.equal(paper3.citedByCount, 42);
	store2.close();
});

test("openalexId roundtrip: W id persisted from openalex source and reused", (t) => {
	const store = makeStore(t);
	const paper = store.upsertSearchResult({
		source: "openalex", sourceId: "W2741809807", doi: "10.9999/oa", title: "OA 文献", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "OpenAlex",
	});
	assert.equal(paper.openalexId, "W2741809807");
	// 非 openalex 源 / 非法 W 号 → null
	const paper2 = store.upsertSearchResult({
		source: "crossref", sourceId: "10.9999/xx", doi: "10.9999/xx", title: "非 OA 源", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "Crossref",
	});
	assert.equal(paper2.openalexId, null);
	// 显式 openalexId 字段优先
	const paper3 = store.upsertSearchResult({
		source: "crossref", sourceId: "10.9999/yy", openalexId: "W555", doi: "10.9999/yy", title: "显式 id", authors: "",
		venue: "Emotion", year: 2025, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "Crossref",
	});
	assert.equal(paper3.openalexId, "W555");
	// 重新读取仍保留
	assert.equal(store.listPapers().find(p => p.doi === "10.9999/oa").openalexId, "W2741809807");
	store.close();
});

test("setReadingProgress stores last page and validates", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const buffer = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(1024, 0x20)]);
	const uploaded = storeUploadedPdf({ store, projectId: project.id, buffer, originalName: "p.pdf", title: "进度测试" });
	const progress = store.setReadingProgress(uploaded.attachment.id, 12);
	assert.equal(progress.lastPage, 12);
	const att = store.getAttachment(uploaded.attachment.id);
	assert.equal(att.lastPage, 12);
	assert.ok(att.lastReadAt);
	assert.throws(() => store.setReadingProgress(uploaded.attachment.id, 0), (err) => err.code === "PAGE_NUMBER_INVALID");
	store.close();
});

test("updateProjectMeta: type/status + audit", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const updated = store.updateProjectMeta(project.id, { projectType: "综述", status: "done" });
	assert.equal(updated.projectType, "综述");
	assert.equal(updated.status, "done");
	// 非法 status 保持原值
	const kept = store.updateProjectMeta(project.id, { status: "bogus" });
	assert.equal(kept.status, "done");
	store.close();
});

test("bibtex: single paper escaping and multi-paper keys", () => {
	const paper = {
		title: "The {Curly} & Ampersand Study_100%",
		authors: "Gross, J. J. & John, O. P.",
		venue: "Journal of Personality & Social Psychology",
		year: 2003,
		doi: "10.1037/0022-3514.85.2.348",
		sourceUrl: "https://doi.org/10.1037/0022-3514.85.2.348",
	};
	const entry = paperToBibtex(paper, 0);
	assert.ok(entry.startsWith("@article{"));
	assert.ok(entry.includes("title = {The \\{Curly\\} \\& Ampersand Study\\_100\\%},"), "special chars escaped");
	assert.ok(entry.includes("doi = {10.1037/0022-3514.85.2.348},"));
	const multi = papersToBibtex([paper, paper]);
	assert.equal((multi.match(/@article\{/g) || []).length, 2, "two entries");
	// key 去重（同文献两次）
	const keys = [...multi.matchAll(/@article\{([^,]+),/g)].map(m => m[1]);
	assert.notEqual(keys[0], keys[1], "duplicate keys avoided");
});

test("ris: single paper fields", () => {
	const ris = paperToRis({
		title: "某研究", authors: "张三, 李四", venue: "心理学报", year: 2024, doi: "10.1/x", abstract: "摘要文本",
	});
	assert.ok(ris.includes("TY  - JOUR"));
	assert.ok(ris.includes("TI  - 某研究"));
	assert.ok(ris.includes("JO  - 心理学报"));
	assert.ok(ris.includes("ER  -"));
});

test("exportCitations format dispatch + file name", () => {
	const papers = [{ title: "A", authors: "", venue: "V", year: 2024 }];
	assert.ok(exportCitations(papers, "bibtex").startsWith("@article{"));
	assert.ok(exportCitations(papers, "RIS").includes("TY  - JOUR"));
	assert.ok(exportFileName("bibtex").endsWith(".bib"));
	assert.ok(exportFileName("ris").endsWith(".ris"));
});

test("bibtexKey stability", () => {
	const a = bibtexKey({ title: "Emotion regulation", authors: "Gross, J. J.", year: 1998 }, 0);
	const b = bibtexKey({ title: "Emotion regulation", authors: "Gross, J. J.", year: 1998 }, 0);
	assert.equal(a, b);
	assert.ok(a.length > 0);
});

test("renameNoteTag merges globally incl. highlight payloads", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	store.createNote({ projectId: project.id, paperId: paper.id, content: "a", tags: ["旧标签", "保留"] });
	store.createNote({ projectId: project.id, paperId: paper.id, content: "b", tags: ["旧标签"] });
	// 关联高亮：造 attachment + 摘录
	const ts = new Date().toISOString();
	store.db.prepare(`
		INSERT INTO attachments(id, paper_id, file_name, relative_path, mime_type, byte_size, sha256, source_url, created_at)
		VALUES('att-tag', ?, 't.pdf', 'library/pdfs/t.pdf', 'application/pdf', 10, 'abc', '', ?)
	`).run(paper.id, ts);
	store.db.prepare("INSERT INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)").run(project.id, paper.id, ts);
	const selection = store.createSelectionNote({
		projectId: project.id, attachmentId: "att-tag", pageNumber: 1,
		quote: "q", content: "摘录", tags: ["旧标签"], rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.1 }],
	});
	assert.ok(selection.annotation?.id);

	const affected = store.renameNoteTag("旧标签", "新标签");
	assert.equal(affected, 3, "two notes + one highlight payload updated");
	const tags = store.listTags(project.id);
	assert.equal(tags.find(x => x.tag === "新标签")?.count, 3);
	assert.equal(tags.find(x => x.tag === "旧标签"), undefined);
	const payload = JSON.parse(store.db.prepare("SELECT payload_json FROM annotations WHERE id = ?").get(selection.annotation.id).payload_json);
	assert.deepEqual(payload.tags, ["新标签"], "highlight payload renamed");
	assert.throws(() => store.renameNoteTag("", "x"), (err) => err.code === "TAG_REQUIRED");
	assert.equal(store.renameNoteTag("新标签", "新标签"), 0);
	store.close();
});

test("removeNoteTag removes from all notes", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	store.createNote({ projectId: project.id, paperId: paper.id, content: "a", tags: ["待删", "留"] });
	store.createNote({ projectId: project.id, paperId: paper.id, content: "b", tags: ["待删"] });
	const affected = store.removeNoteTag("待删");
	assert.equal(affected, 2);
	const tags = store.listTags(project.id);
	assert.equal(tags.find(x => x.tag === "待删"), undefined);
	assert.equal(tags.find(x => x.tag === "留")?.count, 1);
	store.close();
});

test("collections: create/add/map/remove/delete with audit", (t) => {
	const store = makeStore(t);
	const c1 = store.createCollection({ title: "综述材料" });
	const c2 = store.createCollection({ title: "方法参考" });
	assert.ok(c1.id.startsWith("collection-"));
	assert.equal(c1.paperCount, 0);
	assert.throws(() => store.createCollection({ title: "" }), (err) => err.code === "COLLECTION_TITLE_REQUIRED");
	const paper = store.listPapers()[0];
	store.addPaperToCollection(c1.id, paper.id);
	store.addPaperToCollection(c2.id, paper.id);
	store.addPaperToCollection(c1.id, paper.id); // 幂等
	assert.equal(store.listCollections().find(c => c.id === c1.id).paperCount, 1);
	const map = store.paperCollectionMap();
	assert.deepEqual(map.get(paper.id), [c1.id, c2.id]);
	assert.throws(() => store.addPaperToCollection("nope", paper.id), (err) => err.code === "COLLECTION_NOT_FOUND");
	assert.throws(() => store.addPaperToCollection(c1.id, "nope"), (err) => err.code === "PAPER_NOT_FOUND");
	store.removePaperFromCollection(c1.id, paper.id);
	assert.equal(store.listCollections().find(c => c.id === c1.id).paperCount, 0);
	assert.throws(() => store.removePaperFromCollection(c1.id, paper.id), (err) => err.code === "COLLECTION_PAPER_NOT_FOUND");
	store.deleteCollection(c2.id);
	assert.equal(store.listCollections().length, 1);
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action LIKE 'collection.%' ORDER BY id DESC LIMIT 1").get();
	assert.ok(audit, "collection audit row exists");
	store.close();
});

test("setPaperMethodology: tags normalized/deduped/validated + exposed via listPapers", (t) => {
	const store = makeStore(t);
	const paper = store.listPapers()[0];
	const updated = store.setPaperMethodology(paper.id, [" 实验 ", "眼动追踪", "实验", "大学生样本"]);
	assert.deepEqual(updated.methodology, ["实验", "眼动追踪", "大学生样本"]);
	// 重新读取仍保留
	assert.deepEqual(store.listPapers().find(p => p.id === paper.id).methodology, ["实验", "眼动追踪", "大学生样本"]);
	// 空数组清空
	assert.deepEqual(store.setPaperMethodology(paper.id, []).methodology, []);
	// 校验：非数组 / 超长 / 超量
	assert.throws(() => store.setPaperMethodology(paper.id, "x"), (err) => err.code === "METHODOLOGY_INVALID");
	assert.throws(() => store.setPaperMethodology(paper.id, ["x".repeat(25)]), (err) => err.code === "METHODOLOGY_INVALID");
	assert.throws(() => store.setPaperMethodology(paper.id, Array.from({ length: 13 }, (_, i) => `t${i}`)), (err) => err.code === "METHODOLOGY_INVALID");
	assert.throws(() => store.setPaperMethodology("nope", ["实验"]), (err) => err.code === "PAPER_NOT_FOUND");
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action='paper.methodology' ORDER BY id DESC LIMIT 1").get();
	assert.ok(audit, "methodology audit row exists");
	store.close();
});

test("setPaperRole: role set/cleared/validated + exposed via listProjectPapers", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	assert.equal(store.listProjectPapers(project.id).length, 0);
	// 先把文献加入项目
	store.db.prepare("INSERT INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)")
		.run(project.id, paper.id, new Date().toISOString());
	const updated = store.setPaperRole(project.id, paper.id, "core");
	assert.equal(updated.role, "core");
	assert.equal(store.listProjectPapers(project.id).find(p => p.id === paper.id).role, "core");
	// 清空角色
	assert.equal(store.setPaperRole(project.id, paper.id, "").role, "");
	// 非法角色
	assert.throws(() => store.setPaperRole(project.id, paper.id, "bogus"), (err) => err.code === "ROLE_INVALID");
	// 未加入项目的文献
	assert.throws(() => store.setPaperRole(project.id, "nope", "core"), (err) => err.code === "PROJECT_PAPER_NOT_FOUND");
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action='project.paper.role' ORDER BY id DESC LIMIT 1").get();
	assert.ok(audit, "role audit row exists");
	store.close();
});

test("saved searches: CRUD + recordSearchRun new-result detection", (t) => {
	const store = makeStore(t);
	assert.equal(store.listSavedSearches().length, 0);
	const search = store.saveSearch({
		name: "青少年情绪调节",
		query: "adolescent emotion regulation",
		sources: ["openalex", "crossref"],
		perSource: 10,
		filters: { year: 2026 },
	});
	assert.equal(search.name, "青少年情绪调节");
	assert.deepEqual(search.sources, ["openalex", "crossref"]);
	assert.equal(search.perSource, 10);
	assert.equal(search.alertEnabled, false);
	assert.equal(search.lastRunAt, null);
	// 参数校验
	assert.throws(() => store.saveSearch({ name: "", query: "x" }), (err) => err.code === "SEARCH_NAME_REQUIRED");
	assert.throws(() => store.saveSearch({ name: "x", query: "" }), (err) => err.code === "SEARCH_QUERY_REQUIRED");
	// 更新：改名 + 开启提醒
	const renamed = store.updateSavedSearch(search.id, { name: "青少年情绪调节追踪", alertEnabled: true });
	assert.equal(renamed.name, "青少年情绪调节追踪");
	assert.equal(renamed.alertEnabled, true);
	// 记录运行：首次运行不视为新增
	const first = store.recordSearchRun(search.id, ["a", "b", "c"]);
	assert.equal(first.firstRun, true);
	assert.deepEqual(first.newIds, []);
	assert.equal(first.total, 3);
	// 第二次：新增 id
	const second = store.recordSearchRun(search.id, ["a", "c", "d"]);
	assert.equal(second.firstRun, false);
	assert.deepEqual(second.newIds, ["d"]);
	assert.equal(second.total, 3);
	const stored = store.getSavedSearch(search.id);
	assert.equal(stored.lastResultCount, 3);
	assert.ok(stored.lastRunAt, "last_run_at set");
	// 删除
	assert.equal(store.deleteSavedSearch(search.id), true);
	assert.equal(store.getSavedSearch(search.id), null);
	assert.throws(() => store.deleteSavedSearch(search.id), (err) => err.code === "SEARCH_NOT_FOUND");
	assert.throws(() => store.recordSearchRun("nope", []), (err) => err.code === "SEARCH_NOT_FOUND");
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action LIKE 'search.%' ORDER BY id DESC LIMIT 1").get();
	assert.ok(audit, "search audit row exists");
	store.close();
});

test("paper relations: add/list/remove with validation + audit", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const papers = store.listPapers().slice(0, 2);
	// 先把两篇文献加入项目
	for (const paper of papers) {
		store.db.prepare("INSERT INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)")
			.run(project.id, paper.id, new Date().toISOString());
	}
	const rel = store.addPaperRelation({
		projectId: project.id,
		fromPaperId: papers[0].id,
		toPaperId: papers[1].id,
		relation: "supports",
		note: "结果一致",
	});
	assert.equal(rel.relation, "supports");
	assert.equal(rel.fromTitle, papers[0].title);
	assert.equal(rel.toTitle, papers[1].title);
	// 列表
	const list = store.listPaperRelations(project.id);
	assert.equal(list.length, 1);
	// 校验：非法关系 / 自身 / 未入项目 / 重复
	assert.throws(() => store.addPaperRelation({ projectId: project.id, fromPaperId: papers[0].id, toPaperId: papers[1].id, relation: "bogus" }), (err) => err.code === "RELATION_INVALID");
	assert.throws(() => store.addPaperRelation({ projectId: project.id, fromPaperId: papers[0].id, toPaperId: papers[0].id, relation: "supports" }), (err) => err.code === "RELATION_SELF");
	assert.throws(() => store.addPaperRelation({ projectId: project.id, fromPaperId: papers[0].id, toPaperId: "nope", relation: "supports" }), (err) => err.code === "RELATION_PAPER_NOT_IN_PROJECT");
	assert.throws(() => store.addPaperRelation({ projectId: project.id, fromPaperId: papers[0].id, toPaperId: papers[1].id, relation: "supports" }), (err) => err.code === "RELATION_EXISTS");
	// 反向关系合法
	store.addPaperRelation({ projectId: project.id, fromPaperId: papers[1].id, toPaperId: papers[0].id, relation: "refutes" });
	assert.equal(store.listPaperRelations(project.id).length, 2);
	// 删除
	assert.equal(store.removePaperRelation(rel.id), true);
	assert.equal(store.listPaperRelations(project.id).length, 1);
	assert.throws(() => store.removePaperRelation(rel.id), (err) => err.code === "RELATION_NOT_FOUND");
	// 审计
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action LIKE 'paper.relation.%' ORDER BY id DESC LIMIT 1").get();
	assert.ok(audit, "relation audit row exists");
	store.close();
});

test("cross-paper notes: linkedPaperId validated + exposed + in markdown", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const papers = store.listPapers();
	const note = store.createNote({
		projectId: project.id,
		content: "与另一篇文献对比",
		linkedPaperId: papers[1].id,
	});
	assert.equal(note.linkedPaperId, papers[1].id);
	assert.equal(note.linkedPaperTitle, papers[1].title);
	// 不存在的关联文献
	assert.throws(() => store.createNote({ projectId: project.id, content: "x", linkedPaperId: "nope" }), (err) => err.code === "LINKED_PAPER_NOT_FOUND");
	// 列表带关联
	const listed = store.listNotes(project.id).find(n => n.id === note.id);
	assert.equal(listed.linkedPaperTitle, papers[1].title);
	// Markdown 导出包含关联
	const file = store.getProjectNotesFile(project.id);
	assert.ok(file.body.includes(`关联《${papers[1].title}》`), "markdown includes linked paper");
	store.close();
});

test("buildEvidenceMatrix: aggregates per-paper notes, tags, relations", (t) => {
	const store = makeStore(t);
	const project = store.listProjects()[0];
	const papers = store.listPapers().slice(0, 2);
	for (const paper of papers) {
		store.db.prepare("INSERT INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)")
			.run(project.id, paper.id, new Date().toISOString());
	}
	store.setPaperRole(project.id, papers[0].id, "core");
	store.setPaperMethodology(papers[0].id, ["实验", "眼动追踪"]);
	store.createNote({ projectId: project.id, paperId: papers[0].id, content: "核心发现一", tags: ["关键证据"] });
	store.createNote({ projectId: project.id, paperId: papers[0].id, content: "核心发现二" });
	store.addPaperRelation({ projectId: project.id, fromPaperId: papers[0].id, toPaperId: papers[1].id, relation: "supports" });
	const matrix = store.buildEvidenceMatrix(project.id);
	assert.equal(matrix.papers.length, 2);
	const row = matrix.papers.find(p => p.id === papers[0].id);
	assert.equal(row.role, "core");
	assert.equal(row.design, "实验、眼动追踪");
	assert.equal(row.noteCount, 2);
	assert.ok(row.notesSummary.includes("核心发现一"));
	assert.ok(row.tags.includes("关键证据"));
	assert.equal(matrix.relations.length, 1);
	assert.ok(matrix.relations[0].includes("支持"));
	store.close();
});
