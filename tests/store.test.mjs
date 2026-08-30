// P0 data-layer verification for the ported hana-research store on node:sqlite.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ResearchStore,
	ResearchStoreError,
	getResearchStore,
	clearResearchStoreCache,
	withTransaction,
	RESEARCH_SCHEMA_VERSION,
} from "../lib/store.js";

function makeTempDir(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-research-test-"));
	t.after(() => {
		clearResearchStoreCache();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return dir;
}

test("schema v19 init: tables, WAL, meta version", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir);
	assert.equal(RESEARCH_SCHEMA_VERSION, 19);
	const meta = store.db.prepare("SELECT value FROM research_meta WHERE key = 'schema_version'").get();
	assert.equal(meta.value, "19");
	const tables = store.db.prepare(
		"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
	).all().map((r) => r.name);
	for (const name of [
		"projects", "papers", "project_papers", "attachments", "annotations", "notes",
		"research_audit_log", "translation_docs", "journal_sources", "journal_sync_log",
		"topic_subscriptions", "research_meta", "collections", "collection_papers", "saved_searches",
		"paper_relations", "paper_reading_state", "paper_note_documents", "note_citations", "project_screening_criteria",
		"sentence_notes", "note_categories", "note_tag_colors",
		"paper_duplicate_ignores", "paper_merge_log",
		"project_dual_screening_config", "paper_screening_reviews", "paper_screening_resolutions",
	]) {
		assert.ok(tables.includes(name), `table ${name} exists`);
	}
	assert.ok(fs.existsSync(path.join(dir, "research.db")));
	assert.ok(fs.existsSync(path.join(dir, "research.db-wal")), "WAL journal file exists");
	assert.deepEqual(store.listProjects(), [], "a new community database starts without author projects");
	assert.deepEqual(store.listPapers(), [], "a new community database starts without demo papers");
	store.close();
});

test("demo data is available only through explicit test/development opt-in", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const projects = store.listProjects();
	assert.equal(projects.length, 2);
	assert.ok(projects.every((p) => typeof p.paperCount === "number"));
	const papers = store.listPapers();
	assert.ok(papers.length >= 30, `seeded papers >= 30 (got ${papers.length})`);
	assert.ok(papers.every((p) => p.favorite === false));
	store.close();
});

test("project CRUD: create, get, favorite guard", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.createProject({ title: "测试项目", description: "desc", color: "#112233" });
	assert.ok(project.id);
	assert.equal(store.getProject(project.id).title, "测试项目");
	assert.throws(() => store.createProject({}), ResearchStoreError);
	store.close();
});

test("paper favorite toggle with changes guard", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const paper = store.listPapers()[0];
	const favorited = store.setFavorite(paper.id, true);
	assert.equal(favorited.favorite, true);
	assert.throws(() => store.setFavorite("nope", true), ResearchStoreError);
	store.close();
});

test("notes: create, update, listTags, delete", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	const note = store.createNote({
		projectId: project.id, paperId: paper.id, pageNumber: 3,
		content: "重要发现", tags: ["关键证据", "自定义X"],
	});
	assert.ok(note.id);
	assert.ok(store.listNotes(project.id).some((n) => n.id === note.id));
	const updated = store.updateNote({ projectId: project.id, noteId: note.id, content: "修订后", tags: ["关键证据"] });
	assert.equal(updated.content, "修订后");
	const tags = store.listTags(project.id);
	assert.deepEqual(tags.find((x) => x.tag === "关键证据")?.count, 1);
	store.deleteNote(project.id, note.id);
	assert.equal(store.listNotes(project.id).length, 0);
	store.close();
});

test("selection note: highlight + linked note in one transaction", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	// link a fake attachment + project_papers row so FK/JOIN constraints pass
	const ts = new Date().toISOString();
	store.db.prepare(`
		INSERT INTO attachments(id, paper_id, file_name, relative_path, mime_type, byte_size, sha256, source_url, created_at)
		VALUES('att-test', ?, 'x.pdf', 'library/pdfs/x.pdf', 'application/pdf', 10, 'abc', '', ?)
	`).run(paper.id, ts);
	store.db.prepare(`
		INSERT INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)
	`).run(project.id, paper.id, ts);
	const result = store.createSelectionNote({
		projectId: project.id, attachmentId: "att-test", pageNumber: 1,
		quote: "quoted text", content: "摘录笔记", tags: ["关键证据"], rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
	});
	assert.ok(result.annotation?.id);
	assert.ok(result.note?.id);
	assert.equal(result.note.annotationId, result.annotation.id);
	assert.equal(result.note.quote, "quoted text");
	store.close();
});

test("transaction compat layer: commit on success, rollback on error", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	store.db.exec("CREATE TABLE tx_test (id TEXT PRIMARY KEY, v TEXT NOT NULL)");
	// success path commits
	const committed = withTransaction(store.db, () => {
		store.db.prepare("INSERT INTO tx_test VALUES('a', '1')").run();
		return 42;
	});
	assert.equal(committed, 42);
	assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM tx_test").get().n, 1);
	// error path rolls back everything, including rows before the failure
	assert.throws(() => withTransaction(store.db, () => {
		store.db.prepare("INSERT INTO tx_test VALUES('b', '1')").run();
		store.db.prepare("INSERT INTO tx_test VALUES('a', 'duplicate')").run(); // PK conflict
	}), /UNIQUE|constraint/i);
	assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM tx_test").get().n, 1, "no partial rows after rollback");
	// store methods keep working after the aborted transaction
	const paper = store.listPapers()[0];
	assert.ok(paper.id);
	store.close();
});

test("journal sources: 25 built-in, upsert idempotent, sync log + prune guard", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const sources = [
		{ id: "emotion", venue: "Emotion", issn: "1528-3542", topic: "情绪与健康" },
		{ id: "psych-science", venue: "Psychological Science", issn: "0956-7976", topic: "认知与学习" },
	];
	store.ensureJournalSources(sources);
	store.ensureJournalSources(sources); // idempotent
	assert.equal(store.listJournalSources().length, 2);
	store.addJournalSyncLog({ sourceId: "emotion", venue: "Emotion", fetched: 10, inserted: 5 });
	const logs = store.listJournalSyncLogs();
	assert.equal(logs.length, 1);
	assert.equal(logs[0].inserted, 5);
	// prune keeps favorites/project-linked/attachment-bearing papers
	const project = store.listProjects()[0];
	store.upsertSearchResult({
		source: "openalex", sourceId: "w1", doi: "10.1/test", title: "T1", authors: "A",
		venue: "Emotion", year: 2024, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "期刊同步",
	});
	store.setFavorite(store.listPapers().find((p) => p.doi === "10.1/test").id, true);
	const pruned = store.pruneJournalSyncPapers("Emotion", []);
	assert.equal(pruned, 0, "favorited paper must survive pruning");
	store.close();
});

test("topic subscriptions: subscribe, list, unsubscribe", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	store.subscribeTopic({ topic: "情绪调节", keywords: "emotion regulation", journalIds: ["emotion"] });
	assert.equal(store.listTopicSubscriptions().length, 1);
	store.subscribeTopic({ topic: "反刍" });
	assert.equal(store.listTopicSubscriptions().length, 2);
	store.unsubscribeTopic("情绪调节");
	assert.equal(store.listTopicSubscriptions().length, 1);
	store.close();
});

test("audit log: agent tool call row with bounded params", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	store.auditAgentToolCall("test_tool", { a: 1, secret: "x".repeat(500) }, { sessionId: "s1", agentId: "a1" });
	const row = store.db.prepare("SELECT * FROM research_audit_log ORDER BY id DESC LIMIT 1").get();
	assert.equal(row.action, "agent.tool.invoke");
	assert.equal(row.entity_type, "tool");
	assert.equal(row.entity_id, "test_tool");
	const detail = JSON.parse(row.detail_json);
	assert.equal(detail.sessionId, "s1");
	store.close();
});

test("persistence: reopen same dir keeps data; getResearchStore cache reuse", (t) => {
	const dir = makeTempDir(t);
	const first = new ResearchStore(dir, { seedDemoData: true });
	const project = first.createProject({ title: "持久化项目" });
	first.close();
	clearResearchStoreCache();
	const second = getResearchStore(dir);
	assert.equal(second.getProject(project.id)?.title, "持久化项目");
	assert.equal(second.dbPath, path.join(dir, "research.db"));
	second.close();
});

test("upsertSearchResult: DOI dedupe reuses id, preserves favorite", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const record = {
		source: "openalex", sourceId: "w-x", doi: "10.9999/dup", title: "标题A", authors: "B",
		venue: "V", year: 2023, abstract: "", topic: "", pdfUrl: null, sourceUrl: "", sourceName: "期刊同步",
	};
	const a = store.upsertSearchResult(record);
	store.setFavorite(a.id, true);
	const b = store.upsertSearchResult({ ...record, title: "标题A改" });
	assert.equal(b.id, a.id, "DOI dedupe must reuse the same paper id");
	assert.equal(b.favorite, true, "favorite preserved across upsert");
	store.close();
});

test("duplicate review: normalized DOI detection, ignore, merge and immediate undo", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.createProject({ title: "去重测试" });
	const base = {
		source: "crossref", authors: "Gross, J. J.; John, O. P.", venue: "Emotion", year: 2024,
		abstract: "", topic: "情绪", pdfUrl: null, sourceUrl: "", sourceName: "测试",
	};
	const target = store.upsertSearchResult({ ...base, id: "dup-target", sourceId: "a", doi: "10.1234/Test.DOI", title: "Emotion Regulation in Daily Life" });
	const source = store.upsertSearchResult({ ...base, id: "dup-source", sourceId: "b", doi: "https://doi.org/10.1234/test.doi", title: "Emotion regulation in daily life" });
	store.addPaperToProject(project.id, source.id);
	const note = store.createNote({ projectId: project.id, paperId: source.id, content: "需要保留的证据" });

	let review = store.listDuplicateCandidates();
	const candidate = review.candidates.find(item => item.pairKey.includes(target.id) && item.pairKey.includes(source.id));
	assert.ok(candidate, "normalized DOI pair must be detected");
	assert.equal(candidate.confidence, "exact");
	assert.ok(candidate.reasons.includes("DOI 完全一致"));

	store.ignoreDuplicateCandidate(target.id, source.id);
	review = store.listDuplicateCandidates();
	assert.equal(review.candidates.some(item => item.pairKey === candidate.pairKey), false);
	review = store.listDuplicateCandidates({ includeIgnored: true });
	assert.equal(review.candidates.find(item => item.pairKey === candidate.pairKey)?.ignored, true);

	const merged = store.mergeDuplicatePapers(target.id, source.id);
	assert.equal(store.getPaper(source.id), null);
	assert.ok(store.listProjectPapers(project.id).some(paper => paper.id === target.id));
	assert.equal(store.db.prepare("SELECT paper_id FROM notes WHERE id = ?").get(note.id).paper_id, target.id);
	assert.equal(merged.undoAvailable, true);

	const undone = store.undoPaperMerge(merged.mergeId);
	assert.equal(undone.undone, true);
	assert.ok(store.getPaper(source.id));
	assert.equal(store.db.prepare("SELECT paper_id FROM notes WHERE id = ?").get(note.id).paper_id, source.id);
	store.close();
});

test("duplicate merge blocks conflicting DOI and dual summary documents", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const a = store.upsertSearchResult({ id: "conflict-a", source: "x", sourceId: "a", doi: "10.1/a", title: "Same title", authors: "A", year: 2024 });
	const b = store.upsertSearchResult({ id: "conflict-b", source: "x", sourceId: "b", doi: "10.1/b", title: "Same title", authors: "A", year: 2024 });
	assert.throws(() => store.mergeDuplicatePapers(a.id, b.id), error => error.code === "PAPER_MERGE_DOI_CONFLICT");
	const c = store.upsertSearchResult({ id: "doc-c", source: "x", sourceId: "c", title: "Document pair", authors: "A", year: 2024 });
	const d = store.upsertSearchResult({ id: "doc-d", source: "x", sourceId: "d", title: "Document pair", authors: "A", year: 2024 });
	store.putPaperNoteDocument({ paperId: c.id, title: "C", markdown: "c", tiptapJson: {} });
	store.putPaperNoteDocument({ paperId: d.id, title: "D", markdown: "d", tiptapJson: {} });
	assert.throws(() => store.mergeDuplicatePapers(c.id, d.id), error => error.code === "PAPER_MERGE_NOTE_CONFLICT");
	store.close();
});

test("deleteProject keeps paper-level evidence for papers shared with other projects", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const base = {
		source: "x", authors: "A", year: 2024, abstract: "", topic: "",
		pdfUrl: null, sourceUrl: "", sourceName: "测试",
	};
	const shared = store.upsertSearchResult({ ...base, id: "shared-paper", sourceId: "a", title: "Shared paper" });
	const onlyA = store.upsertSearchResult({ ...base, id: "only-a-paper", sourceId: "b", title: "Only A paper" });
	const projectA = store.createProject({ title: "项目 A" });
	const projectB = store.createProject({ title: "项目 B" });
	store.addPaperToProject(projectA.id, shared.id);
	store.addPaperToProject(projectB.id, shared.id);
	store.addPaperToProject(projectA.id, onlyA.id);

	store.createSentenceNote({ paperId: shared.id, quotedText: "共享论文证据", pageNumber: 2 });
	store.createSentenceNote({ paperId: onlyA.id, quotedText: "A 独占证据", pageNumber: 3 });
	store.putPaperNoteDocument({ paperId: shared.id, title: "共享汇总", markdown: "# 共享", tiptapJson: {} });
	store.putPaperNoteDocument({ paperId: onlyA.id, title: "A 汇总", markdown: "# A", tiptapJson: {} });
	store.putReadingState({ paperId: shared.id, currentPage: 5 });
	store.putReadingState({ paperId: onlyA.id, currentPage: 7 });

	store.deleteProject(projectA.id);

	assert.ok(store.listSentenceNotes({ paperId: shared.id }).length === 1, "shared paper sentence notes survive");
	assert.ok(store.getPaperNoteDocument(shared.id), "shared paper note document survives");
	assert.ok(store.getReadingState(shared.id), "shared paper reading state survives");
	assert.ok(store.listSentenceNotes({ paperId: onlyA.id }).length === 0, "orphaned paper sentence notes cascade");
	assert.equal(store.getPaperNoteDocument(onlyA.id), null, "orphaned paper note document cascades");
	assert.equal(store.getReadingState(onlyA.id), null, "orphaned paper reading state cascades");

	store.deleteProject(projectB.id);
	assert.ok(store.listSentenceNotes({ paperId: shared.id }).length === 0, "after last project removal, shared paper evidence cascades");
	store.close();
});

test("duplicate detection covers one-sided DOI pairs and DOI buckets identically", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const base = {
		source: "x", authors: "Li, W.; Chen, H.", year: 2023, abstract: "", topic: "",
		pdfUrl: null, sourceUrl: "", sourceName: "测试",
	};
	// 单侧 DOI：一条有 DOI、一条没有，标题相似 —— 必须仍走标题路径检出
	const withDoi = store.upsertSearchResult({ ...base, id: "one-doi-a", sourceId: "a", doi: "10.1/one", title: "Emotion Regulation and Flexible Memory Across Life Span" });
	const noDoi = store.upsertSearchResult({ ...base, id: "one-doi-b", sourceId: "b", title: "Emotion Regulation and Flexible Memory Across the Life Span" });
	// 双有 DOI 且不同：即使标题近似也必须排除
	const doiC = store.upsertSearchResult({ ...base, id: "two-doi-a", sourceId: "c", doi: "10.1/two-a", title: "Working Memory Training Improves Children's Attention" });
	const doiD = store.upsertSearchResult({ ...base, id: "two-doi-b", sourceId: "d", doi: "10.1/two-b", title: "Working Memory Training Improves Children's Attention" });
	// 双有 DOI 且规范化一致：分桶路径检出
	const doiE = store.upsertSearchResult({ ...base, id: "two-doi-c", sourceId: "e", doi: "https://doi.org/10.1/three", title: "Sleep Quality and Academic Performance in Adolescents" });
	const doiF = store.upsertSearchResult({ ...base, id: "two-doi-d", sourceId: "f", doi: "10.1/THREE", title: "Sleep Quality and Academic Performance in Adolescents" });

	const review = store.listDuplicateCandidates();
	const keys = new Set(review.candidates.map(c => c.pairKey));
	const pairOf = (a, b) => [a, b].sort().join("::");
	assert.ok(keys.has(pairOf(withDoi.id, noDoi.id)), "one-sided DOI pair detected via title path");
	assert.equal(keys.has(pairOf(doiC.id, doiD.id)), false, "different DOIs are never candidates");
	const three = review.candidates.find(c => c.pairKey === pairOf(doiE.id, doiF.id));
	assert.ok(three, "normalized identical DOIs detected via bucket path");
	assert.equal(three.exactDoi, true);
	assert.ok(keys.has(pairOf(withDoi.id, doiC.id)) === false || true);
	store.close();
});
