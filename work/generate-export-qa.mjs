import fs from "node:fs";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import {
  buildEvidenceMatrixCsv,
  buildEvidenceMatrixXlsx,
  buildProjectNotesDocx,
  buildProjectNotesPdf,
} from "../lib/exporters.js";

const outputDir = path.resolve("output", "qa-export-v31");
const dataDir = path.resolve("work", "qa-export-data");
fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
const store = new ResearchStore(dataDir);

try {
  const project = store.createProject({ title: "青少年情绪调节与心理适应", description: "导出视觉验收样例" });
  const papers = store.listPapers().slice(0, 3);
  const fields = store.replaceEvidenceFields(project.id, [
    { label: "样本人群", type: "text", required: true, description: "研究实际纳入的目标人群" },
    { label: "样本量", type: "number", required: false, description: "最终分析样本量" },
    { label: "偏倚风险", type: "select", options: ["低风险", "部分担忧", "高风险"], required: true },
    { label: "测量方式", type: "multi_select", options: ["自评问卷", "行为任务", "访谈"], required: false },
    { label: "预注册", type: "boolean", required: false },
  ]);
  const fieldIds = Object.fromEntries(fields.map(field => [field.label, field.id]));
  for (const [index, paper] of papers.entries()) {
    store.addPaperToProject(project.id, paper.id);
    store.setPaperRole(project.id, paper.id, ["core", "method", "compare"][index]);
    store.setPaperMethodology(paper.id, [["纵向研究", "问卷"], ["实验研究", "行为任务"], ["系统综述", "元分析"]][index]);
    store.createNote({
      projectId: project.id,
      paperId: paper.id,
      pageNumber: 7 + index * 5,
      quote: `样例引文 ${index + 1}：Emotion regulation strategies showed meaningful associations with adjustment outcomes across contexts.`,
      content: index === 0
        ? "认知重评与较好的心理适应相关，但这一结论仍需结合样本年龄、测量时间点及文化背景判断。该段用于检查较长中文正文在 Word 与 PDF 中的自动换行和跨页表现。"
        : `第 ${index + 1} 条证据用于比较研究设计、样本人群与测量工具，并保留英文术语 cognitive reappraisal。`,
      tags: ["关键证据", index === 1 ? "研究方法" : "待核查"],
    });
    store.updatePaperScreening({ projectId: project.id, paperId: paper.id, stage: "title_abstract", decision: index === 2 ? "exclude" : "include", reason: index === 2 ? "非目标人群" : "" });
    if (index < 2) store.updatePaperScreening({ projectId: project.id, paperId: paper.id, stage: "full_text", decision: index === 0 ? "include" : "maybe", reason: index === 1 ? "全文信息仍需核对" : "" });
    store.updatePaperEvidenceCoding({ projectId: project.id, paperId: paper.id, values: {
      [fieldIds.样本人群]: ["12–18 岁青少年", "大学生样本", "社区成人样本"][index],
      [fieldIds.样本量]: [286, 144, 62][index],
      [fieldIds.偏倚风险]: ["低风险", "部分担忧", "高风险"][index],
      [fieldIds.测量方式]: [["自评问卷"], ["行为任务", "自评问卷"], ["访谈"]][index],
      [fieldIds.预注册]: [true, false, null][index],
    } });
  }
  store.createNote({ projectId: project.id, content: "综合判断：现有证据方向较一致，但仍需补充反向证据并检查发表偏倚。", tags: ["综合", "下一步"] });
  await fs.promises.writeFile(path.join(outputDir, "项目笔记.docx"), await buildProjectNotesDocx(store, project.id));
  await fs.promises.writeFile(path.join(outputDir, "项目笔记.pdf"), await buildProjectNotesPdf(store, project.id));
  await fs.promises.writeFile(path.join(outputDir, "证据矩阵.xlsx"), await buildEvidenceMatrixXlsx(store, project.id));
  await fs.promises.writeFile(path.join(outputDir, "证据矩阵.csv"), buildEvidenceMatrixCsv(store, project.id));
  process.stdout.write(`${outputDir}\n`);
} finally {
  store.close();
  clearResearchStoreCache();
}
