import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";
import {
  buildEvidenceMatrixCsv,
  buildEvidenceMatrixXlsx,
  buildProjectExport,
  buildProjectNotesDocx,
  buildProjectNotesPdf,
  safeExportFileName,
} from "../lib/exporters.js";

function makeFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-export-"));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const project = store.createProject({ title: "情绪调节：证据/综述", description: "导出测试" });
  const paper = store.listPapers()[0];
  store.addPaperToProject(project.id, paper.id);
  store.setPaperRole(project.id, paper.id, "core");
  store.createNote({
    projectId: project.id,
    paperId: paper.id,
    pageNumber: 12,
    content: "认知重评与更好的情绪结果相关。",
    quote: "这是包含中文、英文 emotion regulation 与标点的引文。",
    tags: ["关键证据", "研究方法"],
  });
  store.createNote({ projectId: project.id, content: "需要进一步检查样本代表性。", tags: ["待核查"] });
  const fields = store.replaceEvidenceFields(project.id, [
    { label: "样本量", type: "number", required: true, description: "最终分析样本" },
    { label: "偏倚风险", type: "select", options: ["低风险", "高风险"] },
  ]);
  store.updatePaperEvidenceCoding({ projectId: project.id, paperId: paper.id, values: { [fields[0].id]: 128, [fields[1].id]: "低风险" } });
  return { store, project };
}

function requestBinary(api, pathname) {
  const req = { method: "GET", headers: {}, async *[Symbol.asyncIterator]() {} };
  const res = {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(chunk) { this.body = chunk; },
  };
  const url = new URL(`http://dsh.local/api/hana-research${pathname}`);
  return api.handle(req, res, url).then(() => res);
}

test("native DOCX export is a valid OOXML package", async (t) => {
  const { store, project } = makeFixture(t);
  const body = await buildProjectNotesDocx(store, project.id);
  assert.equal(body.subarray(0, 2).toString("ascii"), "PK");
  const packageText = body.toString("latin1");
  assert.ok(packageText.includes("[Content_Types].xml"));
  assert.ok(packageText.includes("word/document.xml"));
  assert.ok(body.length > 5_000);
});

test("native PDF export embeds pages and CJK font data", async (t) => {
  const { store, project } = makeFixture(t);
  const body = await buildProjectNotesPdf(store, project.id);
  assert.equal(body.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(body.toString("latin1").includes("%%EOF"));
  assert.ok(body.length > 10_000);
});

test("CSV export uses UTF-8 BOM and quoted evidence columns", (t) => {
  const { store, project } = makeFixture(t);
  const body = buildEvidenceMatrixCsv(store, project.id);
  assert.deepEqual([...body.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = body.toString("utf8");
  assert.ok(text.includes('"文献","期刊","年份"'));
  assert.ok(text.includes("关键证据"));
  assert.ok(text.includes("认知重评"));
  assert.ok(text.includes('"编码：样本量","编码：偏倚风险"'));
  assert.ok(text.includes('"128","低风险"'));
});

test("native XLSX export contains workbook and worksheet OOXML", async (t) => {
  const { store, project } = makeFixture(t);
  const body = await buildEvidenceMatrixXlsx(store, project.id);
  assert.equal(body.subarray(0, 2).toString("ascii"), "PK");
  const packageText = body.toString("latin1");
  assert.ok(packageText.includes("xl/workbook.xml"));
  assert.ok(packageText.includes("xl/worksheets/sheet1.xml"));
  assert.ok(body.length > 5_000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ["证据矩阵", "编码字典", "项目补充"]);
  assert.equal(workbook.getWorksheet("证据矩阵").getRow(4).getCell(13).value, "编码：样本量");
  assert.equal(workbook.getWorksheet("证据矩阵").getRow(5).getCell(13).value, 128);
});

test("export dispatcher sets native file names and rejects unsupported formats", async (t) => {
  const { store, project } = makeFixture(t);
  const docx = await buildProjectExport(store, project.id, "DOCX");
  assert.ok(docx.fileName.endsWith(".docx"));
  assert.equal(docx.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(safeExportFileName('a<b>:c/'), "a_b__c_");
  await assert.rejects(() => buildProjectExport(store, project.id, "html"), (error) => error.code === "EXPORT_FORMAT_UNSUPPORTED" && error.status === 400);
});

test("project export API returns binary headers and a native payload", async (t) => {
  const { store, project } = makeFixture(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const response = await requestBinary(api, `/projects/${project.id}/export?format=pdf`);
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/pdf");
  assert.match(response.headers["content-disposition"], /\.pdf/);
  assert.equal(response.headers["content-length"], String(response.body.length));
  assert.equal(response.body.subarray(0, 5).toString("ascii"), "%PDF-");

  const invalid = await requestBinary(api, `/projects/${project.id}/export?format=html`);
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.body).error, "EXPORT_FORMAT_UNSUPPORTED");
});
