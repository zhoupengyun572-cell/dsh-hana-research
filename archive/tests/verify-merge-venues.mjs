// UI 合并验证：期刊筛选统一入口（原 #venues 行已移除）
import { chromium } from "playwright";
const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 14934;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
try {
  await page.goto(`${base}/ui/hana-research/literature`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".paper-card", { timeout: 20000 });
  await page.waitForSelector("[data-journal-venue]", { timeout: 15000 });
  await page.waitForTimeout(1800);
  console.log("旧 #venues 行(应=0):", await page.locator("#venues").count());
  console.log("全部期刊 chip:", await page.locator('[data-journal-venue="全部"]').count());
  console.log("分组数:", await page.locator("details.journal-group").count());
  console.log("其他来源组:", await page.locator('details[data-journal-group="other"]').count());
  const total = await page.locator(".paper-card:not(.filtered)").count();
  console.log("未筛选可见文献:", total);
  console.log("计数:", (await page.locator("#paper-count").innerText()).trim());
  // 点击国内期刊组第一个 chip 筛选
  const chip = page.locator('details[data-journal-group="cn"] [data-journal-venue]').first();
  const venue = await chip.getAttribute("data-journal-venue");
  await chip.click();
  await page.waitForTimeout(700);
  const active = await page.locator("[data-journal-venue].active").count();
  const filtered = await page.locator(".paper-card:not(.filtered)").count();
  console.log(`筛选「${venue}」: 高亮=${active} 可见=${filtered} (应<${total})`);
  console.log("筛选计数:", (await page.locator("#paper-count").innerText()).trim());
  // 其他来源组 chip 也可筛选
  const otherChip = page.locator('details[data-journal-group="other"] [data-journal-venue]').first();
  if (await otherChip.count()) {
    await otherChip.click();
    await page.waitForTimeout(600);
    console.log("其他来源筛选可见:", await page.locator(".paper-card:not(.filtered)").count());
  }
  // 全部期刊 → 清除
  await page.locator('[data-journal-venue="全部"]').click();
  await page.waitForTimeout(500);
  console.log("清除后可见:", await page.locator(".paper-card:not(.filtered)").count(), "(应=全部)");
  console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
  console.log("MERGE-OK");
} catch (e) {
  console.log("MERGE-FAILED:", e.message);
}
await browser.close();
