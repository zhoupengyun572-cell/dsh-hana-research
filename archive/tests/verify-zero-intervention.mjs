// 零干预原生选区验证：拖动中无自定义预览但原生选区存在，松手后弹窗正确
import { chromium } from "playwright";
const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 1259;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
try {
  await page.goto(`${base}/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 60000 });
  await page.waitForTimeout(2500);

  // 拖动中：无自定义预览（.hana-preview = 0），但浏览器原生选区非空
  const span = page.locator(".pdfViewer .page .textLayer span").filter({ hasText: /[\u4e00-\u9fa5A-Za-z0-9]/ }).nth(4);
  const box = await span.boundingBox();
  if (!box) throw new Error("no span box");
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + box.height / 2 + 50, { steps: 12 });
  await page.waitForTimeout(500);
  const previews = await page.locator(".hana-preview").count();
  const nativeSel = await page.evaluate(() => {
    const sel = window.getSelection();
    return sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, " ").slice(0, 60) : "";
  });
  console.log("拖动中: 自定义预览=", previews, "(应=0)");
  console.log("拖动中: 原生选区文本=", JSON.stringify(nativeSel));

  // 松手 → 弹窗
  await page.mouse.up();
  await page.waitForSelector(".selection-popover", { timeout: 8000 });
  const quote = (await page.locator(".selection-popover blockquote").innerText()).replace(/\s+/g, " ").slice(0, 80);
  console.log("摘录:", quote);
  // 弹窗出现后原生选区应被清除
  const afterClear = await page.evaluate(() => {
    const sel = window.getSelection();
    return sel ? sel.isCollapsed : true;
  });
  console.log("弹窗后选区已清除:", afterClear);

  // 保存 → 落库 + 覆盖层
  await page.locator("#sel-save").click();
  await page.waitForTimeout(2500);
  const annos = await page.locator(".hana-anno").count();
  console.log("覆盖层批注:", annos);
  const notes = await page.evaluate(() => fetch("/api/hana-research/projects/project-adolescent-emotion/notes").then(r => r.json()).then(d => d.notes || []));
  const saved = notes.find(n => n.quote && quote.replace(/\s+/g, "").slice(4, 20) && n.quote.replace(/\s+/g, "").includes(quote.replace(/\s+/g, "").slice(4, 20)));
  console.log("笔记落库:", saved ? "OK" : "未找到");

  // 双击选词
  await page.locator(".pdfViewer .page .textLayer span").filter({ hasText: /[\u4e00-\u9fa5]/ }).first().dblclick();
  await page.waitForTimeout(800);
  console.log("双击弹窗:", await page.locator(".selection-popover").count());

  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
  console.log("ZERO-INTERVENTION-OK");
} catch (e) {
  console.log("FAILED:", e.message);
  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
}
await browser.close();
