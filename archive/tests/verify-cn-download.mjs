// 验证：心理学报官网 PDF 下载链路（真实）
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { downloadAndStorePdf } from "../lib/pdf-import.js";
import { DOWNLOAD_ALLOWED_HOSTS } from "../lib/api.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-dl-"));
const store = new ResearchStore(dir);
try {
  const paper = {
    id: "cn-test",
    doi: "10.3724/SP.J.1041.2026.2153",
    title: "测试心理学报",
    authors: "",
    venue: "心理学报",
    year: 2026,
    abstract: "",
    topic: "情绪与健康",
    pdfUrl: "https://journal.psych.ac.cn/xlxb/CN/article/downloadArticleFile.do?attachType=PDF&id=16470",
    sourceUrl: "https://journal.psych.ac.cn/xlxb/CN/10.3724/SP.J.1041.2026.2153",
    sourceName: "期刊同步",
  };
  const result = await downloadAndStorePdf({
    store,
    projectId: store.listProjects()[0].id,
    paper,
    allowedHosts: DOWNLOAD_ALLOWED_HOSTS,
  });
  console.log("downloaded:", result.attachment?.fileName, "|", result.attachment?.byteSize, "bytes | reused:", result.reused);
  const att = store.getAttachment(result.attachment.id);
  console.log("file exists:", fs.existsSync(att.absolutePath));
  // 验证 PDF 签名
  const head = fs.readFileSync(att.absolutePath).subarray(0, 8).toString("latin1");
  console.log("PDF header:", JSON.stringify(head));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  clearResearchStoreCache();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
