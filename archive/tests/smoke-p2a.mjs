// P2-A smoke：被引徽标、AI 简报按钮+modal、项目综述草稿按钮+modal
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 3389;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));

try {
	// 1) 文献页：被引徽标
	await page.goto(`${base}/ui/hana-research/literature`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector(".paper-card", { timeout: 20000 });
	await page.waitForTimeout(1500);
	const cited = await page.locator(".paper-cited").count();
	console.log("被引徽标(.paper-cited):", cited);
	console.log("AI 简报按钮(#journal-brief):", await page.locator("#journal-brief").count());

	// 2) AI 简报 modal（真模型调用，容忍 120s）
	await page.locator("#journal-brief").click();
	await page.waitForSelector(".journal-brief-text", { timeout: 120000 });
	const brief = (await page.locator(".journal-brief-text").innerText()).slice(0, 120);
	console.log("简报内容:", brief.replace(/\s+/g, " "));
	await page.locator('[data-modal-cancel]').first().click();
	await page.waitForTimeout(400);

	// 3) 项目抽屉：综述草稿按钮 + modal
	await page.goto(`${base}/ui/hana-research/projects`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector("[data-project-id]", { timeout: 20000 });
	await page.waitForTimeout(1000);
	await page.locator("[data-project-id]").first().click();
	await page.waitForSelector(".drawer-panel", { timeout: 15000 });
	await page.waitForTimeout(800);
	const summaryBtn = await page.locator("#project-summary").count();
	console.log("综述草稿按钮(#project-summary):", summaryBtn);
	if (summaryBtn > 0) {
		await page.locator("#project-summary").first().click();
		await page.waitForSelector(".journal-brief-text", { timeout: 150000 });
		const draft = (await page.locator(".journal-brief-text").innerText()).slice(0, 120);
		console.log("草稿内容:", draft.replace(/\s+/g, " "));
	}

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
	console.log("SMOKE-P2A-OK");
} catch (e) {
	console.log("SMOKE-P2A-FAILED:", e.message);
}
await browser.close();
