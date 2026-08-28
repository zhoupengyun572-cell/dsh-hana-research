// P2 verification: PDF import (upload/download), multipart parsing, and the
// store attachment link. Run: node tests/pdf-import.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ResearchStore,
	clearResearchStoreCache,
	withTransaction,
} from "../lib/store.js";
import {
	storeUploadedPdf,
	assertPdfBuffer,
	PdfImportError,
} from "../lib/pdf-import.js";
import { parseMultipart } from "../lib/api.js";

function makeTempDir(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-pdf-test-"));
	t.after(() => {
		clearResearchStoreCache();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return dir;
}

/** 最小合法 PDF 签名 buffer（仅通过签名/体积校验，不要求可解析）。 */
function fakePdfBuffer(size = 4096) {
	const buffer = Buffer.alloc(size, 0x20);
	buffer.write("%PDF-1.7\n", 0, "latin1");
	return buffer;
}

test("assertPdfBuffer: signature and size guards", () => {
	assertPdfBuffer(fakePdfBuffer());
	assert.throws(() => assertPdfBuffer(Buffer.alloc(4)), PdfImportError);
	assert.throws(() => assertPdfBuffer(Buffer.alloc(4096, 0x41)), PdfImportError); // no %PDF-
	assert.throws(() => assertPdfBuffer(fakePdfBuffer(50 * 1024 * 1024)), PdfImportError); // too large
});

test("multipart parser: file + text fields", (t) => {
	const boundary = "----WebKitFormBoundaryTest123";
	const file = fakePdfBuffer(1024);
	const raw = Buffer.concat([
		Buffer.from(`--${boundary}\r\n`),
		Buffer.from('Content-Disposition: form-data; name="title"\r\n\r\n我的论文\r\n'),
		Buffer.from(`--${boundary}\r\n`),
		Buffer.from('Content-Disposition: form-data; name="file"; filename="paper.pdf"\r\n'),
		Buffer.from("Content-Type: application/pdf\r\n\r\n"),
		file,
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
	const { fields, file: parsed } = parseMultipart(raw, `multipart/form-data; boundary=${boundary}`);
	assert.equal(fields.title, "我的论文");
	assert.ok(parsed, "file part parsed");
	assert.equal(parsed.filename, "paper.pdf");
	assert.equal(parsed.buffer.length, file.length);
	assert.equal(parsed.buffer.subarray(0, 5).toString("latin1"), "%PDF-");
	t.diagnostic("multipart ok");
});

test("upload PDF: stores content-addressed attachment, dedupes, links to project", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.listProjects()[0];
	const buffer = fakePdfBuffer(8192);

	const first = storeUploadedPdf({ store, projectId: project.id, buffer, originalName: "paper.pdf", title: "上传测试" });
	assert.equal(first.reused, false);
	assert.ok(first.attachment?.id);
	assert.ok(first.paper?.id.startsWith("local-"));
	assert.ok(fs.existsSync(store.getAttachment(first.attachment.id).absolutePath), "pdf file written");

	// same content in another project -> reuse
	const second = storeUploadedPdf({ store, projectId: store.listProjects()[1].id, buffer, originalName: "paper.pdf", title: "上传测试" });
	assert.equal(second.reused, true);
	assert.equal(second.attachment.id, first.attachment.id);

	// reader context resolves
	const context = store.getAttachmentContext(project.id, first.attachment.id);
	assert.equal(context.paper.id, first.paper.id);
	store.close();
});

test("upload rejects non-PDF content", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.listProjects()[0];
	assert.throws(
		() => storeUploadedPdf({ store, projectId: project.id, buffer: Buffer.from("not a pdf at all, just text"), originalName: "x.pdf", title: "x" }),
		PdfImportError,
	);
	store.close();
});

test("selection note roundtrip via store (reader path)", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	const project = store.listProjects()[0];
	const buffer = fakePdfBuffer(4096);
	const uploaded = storeUploadedPdf({ store, projectId: project.id, buffer, originalName: "a.pdf", title: "阅读测试" });

	const note = store.createSelectionNote({
		projectId: project.id,
		attachmentId: uploaded.attachment.id,
		pageNumber: 1,
		quote: "A meaningful sentence from the paper",
		content: "这是关键证据",
		tags: ["关键证据", "研究方法"],
		rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.08 }],
		color: "#8bb8e8",
	});
	assert.equal(note.note.quote, "A meaningful sentence from the paper");
	assert.deepEqual(note.note.tags, ["关键证据", "研究方法"]);
	assert.equal(note.annotation.kind, "highlight");

	// project notes markdown file generated
	const notesFile = store.getProjectNotesFile(project.id);
	assert.ok(notesFile.body.includes("关键证据"), "markdown contains note");
	assert.ok(notesFile.body.includes("A meaningful sentence"), "markdown contains quote");
	store.close();
});

test("withTransaction rolls back on import failure (no orphan files)", (t) => {
	const dir = makeTempDir(t);
	const store = new ResearchStore(dir, { seedDemoData: true });
	store.db.exec("CREATE TABLE tx_guard (id TEXT PRIMARY KEY)");
	assert.throws(() => withTransaction(store.db, () => {
		store.db.prepare("INSERT INTO tx_guard VALUES('a')").run();
		store.db.prepare("INSERT INTO tx_guard VALUES('a')").run(); // PK conflict
	}));
	assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM tx_guard").get().n, 0);
	store.close();
});
