// P2-C smoke：相似文献/引文按钮与 modal、期刊国内外分组折叠
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 5597;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));

try {
	// 1) 文献页：相关/引文按钮 + 期刊分组
	await page.goto(`${base}/ui/hana-research/literature`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector(".paper-card", { timeout: 20000 });
	await page.waitForTimeout(1500);
	console.log("相关按钮:", await page.locator("[data-related-paper]").count());
	console.log("引文按钮:", await page.locator("[data-citations-paper]").count());
	await page.waitForSelector("details.journal-group", { timeout: 15000 });
	const groups = await page.locator("details.journal-group").count();
	const cnGroup = await page.locator('details[data-journal-group="cn"]').count();
	const intlGroup = await page.locator('details[data-journal-group="intl"]').count();
	console.log(`期刊分组: ${groups} 组（国内 ${cnGroup} / 国外 ${intlGroup}）`);
	const cnChips = await page.locator('details[data-journal-group="cn"] .journal-source-chip').count();
	console.log("国内期刊 chip 数:", cnChips);
	// 折叠国内组 → chips 隐藏
	await page.locator('details[data-journal-group="cn"] summary').click();
	await page.waitForTimeout(400);
	const collapsedVisible = await page.locator('details[data-journal-group="cn"] .journal-source-chip:visible').count();
	const collapsedTotal = await page.locator('details[data-journal-group="cn"] .journal-source-chip').count();
	console.log(`折叠后可见 chip: ${collapsedVisible}（DOM 共 ${collapsedTotal}）`);

	// 2) 引文 modal（等待数据或错误出现，容忍限流退避）
	await page.locator("[data-citations-paper]").first().click();
	await page.waitForSelector("#network-body .network-work-card, #network-body .search-warn", { timeout: 120000 });
	const warn = await page.locator("#network-body .search-warn").count();
	const tabs = await page.locator(".network-tab").count();
	console.log("引文 modal: tabs=", tabs, "错误提示=", warn);
	if (warn > 0) {
		const text = (await page.locator("#network-body .search-warn").innerText()).slice(0, 120);
		console.log("引文错误:", text.replace(/\s+/g, " "));
	} else {
		const cards = await page.locator(".network-work-card:visible").count();
		const empty = (await page.locator("#network-body").innerText()).includes("暂无记录");
		console.log(`引文列表条目: ${cards}（${empty ? '空状态' : '有数据'}）`);
	}
	await page.locator('[data-modal-cancel]').first().click();
	await page.waitForTimeout(400);

	// 3) 相关 modal
	await page.locator("[data-related-paper]").first().click();
	await page.waitForSelector("#network-body .network-work-card, #network-body .search-warn", { timeout: 120000 });
	const relWarn = await page.locator("#network-body .search-warn").count();
	console.log("相关 modal 错误提示:", relWarn);
	if (relWarn === 0) {
		const cards = await page.locator(".network-work-card:visible").count();
		console.log("相关列表条目:", cards);
	}

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
	console.log("SMOKE-P2C-OK");
} catch (e) {
	console.log("SMOKE-P2C-FAILED:", e.message);
}
await browser.close();
