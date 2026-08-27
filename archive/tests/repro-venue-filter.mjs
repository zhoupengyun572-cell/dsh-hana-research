// 复现：打开文献中心，点击「心理学报」chip，统计可见卡片数
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 1094;
const url = `http://127.0.0.1:${port}/ui/hana-research/literature`;

const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
page.on("console", (msg) => console.log("[console]", msg.type(), msg.text().slice(0, 200)));
page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 300)));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector(".paper-card", { timeout: 15000 });

const totalCards = await page.locator(".paper-card").count();
console.log("total cards:", totalCards);

// 列出所有 venue chip
const chips = await page.locator('[data-venue]').allInnerTexts();
console.log("venue chips:", chips.join(" | "));

// 点击「心理学报」
const xlxb = page.locator('[data-venue="心理学报"]');
console.log("心理学报 chip count:", await xlxb.count());
if (await xlxb.count()) {
  await xlxb.first().click();
  await page.waitForTimeout(500);
  const visible = await page.locator(".paper-card:not(.filtered)").count();
  const countText = await page.locator("#paper-count").innerText();
  console.log("after click 心理学报 -> visible cards:", visible, "| count text:", countText);
  // 检查心理学报卡片的实际 data-venue 值
  const venues = await page.locator('.paper-card[data-venue="心理学报"]').count();
  console.log("cards with data-venue=心理学报 in DOM:", venues);
}

// 对比：点击「Emotion」
const emotion = page.locator('[data-venue="Emotion"]');
if (await emotion.count()) {
  await emotion.first().click();
  await page.waitForTimeout(500);
  const visible = await page.locator(".paper-card:not(.filtered)").count();
  const countText = await page.locator("#paper-count").innerText();
  console.log("after click Emotion -> visible cards:", visible, "| count text:", countText);
}

await browser.close();
