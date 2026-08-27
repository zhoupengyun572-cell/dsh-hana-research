// 官方 pdf.js PDFViewer 阅读器验证：加载/翻页/缩放/选中/保存
import { chromium } from "playwright";
const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 11754;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text().slice(0, 200)}`); });
try {
  // 直接打开阅读器页
  await page.goto(`${base}/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".pdfViewer .page .textLayer", { timeout: 60000 });
  await page.waitForTimeout(3000);
  const pageCount = await page.locator("#reader-page-count").innerText();
  console.log("总页数:", pageCount);
  console.log("页面容器:", await page.locator(".pdfViewer .page").count());
  console.log("标题:", (await page.locator("#reader-paper").innerText()).slice(0, 40));
  const zoom = await page.locator("#reader-zoom").innerText();
  console.log("初始缩放:", zoom);

  // 翻页
  await page.locator("#reader-next").click();
  await page.waitForTimeout(1500);
  const pageNo = await page.locator("#reader-page").inputValue();
  console.log("翻页后页码:", pageNo);

  // 缩放
  await page.locator("#reader-zoom-in").click();
  await page.waitForTimeout(800);
  console.log("放大后:", await page.locator("#reader-zoom").innerText());

  // 文本选择（零干预原生选区）→ 弹窗 → 保存
  const firstSpan = page.locator(".pdfViewer .page .textLayer span").filter({ hasText: /[\u4e00-\u9fa5A-Za-z0-9]/ }).first();
  const box = await firstSpan.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 80, box.y + box.height / 2 + 60, { steps: 10 });
    await page.waitForTimeout(400);
    // 零干预：拖动中无自定义预览矩形，由浏览器原生选区渲染
    console.log("拖动中自定义预览(应=0):", await page.locator(".hana-preview").count());
    await page.mouse.up();
    await page.waitForSelector(".selection-popover", { timeout: 8000 });
    const quote = (await page.locator(".selection-popover blockquote").innerText()).replace(/\s+/g, " ").slice(0, 80);
    console.log("摘录:", quote);
    await page.locator("#sel-save").click();
    await page.waitForTimeout(2000);
    const savedAnno = await page.evaluate(() => fetch(`/api/hana-research/projects/project-adolescent-emotion/reader/1e76fc37-7294-4a66-a6af-12d1e82b3d54`).then(r => r.json()).then(d => (d.annotations || []).length));
    console.log("批注数:", savedAnno);
    // 已保存批注应渲染在覆盖层
    const annos = await page.locator(".hana-anno").count();
    console.log("覆盖层批注:", annos);
  }

  // 笔记面板
  await page.locator("#reader-notes").click();
  await page.waitForTimeout(1500);
  console.log("笔记面板条目:", await page.locator(".reader-note-item").count());

  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
  console.log("VIEWER-OK");
} catch (e) {
  console.log("VIEWER-FAILED:", e.message);
  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
}
await browser.close();
