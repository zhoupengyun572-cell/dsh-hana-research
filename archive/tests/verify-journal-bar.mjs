// 验证期刊栏修复：badge 显示总数 + chip 点击筛选
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 1094;
const url = `http://127.0.0.1:${port}/ui/hana-research/literature`;

const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector(".paper-card", { timeout: 15000 });
await page.waitForTimeout(1500); // 等期刊栏加载

// 1. 期刊栏 badge 显示
const chipTexts = await page.locator(".journal-source-chip").allInnerTexts();
const xlxbChip = chipTexts.find(t => t.includes("心理学报"));
const cnChip = chipTexts.find(t => t.includes("中国临床心理学杂志"));
console.log("心理学报 chip:", JSON.stringify(xlxbChip));
console.log("中国临床心理学杂志 chip:", JSON.stringify(cnChip));

// 2. 点击期刊栏 chip → 筛选文献列表
await page.locator('[data-journal-venue="心理学报"]').click();
await page.waitForTimeout(500);
const countText = await page.locator("#paper-count").innerText();
console.log("after journal-bar chip click 心理学报 ->", countText);
const visible = await page.locator(".paper-card:not(.filtered)").count();
console.log("visible cards:", visible);

// 3. 切回全部
await page.locator('[data-venue="全部"]').click();
await page.waitForTimeout(300);

// 4. 点击中国临床心理学杂志 chip（中文含长名）
await page.locator('[data-journal-venue="中国临床心理学杂志"]').click();
await page.waitForTimeout(500);
const countText2 = await page.locator("#paper-count").innerText();
console.log("after chip click 中国临床心理学杂志 ->", countText2);

console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
