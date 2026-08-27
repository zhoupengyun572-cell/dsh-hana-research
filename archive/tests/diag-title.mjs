// 诊断：OpenAlex 对心理学报文献的标题字段
import { fetchJson } from "../lib/literature-search.js";

const doi = "https://doi.org/10.3724/SP.J.1041.2026.2153";
const body = await fetchJson(`https://api.openalex.org/works/${encodeURIComponent(doi)}`, "OpenAlex", { timeoutMs: 15000, cacheTtlMs: 0 });

console.log("display_name:", body.display_name);
console.log("title:", body.title);
console.log("display_name_language:", body.display_name_language);
console.log("language:", body.language);
console.log("alternative_titles:", JSON.stringify(body.alternative_titles));
console.log("primary_location.source:", body.primary_location?.source?.display_name);
console.log("landing_page_url:", body.primary_location?.landing_page_url);
console.log("best_oa:", body.best_oa_location?.pdf_url);

// 对照：Crossref 记录
try {
  const cr = await fetchJson("https://api.crossref.org/works/10.3724/SP.J.1041.2026.2153", "Crossref", { timeoutMs: 15000, cacheTtlMs: 0 });
  const msg = cr.message;
  console.log("\nCrossref title:", JSON.stringify(msg.title));
  console.log("Crossref original-title:", JSON.stringify(msg["original-title"]));
  console.log("Crossref subtitle:", JSON.stringify(msg.subtitle));
} catch (e) {
  console.log("\nCrossref error:", e.message);
}
