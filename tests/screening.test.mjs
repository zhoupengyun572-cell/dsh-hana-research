import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-screening-"));
  const store = new ResearchStore(dir);
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "系统综述筛选" });
  const papers = store.listPapers().slice(0, 3);
  for (const paper of papers) store.addPaperToProject(project.id, paper.id);
  return { dir, store, project, papers };
}

function request(api, method, pathname, body) {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = { method, headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
  return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => ({ status: res.status, body: JSON.parse(res.body) }));
}

test("schema v14 adds project-specific screening fields and criteria table", (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 19);
  assert.equal(store.getMetaValue("schema_version"), "19");
  const columns = new Set(store.db.prepare("PRAGMA table_info(project_papers)").all().map(row => row.name));
  for (const name of ["title_abstract_decision", "title_abstract_reason", "full_text_decision", "full_text_reason", "screening_updated_at"]) assert.ok(columns.has(name), name);
  const table = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_screening_criteria'").get();
  assert.equal(table.name, "project_screening_criteria");
  for (const name of ["project_dual_screening_config", "paper_screening_reviews", "paper_screening_resolutions"]) {
    assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)?.name, name);
  }
});

test("screening criteria replace validates and preserves order", (t) => {
  const { store, project } = fixture(t);
  const criteria = store.replaceScreeningCriteria(project.id, [
    { kind: "include", label: "目标人群", description: "12–18 岁青少年" },
    { kind: "include", label: "报告结局", description: "至少一个心理适应结局" },
    { kind: "exclude", label: "非实证研究", description: "评论、社论或方案" },
  ]);
  assert.equal(criteria.length, 3);
  assert.equal(criteria.filter(item => item.kind === "include").length, 2);
  assert.equal(criteria.find(item => item.label === "非实证研究").kind, "exclude");
  assert.throws(() => store.replaceScreeningCriteria(project.id, [{ kind: "other", label: "x" }]), ResearchStoreError);
});

test("title/abstract and full-text decisions are independent and exclusion requires reason", (t) => {
  const { store, project, papers } = fixture(t);
  assert.throws(() => store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "title_abstract", decision: "exclude" }), error => error.code === "SCREENING_REASON_REQUIRED");
  const first = store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "title_abstract", decision: "include" });
  assert.equal(first.titleAbstractDecision, "include");
  assert.equal(first.fullTextDecision, "pending");
  const second = store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "full_text", decision: "exclude", reason: "全文未报告目标结局" });
  assert.equal(second.fullTextDecision, "exclude");
  assert.equal(second.fullTextReason, "全文未报告目标结局");
  store.updatePaperScreening({ projectId: project.id, paperId: papers[1].id, stage: "title_abstract", decision: "maybe", reason: "摘要信息不足" });
  const overview = store.buildScreeningOverview(project.id);
  assert.deepEqual(overview.titleAbstract, { pending: 1, include: 1, maybe: 1, exclude: 0 });
  assert.deepEqual(overview.fullText, { pending: 2, include: 0, maybe: 0, exclude: 1 });
});

test("screening API returns overview and updates decisions", async (t) => {
  const { store, project, papers } = fixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const criteria = await request(api, "PUT", `/projects/${project.id}/screening/criteria`, { criteria: [{ kind: "include", label: "目标人群" }] });
  assert.equal(criteria.status, 200);
  assert.equal(criteria.body.criteria.length, 1);
  const changed = await request(api, "PATCH", `/projects/${project.id}/papers/${papers[0].id}/screening`, { stage: "title_abstract", decision: "include" });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.paper.titleAbstractDecision, "include");
  const overview = await request(api, "GET", `/projects/${project.id}/screening`);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.titleAbstract.include, 1);
});

test("batch screening is atomic and records a shared exclusion reason", (t) => {
  const { store, project, papers } = fixture(t);
  const result = store.updatePaperScreeningBatch({ projectId: project.id, paperIds: papers.slice(0, 2).map(paper => paper.id), stage: "title_abstract", decision: "exclude", reason: "非目标人群" });
  assert.equal(result.updated, 2);
  assert.equal(result.overview.titleAbstract.exclude, 2);
  assert.ok(result.overview.papers.filter(paper => paper.titleAbstractDecision === "exclude").every(paper => paper.titleAbstractReason === "非目标人群"));
  assert.throws(() => store.updatePaperScreeningBatch({ projectId: project.id, paperIds: [papers[0].id, "outside"], stage: "full_text", decision: "include" }), error => error.code === "PROJECT_PAPER_NOT_FOUND");
  assert.equal(store.buildScreeningOverview(project.id).fullText.include, 0, "failed batch changes nothing");
});

test("dual screening imports legacy decisions without overwriting them", (t) => {
  const { store, project, papers } = fixture(t);
  store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "title_abstract", decision: "include" });
  const configured = store.configureDualScreening(project.id, { enabled: true, reviewerAName: "周审查", reviewerBName: "李审查", importLegacy: true });
  assert.equal(configured.config.enabled, true);
  assert.equal(configured.imported, 1);
  const item = configured.overview.byPaper[papers[0].id].titleAbstract;
  assert.equal(item.a.decision, "include");
  assert.equal(item.b.decision, "pending");
  assert.equal(item.status, "in_progress");
  assert.equal(store.listProjectPapers(project.id).find(p => p.id === papers[0].id).titleAbstractDecision, "include", "legacy final remains until dual review changes");
});

test("independent reviews detect conflict, resolve final decision and calculate kappa", (t) => {
  const { store, project, papers } = fixture(t);
  store.configureDualScreening(project.id, { enabled: true, reviewerAName: "A", reviewerBName: "B" });
  const vote = (paper, reviewerKey, decision, reason = "") => store.updateIndependentScreening({ projectId: project.id, paperId: paper.id, stage: "title_abstract", reviewerKey, decision, reason });
  vote(papers[0], "a", "include"); vote(papers[0], "b", "include");
  vote(papers[1], "a", "include"); vote(papers[1], "b", "exclude", "非目标人群");
  vote(papers[2], "a", "exclude", "非目标研究"); vote(papers[2], "b", "exclude", "非目标研究");
  let overview = store.buildDualScreeningOverview(project.id);
  assert.equal(overview.byPaper[papers[0].id].titleAbstract.status, "agreement");
  assert.equal(overview.byPaper[papers[1].id].titleAbstract.status, "conflict");
  assert.equal(overview.stages.titleAbstract.agreementRate, 66.7);
  assert.equal(overview.stages.titleAbstract.kappa, 0.4);
  assert.equal(overview.conflictCount, 1);
  assert.equal(store.listProjectPapers(project.id).find(p => p.id === papers[1].id).titleAbstractDecision, "pending", "conflict has no final decision before resolution");
  store.resolveScreeningConflict({ projectId: project.id, paperId: papers[1].id, stage: "title_abstract", decision: "exclude", reason: "非目标人群", resolutionNote: "讨论后采用 B 的判断" });
  overview = store.buildDualScreeningOverview(project.id);
  assert.equal(overview.byPaper[papers[1].id].titleAbstract.status, "resolved");
  assert.equal(overview.byPaper[papers[1].id].titleAbstract.finalDecision, "exclude");
  assert.equal(overview.conflictCount, 0);
  assert.equal(store.listProjectPapers(project.id).find(p => p.id === papers[1].id).titleAbstractDecision, "exclude");
});

test("dual screening validation and API routes preserve independent reviewer records", async (t) => {
  const { store, project, papers } = fixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const config = await request(api, "PUT", `/projects/${project.id}/screening/dual-config`, { enabled: true, reviewerAName: "审查者甲", reviewerBName: "审查者乙" });
  assert.equal(config.status, 200);
  assert.equal(config.body.config.reviewerAName, "审查者甲");
  const missingReason = await request(api, "PATCH", `/projects/${project.id}/papers/${papers[0].id}/screening/reviews/a`, { stage: "title_abstract", decision: "exclude" });
  assert.equal(missingReason.status, 400);
  const a = await request(api, "PATCH", `/projects/${project.id}/papers/${papers[0].id}/screening/reviews/a`, { stage: "title_abstract", decision: "maybe", reason: "信息不足" });
  const b = await request(api, "PATCH", `/projects/${project.id}/papers/${papers[0].id}/screening/reviews/b`, { stage: "title_abstract", decision: "include" });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const overview = await request(api, "GET", `/projects/${project.id}/screening`);
  assert.equal(overview.body.dualScreening.conflictCount, 1);
  const resolved = await request(api, "POST", `/projects/${project.id}/papers/${papers[0].id}/screening/resolve`, { stage: "title_abstract", decision: "include", resolutionNote: "核对全文后纳入" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.paperScreening.titleAbstract.status, "resolved");
});

test("v13 migration creates one recoverable v14 backup and reaches current schema", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v14-migration-"));
  try {
    const initial = new ResearchStore(dir);
    const dbPath = initial.dbPath;
    initial.close();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE research_meta SET value='13' WHERE key='schema_version'").run();
    db.close();
    const migrated = new ResearchStore(dir);
    assert.equal(migrated.getMetaValue("schema_version"), "19");
    migrated.close();
    const firstCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v14-")).length;
    assert.equal(firstCount, 1);
    const reopened = new ResearchStore(dir);
    reopened.close();
    const secondCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v14-")).length;
    assert.equal(secondCount, firstCount);
  } finally {
    clearResearchStoreCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
