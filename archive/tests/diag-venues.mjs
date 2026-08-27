// 临时诊断脚本：查看 papers 表的 venue 分布
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";

const dbPath = join(homedir(), ".dsh", "plugin-data", "hana-research", "research.db");
const db = new DatabaseSync(dbPath, { readOnly: true });

console.log("=== venue 分布 ===");
const rows = db.prepare("SELECT venue, COUNT(*) AS n FROM papers GROUP BY venue ORDER BY n DESC").all();
for (const r of rows) console.log(JSON.stringify(r.venue), r.n);

console.log("\n=== 心理学报 相关文献（title 前 8 条）===");
const xlxb = db.prepare("SELECT id, title, venue, source_name, year FROM papers WHERE venue LIKE '%心理学报%' OR title LIKE '%心理学报%' LIMIT 8").all();
for (const r of xlxb) console.log(r.id, "|", r.venue, "|", r.source_name, "|", r.year, "|", String(r.title).slice(0, 40));

console.log("\n=== venue 含隐藏字符检查（心理学报 hex）===");
const probe = db.prepare("SELECT DISTINCT venue FROM papers WHERE venue LIKE '%心理学报%'").all();
for (const r of probe) {
  const hex = [...r.venue].map(c => c.codePointAt(0).toString(16)).join(" ");
  console.log(JSON.stringify(r.venue), "len:", r.venue.length, "hex:", hex);
}

db.close();
