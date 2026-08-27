// P1 批次2 smoke：标签管理 modal / 项目概览 / 阅读器目录按钮
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

	console.log("标签管理按钮:", await page.locator("#tag-manager").count());
	await page.locator("#tag-manager").click();
	await page.waitForTimeout(600);
	console.log("标签管理 modal:", await page.locator(".tag-manager-list").count());
	const rows = await page.locator(".tag-manager-row").count();
	console.log("标签行数:", rows);
	await page.locator('[data-modal-cancel]').first().click();
	await page.waitForTimeout(300);

	// 项目抽屉概览
	await page.goto(`${base}/ui/hana-research/projects`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForTimeout(1500);
	const projectChip = page.locator(".project-card, [data-project-id], .project-item").first();
	if (await projectChip.count()) {
		await projectChip.click();
		await page.waitForTimeout(1200);
		console.log("抽屉概览行:", await page.locator(".drawer-overview").count());
		if (await page.locator(".drawer-overview").count()) {
			console.log("概览内容:", (await page.locator(".drawer-overview").innerText()).slice(0, 120));
		}
	} else {
		console.log("项目卡片未找到（可能选择器不同）");
	}

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
} catch (e) {
	console.log("SMOKE FAILED:", e.message);
}
await browser.close();
