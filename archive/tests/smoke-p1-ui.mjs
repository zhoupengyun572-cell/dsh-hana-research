// P1 前端 smoke：文献中心新 UI（状态筛选/按钮/期刊新增徽标/自定义期刊入口）+ 项目抽屉元数据
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
	await page.waitForTimeout(1500);

	console.log("cards:", await page.locator(".paper-card").count());
	console.log("状态筛选 chips:", await page.locator("[data-read-status-filter]").count());
	console.log("未读/在读/已读切换按钮:", await page.locator("[data-toggle-read]").count());
	console.log("优先级按钮:", await page.locator("[data-priority]").count());
	console.log("BibTeX 导出按钮:", await page.locator("[data-export-paper]").count());
	console.log("添加期刊按钮:", await page.locator("#add-journal-source").count());

	// 期刊新增徽标
	const newBadges = await page.locator(".journal-badge.new").allInnerTexts();
	console.log("期刊新增徽标:", JSON.stringify(newBadges.slice(0, 5)));

	// 点击"在读"筛选 → 计数
	await page.locator('[data-read-status-filter="reading"]').first().click();
	await page.waitForTimeout(400);
	const countText = await page.locator("#paper-count").innerText();
	console.log("在读筛选:", countText);

	// 点击状态切换按钮（第一个卡片）
	await page.locator('[data-read-status-filter="全部"]').first().click();
	await page.waitForTimeout(300);
	const toggle = page.locator("[data-toggle-read]").first();
	if (await toggle.count()) {
		const before = await toggle.innerText();
		await toggle.click();
		await page.waitForTimeout(800);
		const after = await page.locator("[data-toggle-read]").first().innerText();
		console.log(`状态切换: ${before} -> ${after}`);
	}

	// 自定义期刊 modal
	await page.locator("#add-journal-source").click();
	await page.waitForTimeout(400);
	console.log("自定义期刊 modal:", await page.locator("#custom-journal-form").count());

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
} catch (e) {
	console.log("SMOKE FAILED:", e.message);
}
await browser.close();
