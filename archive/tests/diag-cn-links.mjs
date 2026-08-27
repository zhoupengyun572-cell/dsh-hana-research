// 诊断：国内期刊文献的 pdfUrl/sourceUrl 形态（能否推导官网文章页）
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";

const db = new DatabaseSync(join(homedir(), ".dsh", "plugin-data", "hana-research", "research.db"), { readOnly: true });
const venues = ["心理学报", "心理科学进展", "中国临床心理学杂志", "心理发展与教育", "心理科学"];
for (const venue of venues) {
  const rows = db.prepare("SELECT title, pdf_url, source_url FROM papers WHERE venue = ? AND source_name = '期刊同步' LIMIT 3").all(venue);
  console.log(`=== ${venue} (sample ${rows.length}) ===`);
  for (const r of rows) {
    console.log(" title:", String(r.title).slice(0, 60));
    console.log(" pdfUrl:", r.pdf_url);
    console.log(" sourceUrl:", r.source_url);
  }
}
db.close();
