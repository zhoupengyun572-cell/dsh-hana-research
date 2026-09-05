// P0-1 verification: full-text index (schema v21), CJK segmentation, page-level
// extraction via vendored pdf.js, queue rebuild, and search API.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { segmentCjk, buildMatchQuery, restoreCjkSpacing, indexAttachment, rebuildFulltextIndex } from "../lib/fulltext-index.js";
import { createApiHandler } from "../lib/api.js";
import { DatabaseSync } from "node:sqlite";

/** 构建带正确 xref 的最小多页 PDF（纯 ASCII 文本，pdf.js 可解析）。 */
function buildTestPdf(pageTexts) {
  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`);
  const fontId = 3 + pageTexts.length * 2;
  pageTexts.forEach((text, index) => {
    const contentId = 4 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const stream = `BT /F1 18 Tf 72 700 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-fulltext-"));
  const store = new ResearchStore(dir, { seedDemoData: false });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "全文检索测试项目" });
  let seq = 0;
  const addPdf = (title, pageTexts) => {
    seq += 1;
    const pdf = buildTestPdf(pageTexts);
    const fileName = `fixture-${seq}.pdf`;
    fs.writeFileSync(path.join(dir, fileName), pdf);
    const result = store.importPaperAttachment({
      projectId: project.id,
      paper: { title },
      attachment: { fileName, relativePath: fileName, byteSize: pdf.length, sha256: `sha-${seq}`, sourceUrl: "" },
    });
    return result;
  };
  return { dir, store, project, addPdf };
}

async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return fn();
}

test("schema v21 adds papers_fts and attachment index-state columns", (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 22);
  assert.equal(store.getMetaValue("schema_version"), "22");
  assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='papers_fts'").get()?.name, "papers_fts");
  const columns = new Set(store.db.prepare("PRAGMA table_info(attachments)").all().map(row => row.name));
  for (const name of ["fts_status", "fts_indexed_at", "fts_page_count"]) assert.ok(columns.has(name), name);
  assert.equal(store.fulltextIndexStatus().total, 0);
});

test("v20 database migrates straight to v22 and creates one recoverable backup", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v21-migration-"));
  t.after(() => {
    clearResearchStoreCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const initial = new ResearchStore(dir, { seedDemoData: true });
  const dbPath = initial.dbPath;
  initial.close();
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE research_meta SET value='20' WHERE key='schema_version'").run();
  db.close();
  const migrated = new ResearchStore(dir, { seedDemoData: true });
  assert.equal(migrated.getMetaValue("schema_version"), "22");
  migrated.close();
  const firstCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v22-")).length;
  assert.equal(firstCount, 1);
  const reopened = new ResearchStore(dir, { seedDemoData: true });
  reopened.close();
  assert.equal(fs.readdirSync(dir).filter(name => name.includes(".bak-v22-")).length, firstCount);
});

test("CJK segmentation builds FTS phrases and restores display text", () => {
  assert.equal(buildMatchQuery("正念"), '"正 念"');
  assert.equal(buildMatchQuery("正念 干预"), '"正 念" "干 预"');
  assert.equal(buildMatchQuery("mindfulness"), '"mindfulness"');
  assert.equal(buildMatchQuery('a"b 正念'), '"a""b" "正 念"');
  assert.equal(buildMatchQuery("   "), null);
  assert.equal(segmentCjk("正念MBSR"), "正 念 MBSR");
  assert.equal(restoreCjkSpacing("这 项 [正 念] 干 预 MBSR"), "这项 [正念] 干预 MBSR");
});

test("indexAttachment extracts pages, indexes content, and is idempotent", async (t) => {
  const { store, project, addPdf } = fixture(t);
  const { attachment } = addPdf("Mindfulness and anxiety", [
    "Introduction: mindfulness-based intervention reduces anxiety in college students.",
    "Methods: 120 participants completed an eight-week mindfulness program.",
    "Results: anxiety scores dropped significantly after the mindfulness program.",
  ]);
  assert.equal(store.getAttachment(attachment.id).ftsStatus, "pending");
  const result = await indexAttachment(store, attachment.id);
  assert.equal(result.status, "ready");
  assert.equal(result.pageCount, 3);
  assert.equal(store.getAttachment(attachment.id).ftsStatus, "ready");

  const hit = store.searchFullText({ query: "anxiety" });
  assert.equal(hit.total, 1);
  assert.equal(hit.hits[0].paperId, attachment.paperId);
  assert.equal(hit.hits[0].attachmentId, attachment.id);
  assert.deepEqual(hit.hits[0].matches.map(item => item.page), [1, 3]);
  assert.ok(hit.hits[0].matches[0].snippet.includes("⟦anxiety⟧"));
  // 页码正确：methods 只在第 2 页
  const methods = store.searchFullText({ query: "participants completed" });
  assert.deepEqual(methods.hits[0].matches.map(item => item.page), [2]);
  // 项目过滤
  const inProject = store.searchFullText({ query: "anxiety", projectId: project.id });
  assert.equal(inProject.total, 1);
  const emptyProject = store.createProject({ title: "空项目" });
  assert.equal(store.searchFullText({ query: "anxiety", projectId: emptyProject.id }).total, 0);
  // 幂等：重建后不产生重复命中
  await indexAttachment(store, attachment.id);
  const again = store.searchFullText({ query: "anxiety" });
  assert.equal(again.total, 1);
  assert.equal(again.hits[0].matches.length, 2);
  // 查询返回项目上下文（前端跳转用）
  assert.equal(again.hits[0].projectId, project.id);
  assert.equal(again.hits[0].projectTitle, "全文检索测试项目");
});

test("CJK text is searchable through segmentation", async (t) => {
  const { store, addPdf } = fixture(t);
  // PDF 提取层用 ASCII fixture；CJK 切分层用合成行验证（与提取层解耦）
  const { attachment } = addPdf("正念干预研究", ["placeholder text"]);
  await indexAttachment(store, attachment.id);
  store.replaceAttachmentFulltext({
    attachmentId: attachment.id,
    paperId: attachment.paperId,
    pages: [{ page: 2, text: segmentCjk("这项正念干预研究招募了一百二十名大学生") }],
  });
  assert.equal(store.searchFullText({ query: "正念" }).total, 1);
  const both = store.searchFullText({ query: "正念 大学生" });
  assert.equal(both.total, 1);
  assert.deepEqual(both.hits[0].matches.map(item => item.page), [2]);
  assert.equal(store.searchFullText({ query: "冥想" }).total, 0);
  assert.ok(store.searchFullText({ query: "正念" }).hits[0].matches[0].snippet.includes("正念"));
});

test("scanned PDFs (no text layer) mark empty and broken files mark failed", async (t) => {
  const { store, dir, addPdf, project } = fixture(t);
  // 空页 PDF：内容流没有可提取文本（模拟扫描件）
  const blank = buildTestPdf(["", ""]);
  fs.writeFileSync(path.join(dir, "blank.pdf"), blank);
  const blankResult = store.importPaperAttachment({
    projectId: project.id,
    paper: { title: "完全空白" },
    attachment: { fileName: "blank.pdf", relativePath: "blank.pdf", byteSize: blank.length, sha256: "sha-blank", sourceUrl: "" },
  });
  const empty = await indexAttachment(store, blankResult.attachment.id);
  assert.equal(empty.status, "empty");
  assert.equal(store.getAttachment(blankResult.attachment.id).ftsStatus, "empty");
  // 损坏文件
  fs.writeFileSync(path.join(dir, "broken.pdf"), "this is not a pdf at all");
  const broken = store.importPaperAttachment({
    projectId: project.id,
    paper: { title: "损坏文件" },
    attachment: { fileName: "broken.pdf", relativePath: "broken.pdf", byteSize: 25, sha256: "sha-broken", sourceUrl: "" },
  });
  const failed = await indexAttachment(store, broken.attachment.id);
  assert.equal(failed.status, "failed");
  assert.equal(store.getAttachment(broken.attachment.id).ftsStatus, "failed");
  assert.ok(store.getAttachment(broken.attachment.id).ftsIndexedAt);
  // 无效状态被拒绝
  assert.throws(
    () => store.updateAttachmentFulltextState({ attachmentId: blankResult.attachment.id, status: "flying" }),
    error => error.code === "FULLTEXT_STATUS_INVALID"
  );
});

test("queue and rebuild process pending attachments serially", async (t) => {
  const { store, addPdf } = fixture(t);
  const first = addPdf("First paper", ["alpha beta gamma"]);
  const second = addPdf("Second paper", ["delta epsilon zeta"]);
  const ctx = { logger: { error() {} } };
  const rebuilt = rebuildFulltextIndex(ctx, store, {});
  assert.ok(rebuilt.queued >= 2, "both pending attachments enqueued");
  const done = await waitFor(() => {
    const status = store.fulltextIndexStatus();
    return status.ready >= 2;
  });
  assert.ok(done, "queue drained to ready");
  assert.equal(store.searchFullText({ query: "zeta" }).total, 1);
  // 重复 rebuild：ready 状态不再入队
  const again = rebuildFulltextIndex(ctx, store, {});
  assert.equal(again.queued, 0);
  // force 重建所有
  const forced = rebuildFulltextIndex(ctx, store, { force: true });
  assert.equal(forced.queued, 2);
  await waitFor(() => store.fulltextIndexStatus().ready >= 2);
  assert.equal(store.searchFullText({ query: "alpha" }).total, 1);
  assert.ok(first.attachment.id && second.attachment.id);
});

test("full-text search API returns hits, status, and rebuild endpoint", async (t) => {
  const { store, project, addPdf } = fixture(t);
  const { attachment } = addPdf("API searchable paper", ["unique phrase for api testing across pages"]);
  await indexAttachment(store, attachment.id);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const request = async (method, pathname, body) => {
    const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = { method, headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
    const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
    await api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`));
    return { status: res.status, body: JSON.parse(res.body) };
  };
  const search = await request("GET", `/search/fulltext?q=unique%20phrase&projectId=${encodeURIComponent(project.id)}`);
  assert.equal(search.status, 200);
  assert.equal(search.body.total, 1);
  assert.equal(search.body.hits[0].attachmentId, attachment.id);
  assert.ok(search.body.hits[0].matches[0].snippet.includes("unique"));
  const emptyQuery = await request("GET", "/search/fulltext?q=");
  assert.deepEqual(emptyQuery.body.hits, []);
  const status = await request("GET", "/search/fulltext/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.ready, 1);
  const rebuild = await request("POST", "/search/fulltext/rebuild", { force: false });
  assert.equal(rebuild.status, 202);
  assert.equal(typeof rebuild.body.queued, "number");
  const missing = await request("GET", "/search/fulltext?q=alpha");
  assert.equal(missing.status, 200);
});
