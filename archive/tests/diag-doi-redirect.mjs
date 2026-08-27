// 诊断：DOI 是否能重定向到国内期刊官网文章页
const dois = [
  "https://doi.org/10.3724/SP.J.1041.2026.2008",   // 心理学报（无 pdfUrl 的样本）
  "https://doi.org/10.3724/SP.J.1042.2026.1084",   // 心理科学进展
  "https://doi.org/10.16128/j.cnki.1005-3611.2024.05.001", // 中国临床心理学杂志（猜测前缀，可能 404）
];

for (const doi of dois) {
  try {
    const r = await fetch(doi, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    const location = r.headers.get("location");
    console.log(doi);
    console.log("  status:", r.status, "| location:", location);
  } catch (e) {
    console.log(doi, "ERROR:", e.message);
  }
}
