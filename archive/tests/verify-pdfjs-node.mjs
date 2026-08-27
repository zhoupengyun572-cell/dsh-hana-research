// 验证：pdfjs.mjs 能否在 Node 环境动态 import（翻译任务用）
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const pdfjsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "vendor", "pdfjs.mjs");
console.log("pdfjs exists:", fs.existsSync(pdfjsPath), pdfjsPath);

try {
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  console.log("pdfjs loaded OK | getDocument:", typeof pdfjs.getDocument);
  // 用真实 PDF（心理学报官网下载的）验证文本提取
  // 先下载一篇小 PDF 验证 extractPdfText 链路
  const res = await fetch("https://arxiv.org/pdf/1706.03762", { signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("downloaded arxiv pdf:", buf.length, "bytes");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  console.log("pages:", doc.numPages);
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = (content.items || []).map(item => item?.str || "").join(" ").slice(0, 120);
  console.log("page1 text:", JSON.stringify(text));
  await doc.destroy();
} catch (e) {
  console.log("FAILED:", e.message);
}
