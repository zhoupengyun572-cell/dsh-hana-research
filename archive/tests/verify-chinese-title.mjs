// 验证 chinese-title 模块：URL 推导 + 真实抓取
import { officialArticlePageUrl, fetchChineseTitle, CN_TITLE_JOURNALS } from "../lib/chinese-title.js";

console.log("CN_TITLE_JOURNALS:", [...CN_TITLE_JOURNALS].join(", "));

// 1) PDF 直链推导
const withPdf = officialArticlePageUrl({
  pdfUrl: "https://journal.psych.ac.cn/xlxb/CN/article/downloadArticleFile.do?attachType=PDF&id=16470",
  doi: null,
});
console.log("PDF 直链 →", withPdf);

// 2) DOI 推导
const withDoi = officialArticlePageUrl({
  pdfUrl: null,
  doi: "10.3724/SP.J.1041.2026.2008",
});
console.log("DOI →", withDoi);

// 3) 不适用
console.log("不适用 →", officialArticlePageUrl({ pdfUrl: null, doi: "10.3389/fpsyg.2024.1425465" }));

// 4) 真实抓取（PDF 直链推导的页面）
if (withPdf) {
  const zh = await fetchChineseTitle(withPdf);
  console.log("抓取标题:", zh);
}

// 5) 真实抓取（DOI 推导的页面）
if (withDoi) {
  const zh2 = await fetchChineseTitle(withDoi);
  console.log("抓取标题2:", zh2);
}
