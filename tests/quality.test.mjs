import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResearchStore, RESEARCH_SCHEMA_VERSION } from '../lib/store.js';
import { createApiHandler } from '../lib/api.js';
import { buildQualityExport } from '../lib/quality-export.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-quality-'));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = store.createProject({ title: '质量评定测试' });
  const papers = store.listPapers().slice(0, 2);
  papers.forEach(paper => store.addPaperToProject(project.id, paper.id));
  return { store, project, papers };
}

function request(api, method, pathname, body) {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = { method, headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
  return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => res);
}

test('schema v19 creates quality, RoB adjudication and GRADE tables', t => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 19);
  assert.equal(store.getMetaValue('schema_version'), '19');
  for (const name of ['project_quality_config','paper_rob_reviews','paper_rob_resolutions','project_grade_outcomes','grade_domain_judgments']) {
    assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)?.name, name);
  }
});

test('dual RoB reviews stay independent, expose conflict, and preserve adjudication', t => {
  const { store, project, papers } = fixture(t);
  store.updateQualityConfig(project.id, { templateId:'rob2-2019', dualEnabled:true, reviewerAName:'甲', reviewerBName:'乙' });
  const domainsA = ['randomization','deviations','missing','measurement','reporting'].map(domainId => ({ domainId, judgment:'low', support:`A-${domainId}` }));
  const domainsB = domainsA.map(item => ({ ...item, judgment:item.domainId === 'randomization' ? 'high' : 'low', support:`B-${item.domainId}` }));
  store.saveRobReview(project.id, papers[0].id, { reviewerKey:'a', outcomeLabel:'抑郁症状', domains:domainsA });
  let overview = store.saveRobReview(project.id, papers[0].id, { reviewerKey:'b', outcomeLabel:'抑郁症状', domains:domainsB });
  assert.equal(overview.byPaper[papers[0].id].conflicts, 1);
  assert.equal(overview.byPaper[papers[0].id].domains[0].a.support, 'A-randomization');
  assert.equal(overview.byPaper[papers[0].id].domains[0].b.support, 'B-randomization');
  overview = store.resolveRobDomain(project.id, papers[0].id, { domainId:'randomization', judgment:'some_concerns', resolutionNote:'核对分配隐藏后达成共识' });
  assert.equal(overview.byPaper[papers[0].id].conflicts, 0);
  assert.equal(overview.byPaper[papers[0].id].overall, 'some_concerns');
  assert.equal(overview.byPaper[papers[0].id].complete, true);
});

test('GRADE suggestion is computed per outcome and final certainty remains explicit', t => {
  const { store, project } = fixture(t);
  const outcome = store.saveGradeOutcome(project.id, { title:'焦虑症状改善', importance:'critical', studyDesign:'randomized', studies:7, participants:842,
    domains:[{domainId:'risk_bias',level:-1,rationale:'部分研究分配隐藏不清'},{domainId:'imprecision',level:-1,rationale:'置信区间较宽'},{domainId:'large_effect',level:1,rationale:'效应较大'}] });
  assert.equal(outcome.suggestedCertainty, 3);
  assert.equal(outcome.confirmedCertainty, null);
  const confirmed = store.saveGradeOutcome(project.id, { confirmedCertainty:2, confirmationNote:'专家组基于间接性额外下调' }, outcome.id);
  assert.equal(confirmed.suggestedCertainty, 3);
  assert.equal(confirmed.confirmedCertainty, 2);
});

test('quality exports include final RoB matrix, GRADE profile and audit JSON', t => {
  const { store, project } = fixture(t);
  store.saveGradeOutcome(project.id, { title:'生活质量', studyDesign:'observational', domains:[] });
  const overview = store.buildQualityOverview(project.id);
  const gradeCsv = buildQualityExport(project, overview, 'grade-csv');
  assert.ok(gradeCsv.body.startsWith('\uFEFF'));
  assert.match(gradeCsv.body, /生活质量/);
  const json = JSON.parse(buildQualityExport(project, overview, 'json').body);
  assert.equal(json.methodology.riskOfBiasTemplate.id, 'psychology-general');
  assert.equal(json.overview.gradeOutcomes.length, 1);
});

test('quality API supports config, review, overview and GRADE mutations', async t => {
  const { store, project, papers } = fixture(t);
  const api = createApiHandler({ logger:{ error(){} } }, store);
  const config = await request(api,'PUT',`/projects/${project.id}/quality/config`,{templateId:'psychology-general',dualEnabled:false});
  assert.equal(config.status,200);
  const domains = ['sampling','measurement','confounding','missing','reporting'].map(domainId=>({domainId,judgment:'low',support:'证据充分'}));
  const review = await request(api,'PUT',`/projects/${project.id}/papers/${papers[0].id}/quality/reviews`,{reviewerKey:'a',domains});
  assert.equal(review.status,200);
  const grade = await request(api,'POST',`/projects/${project.id}/grade/outcomes`,{title:'主要结局',studyDesign:'randomized',domains:[]});
  assert.equal(grade.status,201);
  const overview = await request(api,'GET',`/projects/${project.id}/quality`);
  assert.equal(overview.status,200);
  assert.equal(JSON.parse(overview.body).summary.complete,1);
  const exported = await request(api,'GET',`/projects/${project.id}/quality/export?format=rob-csv`);
  assert.equal(exported.status,200);
  assert.match(exported.headers['content-type'],/^text\/csv/);
});
