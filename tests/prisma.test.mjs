import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from '../lib/store.js';
import { createApiHandler } from '../lib/api.js';
import { buildPrismaCsv, buildPrismaJson, buildPrismaSvg } from '../lib/prisma-export.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-prisma-'));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: 'PRISMA 测试项目' });
  const papers = store.listPapers().slice(0, 4);
  for (const paper of papers) store.addPaperToProject(project.id, paper.id);
  return { store, project, papers };
}

function request(api, method, pathname, body) {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = { method, headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
  return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => res);
}

test('schema v18 adds PRISMA batches and retrieval audit fields', (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 19);
  assert.equal(store.getMetaValue('schema_version'), '19');
  const columns = new Set(store.db.prepare('PRAGMA table_info(project_papers)').all().map(row => row.name));
  for (const name of ['retrieval_status', 'retrieval_reason', 'retrieval_updated_at']) assert.ok(columns.has(name), name);
  assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_prisma_batches'").get()?.name, 'project_prisma_batches');
});

test('PRISMA overview reconciles batches, screening, retrieval and exclusion reasons', (t) => {
  const { store, project, papers } = fixture(t);
  const batch = store.createPrismaBatch(project.id, { sourceType: 'database', sourceName: 'PsycINFO', query: 'adolescent AND emotion', searchedAt: '2026-08-01', recordsFound: 6, duplicatesRemoved: 2, removedOther: 0, recordsImported: 4 });
  assert.equal(batch.recordsImported, 4);
  store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: 'title_abstract', decision: 'include' });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: 'full_text', decision: 'include' });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[1].id, stage: 'title_abstract', decision: 'include' });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[1].id, stage: 'full_text', decision: 'exclude', reason: '未报告目标结局' });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[2].id, stage: 'title_abstract', decision: 'maybe', reason: '摘要信息不足' });
  store.updatePaperRetrieval({ projectId: project.id, paperId: papers[2].id, status: 'not_retrieved', reason: '作者未回复' });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[3].id, stage: 'title_abstract', decision: 'exclude', reason: '非目标人群' });
  const overview = store.buildPrismaOverview(project.id);
  assert.deepEqual(overview.identification, { databaseRecords: 6, otherRecords: 0, total: 6, duplicatesRemoved: 2, removedOther: 0, afterRemoval: 4, imported: 4 });
  assert.deepEqual(overview.screening, { projectRecords: 4, screened: 4, awaiting: 0, excluded: 1 });
  assert.equal(overview.retrieval.sought, 3);
  assert.equal(overview.retrieval.retrieved, 2);
  assert.equal(overview.retrieval.notRetrieved, 1);
  assert.equal(overview.eligibility.assessed, 2);
  assert.deepEqual(overview.eligibility.exclusionReasons, [{ reason: '未报告目标结局', count: 1 }]);
  assert.equal(overview.included.studies, 1);
  assert.equal(overview.complete, true);
  assert.deepEqual(overview.warnings, []);
});

test('PRISMA batch and retrieval validation rejects impossible audit data', (t) => {
  const { store, project, papers } = fixture(t);
  assert.throws(() => store.createPrismaBatch(project.id, { sourceName: 'Invalid', recordsFound: 2, duplicatesRemoved: 2, recordsImported: 1 }), error => error instanceof ResearchStoreError && error.code === 'PRISMA_BATCH_INVALID');
  assert.throws(() => store.updatePaperRetrieval({ projectId: project.id, paperId: papers[0].id, status: 'not_retrieved' }), error => error.code === 'PRISMA_RETRIEVAL_REASON_REQUIRED');
  const created = store.createPrismaBatch(project.id, { sourceName: 'Crossref', recordsFound: 4, recordsImported: 4 });
  const changed = store.updatePrismaBatch(project.id, created.id, { notes: '补充记录' });
  assert.equal(changed.notes, '补充记录');
  assert.equal(store.deletePrismaBatch(project.id, created.id).deleted, true);
});

test('PRISMA SVG, CSV and JSON exports are native and source-auditable', (t) => {
  const { store, project } = fixture(t);
  store.createPrismaBatch(project.id, { sourceName: 'PubMed', recordsFound: 4, recordsImported: 4 });
  const svg = buildPrismaSvg(store, project.id).toString('utf8');
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(svg.includes('PRISMA 2020'));
  assert.ok(svg.includes('PRISMA 测试项目'));
  const csv = buildPrismaCsv(store, project.id);
  assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(csv.toString('utf8').includes('检索批次'));
  const json = JSON.parse(buildPrismaJson(store, project.id).toString('utf8'));
  assert.equal(json.standard, 'PRISMA 2020');
  assert.equal(json.prisma.batches[0].sourceName, 'PubMed');
});

test('PRISMA API exposes overview, batch mutation, retrieval validation and binary export', async (t) => {
  const { store, project, papers } = fixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const created = await request(api, 'POST', `/projects/${project.id}/prisma/batches`, { sourceType: 'database', sourceName: 'Scopus', recordsFound: 4, recordsImported: 4 });
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(created.body).batch.sourceName, 'Scopus');
  const invalidRetrieval = await request(api, 'PATCH', `/projects/${project.id}/papers/${papers[0].id}/retrieval`, { status: 'not_retrieved' });
  assert.equal(invalidRetrieval.status, 400);
  const overview = await request(api, 'GET', `/projects/${project.id}/prisma`);
  assert.equal(overview.status, 200);
  assert.equal(JSON.parse(overview.body).identification.total, 4);
  const exportResponse = await request(api, 'GET', `/projects/${project.id}/prisma/export?format=svg`);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers['content-type'], /^image\/svg\+xml/);
  assert.ok(exportResponse.body.toString('utf8').includes('<svg'));
});
