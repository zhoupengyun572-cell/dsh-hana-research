// v9 验证：笔记更新 PATCH 路由 + reader 接口 notes 按附件过滤。
// 通过 createApiHandler 直接驱动路由表，不依赖网络。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";
import { storeUploadedPdf } from "../lib/pdf-import.js";

function makeCtx() {
	return {
		logger: { error: () => {}, info: () => {} },
		agentDefaultModel: { currentSelection: () => ({ provider: "test", model: "test" }) },
		get: () => undefined,
	};
}

/** 构造最小可请求对象，直接调用 handler.handle。 */
function request(api, method, pathname, body) {
	const handler = api.handle;
	const req = { method, headers: { "content-type": "application/json" } };
	const res = { _status: 0, _body: null, writeHead(status) { this._status = status; }, end(chunk) { this._body = chunk; } };
	const url = new URL("http://dsh.local/api/hana-research" + pathname);
	const rawBody = body === undefined ? null : Buffer.from(JSON.stringify(body));
	req[Symbol.asyncIterator] = async function* () {
		if (rawBody) yield rawBody;
	};
	return handler(req, res, url).then(() => {
		let parsed = null;
		try { parsed = JSON.parse(res._body); } catch { /* ignore */ }
		return { status: res._status, body: parsed };
	});
}

test("PATCH /projects/:id/notes/:noteId updates content/tags/quote", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-v9-"));
	const store = new ResearchStore(dir);
	t.after(() => { clearResearchStoreCache(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const api = createApiHandler(makeCtx(), store);

	const project = store.createProject({ title: "API 验证", description: "d" });
	const buffer = Buffer.alloc(4096, 0x20);
	buffer.write("%PDF-1.7\n", 0, "latin1");
	const uploaded = storeUploadedPdf({ store, projectId: project.id, buffer, originalName: "paper.pdf", title: "路由验证论文" });
	const attachmentId = uploaded.attachment.id;
	const note = store.createSelectionNote({
		projectId: project.id, attachmentId, pageNumber: 2,
		quote: "原引用", content: "原正文", tags: ["关键证据"],
		rects: [{ x: 0, y: 0, width: .3, height: .1 }], color: "#8bb8e8",
	});

	// reader 接口：notes 限定本附件
	const readerRes = await request(api, "GET", `/projects/${project.id}/reader/${attachmentId}`);
	assert.equal(readerRes.status, 200);
	assert.equal(readerRes.body.notes.length, 1);
	assert.equal(readerRes.body.notes[0].id, note.note.id);

	// PATCH 更新
	const patch = await request(api, "PATCH", `/projects/${project.id}/notes/${note.note.id}`, {
		content: "新正文", tags: ["方法"], quote: "新引用",
	});
	assert.equal(patch.status, 200);
	assert.equal(patch.body.note.content, "新正文");
	assert.deepEqual(patch.body.note.tags, ["方法"]);
	assert.equal(patch.body.note.quote, "新引用");
	assert.equal(patch.body.note.annotationId, note.annotation.id, "annotation link kept");

	// PATCH 空内容 → 400
	const bad = await request(api, "PATCH", `/projects/${project.id}/notes/${note.note.id}`, { content: "   " });
	assert.equal(bad.status, 400);
	assert.equal(bad.body.error, "NOTE_CONTENT_REQUIRED");
});

// ── P6 宿主能力 / 驾驶舱聚合 路由级验证（不依赖重启，直驱路由表） ──

test("GET /capabilities advertises evidence/cockpitStats/settings", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-caps-"));
	const store = new ResearchStore(dir);
	t.after(() => { clearResearchStoreCache(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const api = createApiHandler(makeCtx(), store);

	const res = await request(api, "GET", "/capabilities");
	assert.equal(res.status, 200);
	assert.equal(res.body.evidence, true);
	assert.equal(res.body.screening, true);
	assert.equal(res.body.evidenceCoding, true);
	assert.equal(res.body.cockpitStats, true);
	assert.equal(res.body.settings, true);
});

test("GET /papers paginates and filters while preserving legacy full response", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-papers-page-"));
	const store = new ResearchStore(dir);
	t.after(() => { clearResearchStoreCache(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const api = createApiHandler(makeCtx(), store);

	const legacy = await request(api, "GET", "/papers");
	assert.equal(legacy.status, 200);
	assert.ok(legacy.body.papers.length >= 30);
	assert.equal(legacy.body.pagination, undefined);

	const first = await request(api, "GET", "/papers?paged=1&page=1&pageSize=20");
	assert.equal(first.status, 200);
	assert.equal(first.body.papers.length, 20);
	assert.equal(first.body.pagination.page, 1);
	assert.equal(first.body.pagination.pageSize, 20);
	assert.equal(first.body.pagination.total, legacy.body.papers.length);
	assert.equal(first.body.facets.libraryTotal, legacy.body.papers.length);
	assert.ok(first.body.facets.topics.length > 0);

	const target = legacy.body.papers[0];
	const filtered = await request(api, "GET", `/papers?paged=1&pageSize=20&venue=${encodeURIComponent(target.venue)}`);
	assert.equal(filtered.status, 200);
	assert.ok(filtered.body.papers.length > 0);
	assert.ok(filtered.body.papers.every(paper => paper.venue === target.venue));
});

test("GET /projects/:id/cockpit-stats aggregates via route", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-cockpit-"));
	const store = new ResearchStore(dir);
	t.after(() => { clearResearchStoreCache(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const api = createApiHandler(makeCtx(), store);

	const project = store.createProject({ title: "驾驶舱路由", description: "研究问题描述" });
	const buffer = Buffer.alloc(4096, 0x20);
	buffer.write("%PDF-1.7\n", 0, "latin1");
	const up = storeUploadedPdf({ store, projectId: project.id, buffer, originalName: "cockpit.pdf", title: "驾驶舱论文" });
	store.setPaperStatus(up.paper.id, { readStatus: "read" });
	store.createSentenceNote({
		paperId: up.paper.id, attachmentId: up.attachment.id, annotationId: "anno-api-cockpit-1",
		quotedText: "证据摘录", comment: "我的理解", pageNumber: 2, evidence: { question: "Q", method: "M", limitation: "L", section: "讨论" },
	});
	store.createNote({ projectId: project.id, content: "写综述", tags: ["研究任务", "状态:待办", "优先级:高"] });
	store.putReadingState({ paperId: up.paper.id, currentPage: 3 });

	const res = await request(api, "GET", `/projects/${project.id}/cockpit-stats`);
	assert.equal(res.status, 200);
	assert.equal(res.body.papers.total, 1);
	assert.equal(res.body.papers.withPdf, 1);
	assert.equal(res.body.papers.read, 1);
	assert.equal(res.body.evidence.sentenceNotes, 1);
	assert.equal(res.body.tasks.todo, 1);
	assert.equal(res.body.tasks.open[0].priority, "高");
	assert.equal(res.body.reading.length, 1);
	assert.equal(res.body.reading[0].page, 3);
	assert.equal(res.body.candidates.length, 0, "已精读（有逐句笔记）不再列为证据缺口");

	// 不存在的项目 → 404
	const missing = await request(api, "GET", "/projects/no-such/cockpit-stats");
	assert.equal(missing.status, 404);
});

test("journal manager routes create, edit, pause and remove custom sources", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-journals-"));
	const store = new ResearchStore(dir);
	t.after(() => { clearResearchStoreCache(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const api = createApiHandler(makeCtx(), store);

	const created = await request(api, "POST", "/journals/custom", { venue: "Testing Journal", issn: "12345679", topic: "测量" });
	assert.equal(created.status, 201);
	assert.equal(created.body.source.issn, "1234-5679");
	const id = created.body.source.id;

	const edited = await request(api, "PATCH", `/journals/${id}`, { venue: "Testing Journal 2", topic: "方法", enabled: false });
	assert.equal(edited.status, 200);
	assert.equal(edited.body.source.venue, "Testing Journal 2");
	assert.equal(edited.body.source.enabled, false);

	const blockedSync = await request(api, "POST", `/journals/${id}/sync`);
	assert.equal(blockedSync.status, 409);
	assert.equal(blockedSync.body.error, "JOURNAL_SOURCE_DISABLED");

	const removed = await request(api, "DELETE", `/journals/${id}`);
	assert.equal(removed.status, 200);
	assert.equal(removed.body.papersPreserved, true);
	assert.equal(store.listJournalSources().some(source => source.id === id), false);
});
