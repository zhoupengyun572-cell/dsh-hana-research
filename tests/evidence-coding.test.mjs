import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, EVIDENCE_CODING_TEMPLATES, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-evidence-coding-"));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "研究编码" });
  const papers = store.listPapers().slice(0, 2);
  for (const paper of papers) store.addPaperToProject(project.id, paper.id);
  return { dir, store, project, papers };
}

function request(api, method, pathname, body) {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = { method, headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
  return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => ({ status: res.status, body: JSON.parse(res.body) }));
}

test("schema v15 adds evidence field and value tables", (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 19);
  assert.equal(store.getMetaValue("schema_version"), "19");
  const tables = new Set(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  assert.ok(tables.has("project_evidence_fields"));
  assert.ok(tables.has("project_paper_evidence_values"));
  assert.ok(EVIDENCE_CODING_TEMPLATES.length >= 3);
});

test("field schema validates types, unique labels, order and options", (t) => {
  const { store, project } = fixture(t);
  const fields = store.replaceEvidenceFields(project.id, [
    { label: "样本量", type: "number", required: true, description: "最终分析样本" },
    { label: "研究设计", type: "select", options: ["横断研究", "实验研究"], required: true },
    { label: "质性特征", type: "multi_select", options: ["访谈", "观察"] },
    { label: "预注册", type: "boolean" },
  ]);
  assert.deepEqual(fields.map(field => field.label), ["样本量", "研究设计", "质性特征", "预注册"]);
  assert.equal(fields[0].required, true);
  assert.deepEqual(fields[1].options, ["横断研究", "实验研究"]);
  assert.throws(() => store.replaceEvidenceFields(project.id, [{ label: "重复", type: "text" }, { label: "重复", type: "number" }]), error => error.code === "EVIDENCE_FIELDS_DUPLICATE");
  assert.throws(() => store.replaceEvidenceFields(project.id, [{ label: "空选项", type: "select", options: [] }]), error => error.code === "EVIDENCE_FIELDS_INVALID");
});

test("paper coding stores typed values and reports required-field completeness", (t) => {
  const { store, project, papers } = fixture(t);
  const fields = store.replaceEvidenceFields(project.id, [
    { label: "样本量", type: "number", required: true },
    { label: "研究设计", type: "select", options: ["横断研究", "实验研究"], required: true },
    { label: "测量工具", type: "multi_select", options: ["问卷", "访谈"] },
    { label: "预注册", type: "boolean" },
    { label: "主要结论", type: "text" },
  ]);
  const ids = Object.fromEntries(fields.map(field => [field.label, field.id]));
  const partial = store.updatePaperEvidenceCoding({ projectId: project.id, paperId: papers[0].id, values: {
    [ids.样本量]: "128",
    [ids.测量工具]: ["问卷", "访谈"],
    [ids.预注册]: false,
  } });
  assert.equal(partial.values[ids.样本量], 128);
  assert.equal(partial.values[ids.预注册], false);
  assert.equal(partial.stats.complete, false);
  const complete = store.updatePaperEvidenceCoding({ projectId: project.id, paperId: papers[0].id, values: { [ids.研究设计]: "横断研究" } });
  assert.equal(complete.stats.complete, true);
  const overview = store.getEvidenceCoding(project.id);
  assert.equal(overview.papersCoded, 1);
  assert.equal(overview.papersComplete, 1);
  assert.throws(() => store.updatePaperEvidenceCoding({ projectId: project.id, paperId: papers[1].id, values: { [ids.研究设计]: "无效设计" } }), error => error.code === "EVIDENCE_VALUE_INVALID");
  const matrix = store.buildEvidenceMatrix(project.id);
  assert.equal(matrix.fields.length, 5);
  assert.equal(matrix.papers.find(paper => paper.id === papers[0].id).codingValues[ids.样本量], 128);
});

test("removing fields with values requires explicit force and cascades safely", (t) => {
  const { store, project, papers } = fixture(t);
  const [field] = store.replaceEvidenceFields(project.id, [{ label: "主要结论", type: "text" }]);
  store.updatePaperEvidenceCoding({ projectId: project.id, paperId: papers[0].id, values: { [field.id]: "显著相关" } });
  assert.throws(() => store.replaceEvidenceFields(project.id, []), error => error.code === "EVIDENCE_FIELDS_IN_USE" && error.status === 409 && error.details.valueCount === 1);
  assert.equal(store.listEvidenceFields(project.id).length, 1);
  store.replaceEvidenceFields(project.id, [], { force: true });
  assert.equal(store.listEvidenceFields(project.id).length, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS c FROM project_paper_evidence_values").get().c, 0);
});

test("evidence coding API exposes templates, saves fields and updates a paper", async (t) => {
  const { store, project, papers } = fixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const saved = await request(api, "PUT", `/projects/${project.id}/evidence-fields`, { fields: [{ label: "样本量", type: "number", required: true }] });
  assert.equal(saved.status, 200);
  const fieldId = saved.body.fields[0].id;
  const changed = await request(api, "PATCH", `/projects/${project.id}/papers/${papers[0].id}/evidence-coding`, { values: { [fieldId]: 64 } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.values[fieldId], 64);
  const overview = await request(api, "GET", `/projects/${project.id}/evidence-coding`);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.templates.some(template => template.id === "systematic-review"));
  assert.equal(overview.body.papersComplete, 1);
});

test("v15 migration creates one recoverable backup for a v14 database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v15-migration-"));
  try {
    const initial = new ResearchStore(dir, { seedDemoData: true });
    const dbPath = initial.dbPath;
    initial.close();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE research_meta SET value='14' WHERE key='schema_version'").run();
    db.close();
    const migrated = new ResearchStore(dir, { seedDemoData: true });
    assert.equal(migrated.getMetaValue("schema_version"), "19");
    migrated.close();
    const firstCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v15-")).length;
    assert.equal(firstCount, 1);
    const reopened = new ResearchStore(dir, { seedDemoData: true });
    reopened.close();
    const secondCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v15-")).length;
    assert.equal(secondCount, firstCount);
  } finally {
    clearResearchStoreCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
