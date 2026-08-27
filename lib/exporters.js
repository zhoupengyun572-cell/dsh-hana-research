import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { ResearchStoreError } from "./store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, "..", "assets", "vendor", "embedpdf", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "NotoSansHans-Regular.otf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSansHans-Bold.otf");
const DOC_FONT = "Noto Sans CJK SC";

const ROLE_LABELS = {
  core: "核心证据",
  background: "背景材料",
  method: "方法参考",
  compare: "结果对比",
};
const SCREENING_LABELS = { pending: "待筛选", include: "纳入", maybe: "待定", exclude: "排除" };

export function safeExportFileName(value, fallback = "研究项目") {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || fallback;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function projectExportData(store, projectId) {
  const project = store.getProject(projectId);
  if (!project) {
    throw new ResearchStoreError("PROJECT_NOT_FOUND", "项目不存在", 404);
  }
  return {
    project,
    notes: store.listNotes(projectId),
    matrix: store.buildEvidenceMatrix(projectId),
  };
}

function groupNotes(notes) {
  const groups = new Map();
  for (const note of notes) {
    const key = note.paperTitle || "项目通用笔记";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  return groups;
}

function noteMeta(note) {
  const parts = [];
  if (note.paperVenue) parts.push(note.paperVenue);
  if (note.paperYear) parts.push(String(note.paperYear));
  if (note.pageNumber) parts.push(`第 ${note.pageNumber} 页`);
  if (note.tags?.length) parts.push(note.tags.map((tag) => `#${tag}`).join(" "));
  if (note.linkedPaperTitle) parts.push(`关联《${note.linkedPaperTitle}》`);
  return parts.join(" · ");
}

function docxText(text, options = {}) {
  return new TextRun({ text: normalizeText(text), font: DOC_FONT, ...options });
}

/** 原生 Office Open XML 项目笔记（.docx）。 */
export async function buildProjectNotesDocx(store, projectId) {
  const { project, notes } = projectExportData(store, projectId);
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [docxText(project.title, { bold: true, size: 34, color: "23354D" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [docxText("HanaResearch 项目笔记", { size: 20, color: "64748B" })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [docxText(`笔记数量：${notes.length}`, { bold: true, size: 20 })],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [docxText(`导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, { size: 18, color: "64748B" })],
    }),
  ];

  if (!notes.length) {
    children.push(new Paragraph({ children: [docxText("目前还没有项目笔记。", { size: 21 })] }));
  } else {
    for (const [source, sourceNotes] of groupNotes(notes)) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 260, after: 120 },
        children: [docxText(source, { bold: true, size: 27, color: "2F5D62" })],
      }));
      for (const note of sourceNotes) {
        const meta = noteMeta(note) || "未标注来源信息";
        children.push(new Paragraph({
          spacing: { before: 140, after: 70 },
          keepNext: true,
          children: [docxText(meta, { bold: true, size: 18, color: "64748B" })],
        }));
        if (note.quote) {
          children.push(new Paragraph({
            indent: { left: 360 },
            spacing: { after: 80, line: 300 },
            children: [docxText(`“${normalizeText(note.quote)}”`, { italics: true, size: 20, color: "475569" })],
          }));
        }
        if (note.content) {
          children.push(new Paragraph({
            spacing: { after: 100, line: 340 },
            children: [docxText(note.content, { size: 21 })],
          }));
        }
        children.push(new Paragraph({
          spacing: { after: 100 },
          children: [docxText(`记录时间：${note.createdAt || "—"}`, { size: 16, color: "94A3B8" })],
        }));
      }
    }
  }

  const document = new Document({
    creator: "HanaResearch",
    title: `${project.title} - 项目笔记`,
    description: "由 HanaResearch 导出的结构化项目笔记",
    styles: {
      default: { document: { run: { font: DOC_FONT, size: 21 }, paragraph: { spacing: { line: 320 } } } },
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [docxText("HanaResearch · ", { size: 16, color: "94A3B8" }), new TextRun({ children: [PageNumber.CURRENT], font: DOC_FONT, size: 16, color: "94A3B8" })],
        })] }),
      },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

/** 使用内嵌中文字体生成可搜索文本的原生 PDF。 */
export async function buildProjectNotesPdf(store, projectId) {
  const { project, notes } = projectExportData(store, projectId);
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 58, right: 58, bottom: 58, left: 58 }, info: { Title: `${project.title} - 项目笔记`, Author: "HanaResearch" }, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("HanaRegular", FONT_REGULAR);
    doc.registerFont("HanaBold", FONT_BOLD);

    doc.font("HanaBold").fontSize(22).fillColor("#23354D").text(project.title, { align: "center" });
    doc.moveDown(0.25).font("HanaRegular").fontSize(11).fillColor("#64748B").text("HanaResearch 项目笔记", { align: "center" });
    doc.moveDown(1.2).font("HanaRegular").fontSize(9).fillColor("#64748B").text(`笔记数量：${notes.length}    导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`);
    doc.moveDown(1.3);

    if (!notes.length) {
      doc.font("HanaRegular").fontSize(11).fillColor("#334155").text("目前还没有项目笔记。", { lineGap: 5 });
    } else {
      for (const [source, sourceNotes] of groupNotes(notes)) {
        doc.moveDown(0.7).font("HanaBold").fontSize(15).fillColor("#2F5D62").text(source, { keepTogether: true });
        doc.moveDown(0.35);
        for (const note of sourceNotes) {
          doc.font("HanaBold").fontSize(8.5).fillColor("#64748B").text(noteMeta(note) || "未标注来源信息", { lineGap: 2 });
          if (note.quote) {
            doc.moveDown(0.25).font("HanaRegular").fontSize(9.5).fillColor("#475569").text(`“${normalizeText(note.quote)}”`, { indent: 14, lineGap: 4 });
          }
          if (note.content) {
            doc.moveDown(0.25).font("HanaRegular").fontSize(10.5).fillColor("#1E293B").text(normalizeText(note.content), { lineGap: 5 });
          }
          doc.moveDown(0.2).font("HanaRegular").fontSize(7.5).fillColor("#94A3B8").text(`记录时间：${note.createdAt || "—"}`);
          doc.moveDown(0.65);
        }
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      // Footer lives below the body margin; temporarily relax the margin so PDFKit
      // does not create an otherwise blank overflow page while drawing it.
      doc.page.margins.bottom = 0;
      doc.font("HanaRegular").fontSize(7.5).fillColor("#94A3B8").text(`HanaResearch · ${i + 1} / ${range.count}`, 58, doc.page.height - 30, { width: doc.page.width - 116, height: 10, align: "center", lineBreak: false });
    }
    doc.end();
  });
}

function codingDisplayValue(field, value) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.join("；");
  return value;
}

function matrixHeader(matrix) {
  return ["文献", "期刊", "年份", "研究设计", "证据角色", "题录筛选", "题录理由", "全文筛选", "全文理由", "笔记数", "笔记摘要", "标签", ...(matrix.fields || []).map(field => `编码：${field.label}`)];
}

function matrixRows(matrix) {
  return matrix.papers.map((paper) => [
    paper.title,
    paper.venue || "",
    paper.year || "",
    paper.design || "",
    ROLE_LABELS[paper.role] || paper.role || "",
    SCREENING_LABELS[paper.titleAbstractDecision] || paper.titleAbstractDecision || "待筛选",
    paper.titleAbstractReason || null,
    SCREENING_LABELS[paper.fullTextDecision] || paper.fullTextDecision || "待筛选",
    paper.fullTextReason || null,
    paper.noteCount,
    normalizeText(paper.notesSummary).replace(/\n+/g, " "),
    paper.tags || "",
    ...(matrix.fields || []).map(field => codingDisplayValue(field, paper.codingValues?.[field.id])),
  ]);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildEvidenceMatrixCsv(store, projectId) {
  const { matrix } = projectExportData(store, projectId);
  const header = matrixHeader(matrix);
  return Buffer.from(`\uFEFF${[header, ...matrixRows(matrix)].map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "utf8");
}

/** 原生 XLSX：冻结标题、筛选、语义列宽与结构化论证链。 */
export async function buildEvidenceMatrixXlsx(store, projectId) {
  const { project, matrix } = projectExportData(store, projectId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HanaResearch";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("证据矩阵", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const header = matrixHeader(matrix);
  const columnCount = header.length;
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell("A1").value = `${project.title} · 证据矩阵`;
  sheet.getCell("A1").font = { name: "Microsoft YaHei", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5D62" } };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 32;
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell("A2").value = `文献 ${matrix.papers.length} 篇 · 通用笔记 ${matrix.generalNotes.length} 条 · 论证关系 ${matrix.relations.length} 条`;
  sheet.getCell("A2").font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF64748B" } };
  const headerRow = sheet.getRow(4);
  headerRow.values = header;
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF496E72" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  for (const rowValues of matrixRows(matrix)) {
    const row = sheet.addRow(rowValues);
    row.alignment = { vertical: "top", wrapText: true };
    row.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF1E293B" } };
    row.height = Math.min(90, Math.max(24, Math.ceil(String(rowValues[10] || "").length / 55) * 16));
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: columnCount } };
  const customWidths = (matrix.fields || []).map(field => field.type === "number" ? 12 : field.type === "boolean" ? 10 : field.type === "text" ? 30 : 22);
  const widths = [38, 23, 10, 20, 16, 13, 28, 13, 28, 10, 55, 24, ...customWidths];
  sheet.columns.forEach((column, index) => { column.width = widths[index]; });
  sheet.getColumn(3).numFmt = "0";
  sheet.getColumn(10).numFmt = "0";
  for (let row = 5; row <= sheet.rowCount; row += 1) {
    if (row % 2 === 0) sheet.getRow(row).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7F7" } }; });
  }
  if ((matrix.fields || []).length) {
    const dictionary = workbook.addWorksheet("编码字典", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    dictionary.columns = [
      { header: "字段", key: "label", width: 24 },
      { header: "类型", key: "type", width: 14 },
      { header: "必填", key: "required", width: 10 },
      { header: "选项", key: "options", width: 42 },
      { header: "操作性定义", key: "description", width: 56 },
    ];
    const typeLabels = { text: "文本", number: "数字", select: "单选", multi_select: "多选", boolean: "是/否" };
    for (const field of matrix.fields) dictionary.addRow({
      label: field.label,
      type: typeLabels[field.type] || field.type,
      required: field.required ? "是" : "否",
      options: (field.options || []).length ? field.options.join("；") : null,
      description: field.description || null,
    });
    dictionary.getRow(1).eachCell((cell) => {
      cell.font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF496E72" } };
    });
    dictionary.eachRow((row, rowNumber) => {
      row.font = { name: "Microsoft YaHei", size: rowNumber === 1 ? 10 : 9.5 };
      row.alignment = { vertical: "top", wrapText: true };
    });
  }
  if (matrix.relations.length || matrix.generalNotes.length) {
    const relationSheet = workbook.addWorksheet("项目补充", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    relationSheet.columns = [{ header: "类型", key: "type", width: 16 }, { header: "内容", key: "content", width: 90 }];
    relationSheet.getRow(1).eachCell((cell) => {
      cell.font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF496E72" } };
    });
    for (const line of matrix.relations) relationSheet.addRow({ type: "论证关系", content: line });
    for (const line of matrix.generalNotes) relationSheet.addRow({ type: "通用笔记", content: line });
    relationSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
      row.font = { name: "Microsoft YaHei", size: 10 };
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildProjectExport(store, projectId, format) {
  const normalized = String(format || "").toLowerCase();
  const project = store.getProject(projectId);
  if (!project) {
    throw new ResearchStoreError("PROJECT_NOT_FOUND", "项目不存在", 404);
  }
  const stem = safeExportFileName(project.title);
  if (normalized === "docx") return { body: await buildProjectNotesDocx(store, projectId), fileName: `${stem}-项目笔记.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (normalized === "pdf") return { body: await buildProjectNotesPdf(store, projectId), fileName: `${stem}-项目笔记.pdf`, mime: "application/pdf" };
  if (normalized === "csv") return { body: buildEvidenceMatrixCsv(store, projectId), fileName: `${stem}-证据矩阵.csv`, mime: "text/csv; charset=utf-8" };
  if (normalized === "xlsx") return { body: await buildEvidenceMatrixXlsx(store, projectId), fileName: `${stem}-证据矩阵.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  throw new ResearchStoreError("EXPORT_FORMAT_UNSUPPORTED", "不支持的导出格式", 400);
}
