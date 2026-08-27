// P1 批次3 smoke：收藏集按钮/modal/筛选、导出收藏按钮
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 2048;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));

try {
	await page.goto(`${base}/ui/hana-research/literature`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector(".paper-card", { timeout: 15000 });
	await page.waitForTimeout(1000);

	console.log("收藏集按钮(卡片):", await page.locator("[data-collections]").count());
	console.log("集合筛选下拉:", await page.locator("#collection-filter").count());
	console.log("导出收藏按钮:", await page.locator("#export-favorites").count());

	// 打开收藏集 modal
	await page.locator("[data-collections]").first().click();
	await page.waitForTimeout(600);
	console.log("集合 modal:", await page.locator("#collection-check-list").count());
	console.log("新建集合表单:", await page.locator("#collection-create-form").count());
	await page.locator('[data-modal-cancel]').first().click();
	await page.waitForTimeout(300);

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
} catch (e) {
	console.log("SMOKE FAILED:", e.message);
}
await browser.close();
