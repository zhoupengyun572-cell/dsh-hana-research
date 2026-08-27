// 端到端验证：心理学报同步 + 中文标题补全（真实网络）
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { syncJournalSource } from "../lib/journal-sync.js";
import { DOWNLOAD_ALLOWED_HOSTS } from "../lib/api.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-title-e2e-"));
const store = new ResearchStore(dir);

const startedAt = Date.now();
const outcome = await syncJournalSource({
  store,
  source: { id: "acta-psychologica-sinica", venue: "心理学报", issn: "0439-755X", topic: "情绪与健康" },
  perPage: 100,
  allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS,
});
console.log("outcome:", JSON.stringify(outcome), `(${(Date.now() - startedAt) / 1000}s)`);

const papers = store.listPapers().filter(p => p.sourceName === "期刊同步");
console.log("synced papers:", papers.length);
const zhCount = papers.filter(p => /[\u4e00-\u9fa5]/.test(p.title)).length;
console.log(`中文标题: ${zhCount}/${papers.length}`);
console.log("--- 标题样例 ---");
for (const p of papers.slice(0, 5)) console.log(" ", p.title.slice(0, 60));

// 幂等性：再次同步，存量更新不再重复补抓（标题已含中文）
const again = await syncJournalSource({
  store,
  source: { id: "acta-psychologica-sinica", venue: "心理学报", issn: "0439-755X", topic: "情绪与健康" },
  perPage: 100,
  allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS,
});
console.log("second sync outcome:", JSON.stringify(again));
const zhCount2 = store.listPapers().filter(p => p.sourceName === "期刊同步" && /[\u4e00-\u9fa5]/.test(p.title)).length;
console.log(`中文标题 after 2nd sync: ${zhCount2}/${store.listPapers().filter(p => p.sourceName === "期刊同步").length}`);

clearResearchStoreCache();
store.close();
fs.rmSync(dir, { recursive: true, force: true });
