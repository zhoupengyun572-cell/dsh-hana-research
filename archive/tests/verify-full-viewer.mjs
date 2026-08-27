// 官方完整 viewer 验证：加载/选择/浮动高亮按钮/高亮保存到数据库/覆盖层
import { chromium } from "playwright";
const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 2341;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGE: " + String(e).slice(0, 250)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CON: " + m.text().slice(0, 220)); });
try {
  await page.goto(`${base}/ui/hana-research/reader?projectId=project-adolescent-emotion&attachmentId=1e76fc37-7294-4a66-a6af-12d1e82b3d54`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".pdfViewer .page .textLayer span", { timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log("pages:", await page.locator(".pdfViewer .page").count());
  console.log("backBtn:", await page.locator("#hana-reader-back").count());
  console.log("highlightBtn:", await page.locator("#editorHighlightButton").count());

  // 1) 文本选择（官方 SelectionManager 层）
  const span = page.locator(".pdfViewer .page .textLayer span").filter({ hasText: /[\u4e00-\u9fa5A-Za-z0-9]/ }).nth(6);
  const box = await span.boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + box.height / 2 + 40, { steps: 12 });
  await page.waitForTimeout(500);
  const selText = await page.evaluate(() => {
    const s = window.getSelection();
    return s && !s.isCollapsed ? s.toString().replace(/\s+/g, " ").slice(0, 50) : "";
  });
  console.log("原生选区:", JSON.stringify(selText));
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // 2) 浮动高亮按钮（官方 enableHighlightFloatingButton）
  const floating = await page.locator(".highlightButton, #highlightButton, [data-editor-type='highlight']").count();
  const floatingAny = await page.evaluate(() => document.body.innerText.includes("高亮") ? document.body.innerText.match(/.{0,10}高亮.{0,10}/g)?.slice(0, 3) : null);
  console.log("浮动按钮区文本:", JSON.stringify(floatingAny));

  // 3) 点击官方高亮按钮 → 高亮 editor 创建 → MutationObserver 保存数据库
  const hlBtn = page.locator("#editorHighlightButton");
  if (await hlBtn.count()) {
    await hlBtn.click();
    await page.waitForTimeout(600);
    // 高亮模式下再拖选一次
    const span2 = page.locator(".pdfViewer .page .textLayer span").filter({ hasText: /[\u4e00-\u9fa5A-Za-z0-9]/ }).nth(10);
    const box2 = await span2.boundingBox();
    await page.mouse.move(box2.x + 5, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(box2.x + 200, box2.y + box2.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(3000);
    const editors = await page.locator(".highlightEditor").count();
    console.log("官方高亮 editor:", editors);
    // 数据库校验
    const notes = await page.evaluate(() => fetch("/api/hana-research/projects/project-adolescent-emotion/notes").then(r => r.json()).then(d => d.notes || []));
    const saved = notes.filter(n => n.quote && n.quote.length > 4);
    console.log("数据库摘录笔记:", saved.length, "最新:", saved[0] ? saved[0].quote.replace(/\s+/g, " ").slice(0, 40) : "-");
  }

  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
  console.log("FULL-VIEWER-OK");
} catch (e) {
  console.log("FAILED:", e.message);
  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
}
await browser.close();
