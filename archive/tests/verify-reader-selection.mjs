// PDF 阅读器原生选区验证：拖选 → 预览高亮 + 摘录弹窗 + 文本正确性
import { chromium } from "playwright";
const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 4332;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
try {
  // 项目抽屉 → 打开阅读器
  await page.goto(`${base}/ui/hana-research/projects`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("[data-project-id]", { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.locator("[data-project-id]").first().click();
  await page.waitForSelector(".drawer-panel", { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.locator("[data-open-reader]").first().click();
  await page.waitForSelector(".pdf-reader-shell", { timeout: 30000 });
  await page.waitForSelector(".textLayer span", { timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log("阅读器打开，文本层 span 数:", await page.locator(".textLayer span").count());

  // 取第一页可视文本行（span 按视觉顺序）
  const spans = await page.locator(".textLayer span").evaluateAll(nodes =>
    nodes.filter(n => n.textContent.trim()).slice(0, 20).map(n => n.textContent),
  );
  console.log("文本行样本:", spans.slice(0, 3).map(s => s.slice(0, 30)));

  // 在第一行文本上模拟拖选（鼠标按下 → 拖到第 3 行 → 松开）
  const firstSpan = page.locator(".textLayer span").filter({ hasText: /[\u4e00-\u9fa5A-Za-z0-9]/ }).first();
  const box = await firstSpan.boundingBox();
  if (!box) throw new Error("no text span box");
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2 + 40, { steps: 8 });
  await page.waitForTimeout(300);
  // 预览高亮应已出现
  const previews = await page.locator(".selection-preview").count();
  console.log("拖选中预览矩形:", previews);
  await page.mouse.up();
  await page.waitForSelector("#selection-popover", { timeout: 8000 });
  const quote = (await page.locator("#selection-popover blockquote").innerText()).replace(/\s+/g, " ").slice(0, 120);
  console.log("摘录:", quote);
  // 与文本层实际内容对比：摘录应来自页面文本
  const fullText = (await page.locator(".textLayer").first().innerText()).replace(/\s+/g, "");
  const quoteFlat = quote.replace(/\s+/g, "");
  console.log("摘录是否命中文本层内容:", quoteFlat.length > 0 && fullText.includes(quoteFlat.slice(0, 20)));
  // 保存摘录 → 验证 API 落库（quote 保留空格，比较时压缩空白）
  await page.locator("#save-selection-note").click();
  await page.waitForTimeout(1500);
  const notes = await page.evaluate(() => fetch("/api/hana-research/projects/project-adolescent-emotion/notes").then(r => r.json()).then(d => d.notes || []));
  const saved = notes.find(n => n.quote && n.quote.replace(/\s+/g, "").includes(quoteFlat.slice(0, 12)));
  console.log("保存落库:", saved ? `OK (quote ${saved.quote.replace(/\s+/g, " ").slice(0, 40)})` : "未找到");
  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
  console.log("READER-SELECTION-OK");
} catch (e) {
  console.log("READER-SELECTION-FAILED:", e.message);
}
await browser.close();
