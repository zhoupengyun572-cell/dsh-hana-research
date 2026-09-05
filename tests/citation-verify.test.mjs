// P0-2 verification: citation verification engine (four states), summary draft
// citation audit, verification ledger store + API. All offline via injected fetch stubs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { normalizeDoi, titleSimilarity, compareCitationFields, verifyPaperCitation, extractDoiCitations, verifySummaryCitations } from "../lib/citation-verify.js";
import { createApiHandler } from "../lib/api.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-cite-verify-"));
  const store = new ResearchStore(dir, { seedDemoData: false });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "引用核验项目" });
  return { store, project };
}

/** 构造 fetchWork 桩：db 里登记 DOI → 两源返回一致字段；可指定单源缺失或字段漂移。 */
function stubFetch({ crossrefFound = true, openalexFound = true, drift = {}, crossrefError = null, openalexError = null } = {}) {
  return async (url) => {
    if (url.includes("api.crossref.org")) {
      if (crossrefError) throw crossrefError;
      if (!crossrefFound) {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      }
      return { message: { title: [drift.title || "A study of mindfulness"], "container-title": [drift.venue || "Journal of Psychology"], issued: { "date-parts": [[drift.year || 2023]] } } };
    }
    if (url.includes("api.openalex.org")) {
      if (openalexError) throw openalexError;
      if (!openalexFound) {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      }
      return { title: drift.title || "A study of mindfulness", publication_year: drift.year || 2023, primary_location: { source: { display_name: drift.venue || "Journal of Psychology" } } };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

test("schema v22 adds citation_verifications ledger", (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 22);
  assert.equal(store.getMetaValue("schema_version"), "22");
  assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='citation_verifications'").get()?.name, "citation_verifications");
});

test("normalizeDoi handles URL, prefix, and invalid forms", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1234/ABC.def"), "10.1234/abc.def");
  assert.equal(normalizeDoi("doi: 10.1234/x."), "10.1234/x");
  assert.equal(normalizeDoi("10.1234/xyz"), "10.1234/xyz");
  assert.equal(normalizeDoi("not-a-doi"), null);
  assert.equal(normalizeDoi(""), null);
});

test("titleSimilarity and compareCitationFields surface field conflicts", () => {
  assert.ok(titleSimilarity("Mindfulness and Anxiety: A Meta-Analysis", "mindfulness and anxiety a meta analysis") > 0.95);
  assert.ok(titleSimilarity("正念干预对焦虑的效果", "正念干预对焦虑的效果研究") >= 0.9);
  assert.ok(titleSimilarity("完全不同的两篇论文标题", "another totally different paper") < 0.3);
  assert.deepEqual(compareCitationFields({ title: "Same title", year: 2023, venue: "Journal A" }, { title: "Same title", year: 2023, venue: "Journal A" }), []);
  const conflicts = compareCitationFields({ title: "Mindfulness reduces anxiety", year: 2022, venue: "Psychological Science" }, { title: "A completely different study about sleep", year: 2021, venue: "Nature" });
  assert.deepEqual(conflicts.map(item => item.field).sort(), ["title", "venue", "year"]);
});

test("verifyPaperCitation returns all four states with field details", async () => {
  const paper = { title: "A study of mindfulness", year: 2023, venue: "Journal of Psychology", doi: "10.1234/mind" };
  const verified = await verifyPaperCitation(paper, { fetchWork: stubFetch() });
  assert.equal(verified.status, "verified");
  assert.equal(verified.sources.length, 2);
  assert.ok(verified.sources.every(source => source.doiFound));
  const mismatch = await verifyPaperCitation({ ...paper, year: 2021 }, { fetchWork: stubFetch({ drift: { year: 2023, title: "A totally different paper on sleep" } }) });
  assert.equal(mismatch.status, "mismatch");
  assert.ok(mismatch.conflicts.some(item => item.field === "year"));
  const notFound = await verifyPaperCitation(paper, { fetchWork: stubFetch({ crossrefFound: false, openalexFound: false }) });
  assert.equal(notFound.status, "not_found");
  assert.match(notFound.note, /幻觉/);
  const singleSource = await verifyPaperCitation(paper, { fetchWork: stubFetch({ openalexFound: false }) });
  assert.equal(singleSource.status, "manual_needed");
  assert.equal(singleSource.reason, "single_source");
  const noDoi = await verifyPaperCitation({ title: "No DOI here" });
  assert.equal(noDoi.status, "manual_needed");
  assert.equal(noDoi.reason, "no_doi");
  const network = await verifyPaperCitation(paper, { fetchWork: stubFetch({ crossrefError: Object.assign(new Error("timeout"), { code: "SEARCH_SOURCE_TIMEOUT" }) }) });
  assert.equal(network.status, "manual_needed");
  assert.equal(network.reason, "network");
});

test("cross-language titles route to manual instead of mismatch; details.status 404 counts as miss", async () => {
  const paper = { title: "资源稀缺对成年子女孝心消费行为的影响", year: 2026, venue: "心理科学进展", doi: "10.3724/sp.j.1042.2026.0817" };
  const report = await verifyPaperCitation(paper, { fetchWork: stubFetch({ drift: { title: "Scarcity and filial consumption among adult children", venue: "Advances in Psychological Science", year: 2026 } }) });
  assert.equal(report.status, "manual_needed");
  assert.equal(report.reason, "language_mismatch");
  const fetchJsonStyle = async () => { const e = new Error("Crossref 检索失败（HTTP 404）"); e.code = "SEARCH_SOURCE_HTTP_ERROR"; e.status = 502; e.details = { status: 404 }; throw e; };
  const notFound = await verifyPaperCitation(paper, { fetchWork: fetchJsonStyle });
  assert.equal(notFound.status, "not_found");
});

test("verifySummaryCitations audits DOI and title citations in a draft", async () => {
  const papers = [
    { id: "p1", title: "A study of mindfulness", year: 2023, venue: "Journal of Psychology", doi: "10.1234/mind" },
    { id: "p2", title: "正念干预对青少年焦虑的效果", year: 2022, venue: "心理学报", doi: "10.2345/zheng" },
  ];
  const text = `## 主要发现
正念训练效果显著（《A study of mindfulness》），见 doi:10.1234/mind。
中文文献《正念干预对青少年焦虑的效果》支持该结论。
 DOI 10.9999/fake-paper 未收录；《编造出来的文献标题》不在库里。`;
  const report = await verifySummaryCitations({ text, papers, fetchWork: stubFetch({ openalexFound: false, crossrefFound: false }) });
  assert.equal(report.citations.length, 5, "2 DOI + 3 title citations");
  assert.equal(report.counts.not_found, 4, "both sources down: real DOI, fake DOI and two in-library titles all land not_found");
  const manual = report.citations.filter(item => item.status === "manual_needed");
  assert.equal(manual.length, 1, "fabricated title is the only manual_needed");
  const titleCitation = report.citations.find(item => item.kind === "title" && item.raw === "正念干预对青少年焦虑的效果");
  assert.ok(titleCitation, "Chinese title citation extracted");
  // 两源都在时：库内题名核验通过
  const okReport = await verifySummaryCitations({ text: "《A study of mindfulness》", papers, fetchWork: stubFetch() });
  assert.equal(okReport.counts.verified, 1);
  assert.equal(okReport.citations[0].matchedPaperId, "p1");
});

test("citation verification ledger persists and lists per note document", (t) => {
  const { store, project } = fixture(t);
  const paper = store.importPaperAttachment({
    projectId: project.id,
    paper: { title: "Cited paper", doi: "10.1234/cited" },
    attachment: { fileName: "a.pdf", relativePath: "a.pdf", byteSize: 1, sha256: "s1", sourceUrl: "" },
  });
  // 建汇总笔记 + 引文
  const doc = store.putPaperNoteDocument({ paperId: paper.paper.id, title: "汇总笔记", markdown: "" });
  const citation = store.addCitation({ noteDocumentId: doc.id, paperId: paper.paper.id, pageNumber: 1, quotedText: "摘录" });
  assert.throws(
    () => store.replaceCitationVerifications("no-such-doc", []),
    error => error.code === "NOTE_DOCUMENT_NOT_FOUND"
  );
  const saved = store.replaceCitationVerifications(doc.id, [
    { citationId: citation.id, paperId: paper.paper.id, status: "mismatch", conflicts: [{ field: "year", local: 2022, remote: 2023 }], sources: [{ name: "Crossref", doiFound: true }] },
  ]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "mismatch");
  assert.equal(saved[0].conflicts[0].field, "year");
  // 外来 citationId 被拒收
  store.replaceCitationVerifications(doc.id, [{ citationId: "foreign-id", paperId: paper.paper.id, status: "verified", conflicts: [], sources: [] }]);
  assert.equal(store.listCitationVerifications(doc.id).length, 1);
  // 重复核验 = 更新同一行
  store.replaceCitationVerifications(doc.id, [{ citationId: citation.id, paperId: paper.paper.id, status: "verified", conflicts: [], sources: [] }]);
  const again = store.listCitationVerifications(doc.id);
  assert.equal(again.length, 1);
  assert.equal(again[0].status, "verified");
});

test("verify-citations API verifies without network when no DOI and lists ledger", (t) => {
  const { store, project } = fixture(t);
  const paper = store.importPaperAttachment({
    projectId: project.id,
    paper: { title: "No DOI paper" },
    attachment: { fileName: "n.pdf", relativePath: "n.pdf", byteSize: 1, sha256: "s2", sourceUrl: "" },
  });
  const doc = store.putPaperNoteDocument({ paperId: paper.paper.id, title: "无 DOI 笔记", markdown: "" });
  store.addCitation({ noteDocumentId: doc.id, paperId: paper.paper.id, pageNumber: 1, quotedText: "摘录" });
  const api = createApiHandler({ logger: { error() {} } }, store);
  const request = async (method, pathname, body) => {
    const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = { method, headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
    const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
    return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => ({ status: res.status, body: JSON.parse(res.body) }));
  };
  return (async () => {
    const verified = await request("POST", `/note-documents/${doc.id}/verify-citations`, {});
    assert.equal(verified.status, 200);
    assert.equal(verified.body.counts.manual_needed, 1, "no-DOI citations go to manual_needed without network");
    assert.equal(verified.body.results[0].status, "manual_needed");
    const list = await request("GET", `/note-documents/${doc.id}/citation-verifications`, {});
    assert.equal(list.status, 200);
    assert.equal(list.body.verifications.length, 1);
  })();
});
