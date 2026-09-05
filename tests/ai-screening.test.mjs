import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ResearchStore, ResearchStoreError, clearResearchStoreCache, RESEARCH_SCHEMA_VERSION } from "../lib/store.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-ai-screening-"));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "AI 预筛验证项目" });
  const papers = store.listPapers().slice(0, 6);
  for (const paper of papers) store.addPaperToProject(project.id, paper.id);
  store.replaceScreeningCriteria(project.id, [
    { kind: "include", label: "目标人群", description: "青少年或成人" },
    { kind: "include", label: "研究设计", description: "实证研究" },
    { kind: "exclude", label: "非实证研究", description: "评论、社论或方案" },
  ]);
  return { dir, store, project, papers };
}

function runningRun(store, project, stage = "title_abstract", paperIds = null) {
  const run = store.createAiScreeningRun({ projectId: project.id, stage, paperIds, model: "host-llm", promptVersion: "ais-v1" });
  return store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "running" });
}

test("schema v20 adds AI screening tables without touching dual screening tables", (t) => {
  const { store } = fixture(t);
  assert.equal(RESEARCH_SCHEMA_VERSION, 22);
  assert.equal(store.getMetaValue("schema_version"), "22");
  for (const name of ["ai_screening_runs", "paper_ai_screenings"]) {
    assert.equal(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)?.name, name);
  }
  const dual = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paper_screening_reviews'").get();
  assert.equal(dual.name, "paper_screening_reviews");
  const columns = new Set(store.db.prepare("PRAGMA table_info(paper_ai_screenings)").all().map(row => row.name));
  for (const name of ["run_id", "decision", "confidence", "rationale", "per_criteria", "tier", "sent_scope"]) assert.ok(columns.has(name), name);
});

test("v19 database migrates straight to v21 and creates one recoverable v21 backup", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-v20-migration-"));
  t.after(() => {
    clearResearchStoreCache();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const initial = new ResearchStore(dir, { seedDemoData: true });
  const dbPath = initial.dbPath;
  initial.close();
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE research_meta SET value='19' WHERE key='schema_version'").run();
  db.close();
  const migrated = new ResearchStore(dir, { seedDemoData: true });
  assert.equal(migrated.getMetaValue("schema_version"), "22");
  assert.equal(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_screening_runs'").get()?.name, "ai_screening_runs");
  migrated.close();
  const firstCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v22-")).length;
  assert.equal(firstCount, 1);
  const reopened = new ResearchStore(dir, { seedDemoData: true });
  reopened.close();
  const secondCount = fs.readdirSync(dir).filter(name => name.includes(".bak-v22-")).length;
  assert.equal(secondCount, firstCount);
});

test("creating an AI screening run requires criteria and selects pending papers by default", (t) => {
  const { store, project, papers } = fixture(t);
  const bare = store.createProject({ title: "无标准项目" });
  store.addPaperToProject(bare.id, papers[0].id);
  assert.throws(
    () => store.createAiScreeningRun({ projectId: bare.id, stage: "title_abstract" }),
    error => error.code === "AI_SCREENING_CRITERIA_REQUIRED"
  );
  assert.throws(
    () => store.createAiScreeningRun({ projectId: project.id, stage: "page" }),
    error => error.code === "SCREENING_STAGE_INVALID"
  );
  assert.throws(
    () => store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract", paperIds: ["no-such-paper"] }),
    error => error.code === "PROJECT_PAPER_NOT_FOUND"
  );
  const run = store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract", model: "host-llm", promptVersion: "ais-v1" });
  assert.equal(run.status, "queued");
  assert.equal(run.total, 6);
  assert.equal(run.stage, "title_abstract");
  assert.equal(run.criteriaSnapshot.length, 3);
  assert.ok(run.criteriaHash.length === 16);
  assert.equal(run.model, "host-llm");
  // 待筛全量 = 该阶段 decision 为 pending 的文献
  store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "title_abstract", decision: "include" });
  const second = store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract" });
  assert.equal(second.total, 5);
  // 显式指定含人工已筛文献
  const third = store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract", paperIds: [papers[0].id, papers[1].id] });
  assert.equal(third.total, 2);
  // 无待筛文献
  const all = store.listPapers();
  assert.throws(
    () => store.createAiScreeningRun({ projectId: project.id, stage: "full_text", paperIds: [] }),
    error => error.code === "AI_SCREENING_BATCH_INVALID"
  );
  assert.ok(all.length >= 6);
});

test("run status transitions enforce allowed paths and keep resume cursor", (t) => {
  const { store, project } = fixture(t);
  const run = store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract" });
  assert.throws(
    () => store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "done" }),
    error => error.code === "AI_SCREENING_STATUS_INVALID"
  );
  assert.throws(
    () => store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "flying" }),
    error => error.code === "AI_SCREENING_STATUS_INVALID"
  );
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "running" });
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "paused" });
  const resumed = store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "queued" });
  assert.equal(resumed.status, "queued");
  assert.equal(resumed.error, "");
  // running → done 合法；done 之后不能再 running
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "running" });
  const done = store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "done" });
  assert.equal(done.status, "done");
  assert.throws(
    () => store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "running" }),
    error => error.code === "AI_SCREENING_STATUS_INVALID"
  );
  // failed 状态可携带错误信息并恢复
  const failRun = store.createAiScreeningRun({ projectId: project.id, stage: "title_abstract" });
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: failRun.id, status: "running" });
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: failRun.id, status: "failed", error: "host llm unavailable" });
  const afterFail = store.getAiScreeningRun(project.id, failRun.id);
  assert.equal(afterFail.error, "host llm unavailable");
  const recovered = store.updateAiScreeningRunStatus({ projectId: project.id, runId: failRun.id, status: "queued" });
  assert.equal(recovered.error, "");
});

test("append results route by tier, derive counters, and stay idempotent per paper", (t) => {
  const { store, project, papers } = fixture(t);
  const run = runningRun(store, project);
  const criteriaSnapshot = run.criteriaSnapshot;
  const base = { runId: run.id, sentScope: "metadata", perCriteria: criteriaSnapshot.map(item => ({ id: item.label, label: item.label, hit: true, evidence: "摘要匹配" })) };
  const tier1 = store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "include", confidence: 0.9, rationale: "完全符合纳入标准" });
  assert.equal(tier1.tier, 1);
  const tier2 = store.appendAiScreeningResult({ ...base, paperId: papers[1].id, decision: "include", confidence: 0.6, rationale: "部分符合" });
  assert.equal(tier2.tier, 2);
  const tier3low = store.appendAiScreeningResult({ ...base, paperId: papers[2].id, decision: "exclude", confidence: 0.3, rationale: "低于纳入线" });
  assert.equal(tier3low.tier, 3);
  const tier3uncertain = store.appendAiScreeningResult({ ...base, paperId: papers[3].id, decision: "uncertain", confidence: 0.95, rationale: "信息不足" });
  assert.equal(tier3uncertain.tier, 3);
  const afterFirst = store.getAiScreeningRun(project.id, run.id);
  assert.equal(afterFirst.processed, 4);
  assert.equal(afterFirst.included, 2);
  assert.equal(afterFirst.excluded, 1);
  assert.equal(afterFirst.uncertain, 1);
  // 断点续跑游标：last_paper_id 指向最近写入的文献
  assert.equal(afterFirst.lastPaperId, papers[3].id);
  // 幂等：同一 run 内同一文献重复写入只更新，不重复计数
  const overwritten = store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "exclude", confidence: 0.8, rationale: "复核后排除" });
  assert.equal(overwritten.decision, "exclude");
  const afterOverwrite = store.getAiScreeningRun(project.id, run.id);
  assert.equal(afterOverwrite.processed, 4);
  assert.equal(afterOverwrite.included, 1);
  assert.equal(afterOverwrite.excluded, 2);
  // 校验
  assert.throws(
    () => store.appendAiScreeningResult({ ...base, paperId: papers[4].id, decision: "maybe", confidence: 0.9 }),
    error => error.code === "AI_SCREENING_RESULT_INVALID"
  );
  assert.throws(
    () => store.appendAiScreeningResult({ ...base, paperId: papers[4].id, decision: "include", confidence: 1.5 }),
    error => error.code === "AI_SCREENING_RESULT_INVALID"
  );
  assert.throws(
    () => store.appendAiScreeningResult({ ...base, paperId: papers[4].id, decision: "include", confidence: 0.9, sentScope: "everything" }),
    error => error.code === "AI_SCREENING_RESULT_INVALID"
  );
  assert.throws(
    () => store.appendAiScreeningResult({ ...base, paperId: "not-in-project", decision: "include", confidence: 0.9 }),
    error => error.code === "PROJECT_PAPER_NOT_FOUND"
  );
  // 非运行中的 run 不能写入
  store.updateAiScreeningRunStatus({ projectId: project.id, runId: run.id, status: "paused" });
  assert.throws(
    () => store.appendAiScreeningResult({ ...base, paperId: papers[4].id, decision: "include", confidence: 0.9 }),
    error => error.code === "AI_SCREENING_RUN_NOT_RUNNING"
  );
});

test("listing AI screenings filters by stage and tier", (t) => {
  const { store, project, papers } = fixture(t);
  const run = runningRun(store, project);
  const base = { runId: run.id, perCriteria: [], sentScope: "metadata" };
  store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "include", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[1].id, decision: "include", confidence: 0.6 });
  store.appendAiScreeningResult({ ...base, paperId: papers[2].id, decision: "uncertain", confidence: 0.4 });
  const all = store.listAiScreenings(project.id, { runId: run.id });
  assert.equal(all.length, 3);
  // 排序：tier 升序，tier 内置信度降序
  assert.deepEqual(all.map(item => item.tier), [1, 2, 3]);
  assert.equal(all[0].paperId, papers[0].id);
  assert.ok(all[0].title.length > 0);
  // 全文阶段查不到题录阶段的结果
  assert.equal(store.listAiScreenings(project.id, { stage: "full_text" }).length, 0);
  const tier1Only = store.listAiScreenings(project.id, { tier: 1 });
  assert.equal(tier1Only.length, 1);
  assert.equal(tier1Only[0].decision, "include");
  assert.throws(() => store.listAiScreenings(project.id, { tier: 9 }), ResearchStoreError);
});

test("agreement compares AI suggestions with human decisions without mutating them", (t) => {
  const { store, project, papers } = fixture(t);
  assert.equal(store.buildAiScreeningAgreement(project.id, { stage: "title_abstract" }).available, false);
  const run = runningRun(store, project);
  const base = { runId: run.id, perCriteria: [], sentScope: "metadata" };
  store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "include", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[1].id, decision: "include", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[2].id, decision: "exclude", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[3].id, decision: "exclude", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[4].id, decision: "uncertain", confidence: 0.5 });
  // 人工结论：AI 猜对 2 篇（tp=1, tn=1），错 2 篇（fp=1, fn=1），1 篇 AI uncertain 不参与
  store.updatePaperScreening({ projectId: project.id, paperId: papers[0].id, stage: "title_abstract", decision: "include" });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[1].id, stage: "title_abstract", decision: "exclude", reason: "人群不符" });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[2].id, stage: "title_abstract", decision: "exclude", reason: "非实证" });
  store.updatePaperScreening({ projectId: project.id, paperId: papers[3].id, stage: "title_abstract", decision: "include" });
  const agreement = store.buildAiScreeningAgreement(project.id, { stage: "title_abstract" });
  assert.equal(agreement.available, true);
  assert.equal(agreement.runId, run.id);
  assert.equal(agreement.sampleSize, 4);
  assert.deepEqual(agreement.counts, { tp: 1, fp: 1, tn: 1, fn: 1 });
  assert.equal(agreement.sensitivity, 50);
  assert.equal(agreement.specificity, 50);
  assert.equal(agreement.agreementRate, 50);
  assert.equal(agreement.overrides, 2);
  // AI 结果不写人工字段：papers[4] 仍为 pending
  const pending = store.listProjectPapers(project.id).find(paper => paper.id === papers[4].id);
  assert.equal(pending.titleAbstractDecision, "pending");
  // 标准变更后 agreement 标记 criteriaChanged
  store.replaceScreeningCriteria(project.id, [{ kind: "include", label: "新标准", description: "变化后" }]);
  const stale = store.buildAiScreeningAgreement(project.id, { stage: "title_abstract" });
  assert.equal(stale.criteriaChanged, true);
});

test("AI results keep the PRISMA and dual screening surfaces untouched", (t) => {
  const { store, project, papers } = fixture(t);
  const run = runningRun(store, project);
  const base = { runId: run.id, perCriteria: [], sentScope: "metadata" };
  store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "include", confidence: 0.9 });
  store.appendAiScreeningResult({ ...base, paperId: papers[1].id, decision: "exclude", confidence: 0.9 });
  const overview = store.buildScreeningOverview(project.id);
  assert.equal(overview.titleAbstract.pending, 6);
  assert.equal(overview.titleAbstract.include, 0);
  assert.equal(overview.dualScreening.stages.titleAbstract.counts.unreviewed, 6);
  assert.equal(overview.prisma.included.studies, 0);
});

// ── lib/ai-screening.js：prompt 构建 + 输出规范化 + 容错 ──

import { buildScreeningSystemPrompt, buildScreeningUserPrompt, normalizeScreeningPayload, aiScreenPaper, AI_SCREENING_PROMPT_VERSION, AiScreeningError } from "../lib/ai-screening.js";
import { createApiHandler } from "../lib/api.js";

const CRITERIA = [
  { id: "c1", kind: "include", label: "目标人群", description: "青少年或成人", position: 0 },
  { id: "c2", kind: "include", label: "研究设计", description: "实证研究", position: 1 },
  { id: "c3", kind: "exclude", label: "非实证研究", description: "评论、社论或方案", position: 2 },
];

function fakeLlm(text) {
  return {
    stream: async function* () {
      for (const part of [text.slice(0, 3), text.slice(3)]) {
        if (part) yield { type: "text-delta", index: 0, text: part };
      }
      yield { type: "finish", index: 0, reason: "stop" };
    },
  };
}

function fakeLlmError() {
  return {
    stream: async function* () {
      yield { type: "finish", index: 0, reason: "error" };
    },
  };
}

const SELECTION = { provider: "deepseek", model: "deepseek-chat" };

test("screening prompts embed criteria, JSON contract, and excerpt pages", () => {
  const system = buildScreeningSystemPrompt({ criteria: CRITERIA, stage: "title_abstract" });
  assert.ok(system.includes("第三评审"));
  assert.ok(system.includes("[纳入] 目标人群"));
  assert.ok(system.includes("[排除] 非实证研究"));
  assert.ok(system.includes('"decision"'));
  assert.ok(system.includes("uncertain"));
  const fullSystem = buildScreeningSystemPrompt({ criteria: CRITERIA, stage: "full_text" });
  assert.ok(fullSystem.includes("全文段落"));
  const user = buildScreeningUserPrompt({ paper: { title: "正念干预研究", authors: "张三, 李四", year: 2023, venue: "心理学报", doi: "10.1000/x", abstract: "一项关于正念的实证研究".repeat(60) }, stage: "title_abstract" });
  assert.ok(user.includes("标题：正念干预研究"));
  assert.ok(user.includes("DOI：10.1000/x"));
  assert.ok(user.includes("摘要："));
  const fullUser = buildScreeningUserPrompt({
    paper: { title: "正念干预研究" },
    stage: "full_text",
    excerpts: [{ page: 3, text: "参与者为 120 名大学生" }, { page: 5, text: "结果表明焦虑显著下降" }],
  });
  assert.ok(fullUser.includes("（第 3 页）"));
  assert.ok(fullUser.includes("结果表明焦虑显著下降"));
  // 题录阶段不携带全文段落
  const metaUser = buildScreeningUserPrompt({ paper: { title: "x" }, stage: "title_abstract", excerpts: [{ page: 1, text: "不应出现" }] });
  assert.ok(!metaUser.includes("不应出现"));
});

test("normalizeScreeningPayload repairs invalid decisions, clamps confidence, and aligns criteria", () => {
  const good = normalizeScreeningPayload({
    decision: "INCLUDE", confidence: 0.9, rationale: "符合",
    criteria: [{ label: "目标人群", hit: true, evidence: "大学生样本" }, { label: "编造标准", hit: false }],
  }, CRITERIA);
  assert.equal(good.decision, "include");
  assert.equal(good.confidence, 0.9);
  assert.equal(good.perCriteria[0].id, "c1");
  assert.equal(good.perCriteria[0].label, "目标人群");
  assert.equal(good.perCriteria[1].label, "编造标准");
  assert.equal(good.parseError, false);
  // 非法 decision → uncertain；confidence 越界收敛；超长 rationale 截断
  const bad = normalizeScreeningPayload({ decision: "也许吧", confidence: 7, rationale: "x".repeat(3000) }, CRITERIA);
  assert.equal(bad.decision, "uncertain");
  assert.equal(bad.confidence, 1);
  assert.equal(bad.rationale.length, 2000);
  const empty = normalizeScreeningPayload(null, CRITERIA);
  assert.equal(empty.decision, "uncertain");
  assert.equal(empty.confidence, 0);
  assert.deepEqual(empty.perCriteria, []);
});

test("aiScreenPaper parses fenced JSON and degrades gracefully on bad output", async () => {
  const paper = { title: "正念干预研究", abstract: "实证研究" };
  const ok = await aiScreenPaper({
    llm: fakeLlm('前置说明 ```json\n{"decision":"include","confidence":0.88,"rationale":"两项纳入标准均满足","criteria":[{"label":"目标人群","hit":true,"evidence":"成人样本"}]}\n``` 后置文字'),
    selection: SELECTION, criteria: CRITERIA, paper, stage: "title_abstract",
  });
  assert.equal(ok.decision, "include");
  assert.equal(ok.confidence, 0.88);
  assert.equal(ok.perCriteria[0].id, "c1");
  assert.equal(ok.parseError, false);
  const bad = await aiScreenPaper({ llm: fakeLlm("这段回复没有任何 JSON"), selection: SELECTION, criteria: CRITERIA, paper });
  assert.equal(bad.decision, "uncertain");
  assert.equal(bad.parseError, true);
  assert.equal(bad.confidence, 0);
  await assert.rejects(
    () => aiScreenPaper({ llm: fakeLlmError(), selection: SELECTION, criteria: CRITERIA, paper }),
    error => error instanceof AiScreeningError && error.code === "AI_SCREENING_UNREACHABLE"
  );
  await assert.rejects(
    () => aiScreenPaper({ llm: fakeLlm("x"), selection: null, criteria: CRITERIA, paper }),
    error => error instanceof AiScreeningError && error.code === "AI_SCREENING_NO_MODEL"
  );
  assert.equal(AI_SCREENING_PROMPT_VERSION, "ais-v1");
});

// ── API 层：串行队列 runner + 断点续跑 + 进度 ──

function request(api, method, pathname, body) {
  const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = { method, headers: { "content-type": "application/json" }, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  const res = { status: 0, headers: {}, body: null, writeHead(status, headers = {}) { this.status = status; this.headers = headers; }, end(chunk) { this.body = chunk; } };
  return api.handle(req, res, new URL(`http://dsh.local/api/hana-research${pathname}`)).then(() => ({ status: res.status, body: JSON.parse(res.body) }));
}

async function waitFor(fn, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return fn();
}

function fakeLlmSequence(responses) {
  let call = 0;
  return {
    stream: async function* () {
      const current = call;
      call += 1;
      const text = responses[Math.min(current, responses.length - 1)];
      for (const part of [text.slice(0, 4), text.slice(4)]) {
        if (part) yield { type: "text-delta", index: 0, text: part };
      }
      yield { type: "finish", index: 0, reason: "stop" };
    },
  };
}

function fakeLlmFailOn(failIndex, responses) {
  let call = 0;
  return {
    stream: async function* () {
      const current = call;
      call += 1;
      if (current === failIndex) {
        yield { type: "finish", index: 0, reason: "error" };
        return;
      }
      const slot = current < failIndex ? current : current - 1;
      const text = responses[Math.min(slot, responses.length - 1)];
      for (const part of [text.slice(0, 4), text.slice(4)]) {
        if (part) yield { type: "text-delta", index: 0, text: part };
      }
      yield { type: "finish", index: 0, reason: "stop" };
    },
  };
}

const RESPONSES = [
  '{"decision":"include","confidence":0.9,"rationale":"两项纳入标准均满足","criteria":[]}',
  '{"decision":"exclude","confidence":0.85,"rationale":"命中排除标准：非实证研究","criteria":[{"label":"非实证研究","hit":true,"evidence":"社论"}]}',
  '{"decision":"uncertain","confidence":0.4,"rationale":"摘要信息不足","criteria":[]}',
];

function modelCtx(state) {
  return {
    logger: { error() {} },
    agentDefaultModel: { currentSelection: () => ({ provider: "deepseek", model: "deepseek-chat" }) },
    get: key => (key === "llm" ? state.llm : undefined),
  };
}

test("POST ai-runs without a host model returns AI_SCREENING_NO_MODEL", (t) => {
  const { store, project } = fixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  return request(api, "POST", `/projects/${project.id}/screening/ai-runs`, { stage: "title_abstract" }).then(res => {
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "AI_SCREENING_NO_MODEL");
  });
});

test("ai screening run executes serially, records results, and reports progress over API", (t) => {
  const { store, project, papers } = fixture(t);
  const state = { llm: fakeLlmSequence(RESPONSES) };
  const api = createApiHandler(modelCtx(state), store);
  return (async () => {
    const created = await request(api, "POST", `/projects/${project.id}/screening/ai-runs`, { stage: "title_abstract" });
    assert.equal(created.status, 201);
    const runId = created.body.run.id;
    assert.equal(created.body.run.total, 6);
    const finished = await waitFor(() => store.getAiScreeningRun(project.id, runId).status === "done");
    assert.ok(finished, "run 应在超时前完成");
    const run = store.getAiScreeningRun(project.id, runId);
    assert.equal(run.processed, 6);
    assert.equal(run.model, "deepseek-chat");
    assert.equal(run.promptVersion, "ais-v1");
    // 序列第 4 篇之后复用最后一个响应（uncertain）
    assert.equal(run.uncertain >= 1, true);
    const list = await request(api, "GET", `/projects/${project.id}/screening/ai?runId=${runId}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.results.length, 6);
    assert.ok(list.body.results.every(item => item.sentScope === "metadata"));
    const tier1 = await request(api, "GET", `/projects/${project.id}/screening/ai?runId=${runId}&tier=1`);
    assert.ok(tier1.body.results.length >= 1);
    assert.ok(tier1.body.results.every(item => item.tier === 1));
    // 404
    const missing = await request(api, "GET", `/projects/${project.id}/screening/ai-runs/no-such-run`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "AI_SCREENING_RUN_NOT_FOUND");
    assert.ok(papers.length >= 6);
  })();
});

test("failed run keeps progress and resume continues from breakpoint without duplicates", (t) => {
  const { store, project } = fixture(t);
  // 第 2 篇（index 1）模型调用失败：第 1 篇结果保留，run 标 failed
  const state = { llm: fakeLlmFailOn(1, RESPONSES) };
  const api = createApiHandler(modelCtx(state), store);
  return (async () => {
    const created = await request(api, "POST", `/projects/${project.id}/screening/ai-runs`, { stage: "title_abstract" });
    const runId = created.body.run.id;
    const failed = await waitFor(() => store.getAiScreeningRun(project.id, runId).status === "failed");
    assert.ok(failed, "run 应在模型失败后标记 failed");
    const afterFail = store.getAiScreeningRun(project.id, runId);
    assert.equal(afterFail.processed, 1);
    assert.ok(afterFail.error.length > 0);
    // 换正常模型后断点续跑：只补剩余 5 篇，总数不重复
    state.llm = fakeLlmSequence(RESPONSES);
    const resumed = await request(api, "POST", `/projects/${project.id}/screening/ai-runs/${runId}/resume`, {});
    assert.equal(resumed.status, 200);
    const done = await waitFor(() => store.getAiScreeningRun(project.id, runId).status === "done");
    assert.ok(done, "resume 后 run 应完成");
    const run = store.getAiScreeningRun(project.id, runId);
    assert.equal(run.processed, 6);
    const results = await request(api, "GET", `/projects/${project.id}/screening/ai?runId=${runId}`);
    assert.equal(results.body.results.length, 6);
    // 一致率接口可用（人工尚未筛选 → sampleSize 0）
    const agreement = await request(api, "GET", `/projects/${project.id}/screening/ai-agreement?stage=title_abstract`);
    assert.equal(agreement.status, 200);
    assert.equal(agreement.body.available, true);
    assert.equal(agreement.body.sampleSize, 0);
  })();
});

// ── Agent 只读工具 get_ai_screening ──

import * as getAiScreeningTool from "../tools/get-ai-screening.js";

test("get_ai_screening tool reports runs, results, and agreement", (t) => {
  const { store, project, papers } = fixture(t);
  const ctx = { store, sessionId: "s-test", agentId: "a-test" };
  const empty = getAiScreeningTool.execute({ projectId: project.id }, ctx);
  assert.ok(empty.content[0].text.includes("还没有 AI 预筛任务"));
  assert.equal(getAiScreeningTool.name, "get_ai_screening");
  assert.equal(getAiScreeningTool.sessionPermission.readOnly, true);

  const run = runningRun(store, project);
  const base = { runId: run.id, perCriteria: [], sentScope: "metadata" };
  store.appendAiScreeningResult({ ...base, paperId: papers[0].id, decision: "include", confidence: 0.9, rationale: "符合纳入标准" });
  store.appendAiScreeningResult({ ...base, paperId: papers[1].id, decision: "uncertain", confidence: 0.4, rationale: "摘要信息不足" });

  const runsView = getAiScreeningTool.execute({ projectId: project.id }, ctx);
  assert.ok(runsView.content[0].text.includes("进度 2/6"));
  const resultsView = getAiScreeningTool.execute({ projectId: project.id, include: "results", tier: "1" }, ctx);
  assert.ok(resultsView.content[0].text.includes("建议纳入"));
  assert.ok(resultsView.content[0].text.includes("符合纳入标准"));
  const agreementView = getAiScreeningTool.execute({ projectId: project.id, include: "agreement" }, ctx);
  assert.ok(agreementView.content[0].text.includes("一致率"));
  const missing = getAiScreeningTool.execute({ projectId: "no-such" }, ctx);
  assert.ok(missing.content[0].text.includes("PROJECT_NOT_FOUND"));
});
