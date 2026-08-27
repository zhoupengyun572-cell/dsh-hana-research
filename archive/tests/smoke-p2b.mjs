// P2-B smoke：保存检索、方法学标注、项目内文献角色
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 10889;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));

try {
	// 1) 文献页：新按钮与筛选行
	await page.goto(`${base}/ui/hana-research/literature`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector(".paper-card", { timeout: 20000 });
	await page.waitForTimeout(1500);
	console.log("保存检索按钮:", await page.locator("#save-search").count());
	console.log("保存的检索按钮:", await page.locator("#saved-searches").count());
	console.log("方法学筛选行:", await page.locator("#methodologies").count());
	console.log("方法学按钮(卡片):", await page.locator("[data-methodology-edit]").count());

	// 2) 方法学标注 modal：选预设 → 保存
	await page.locator("[data-methodology-edit]").first().click();
	await page.waitForSelector(".method-tag-chip", { timeout: 8000 });
	await page.locator('[data-method-preset="实验"]').click();
	await page.waitForTimeout(200);
	await page.locator("#methodology-form button[type=submit]").click();
	await page.waitForTimeout(1200);
	const badge = await page.locator(".paper-method").count();
	console.log("保存后方法学徽标:", badge);
	const methodChips = await page.locator("[data-methodology-filter]").count();
	console.log("方法学筛选 chip 数:", methodChips);

	// 3) 保存检索
	await page.locator("#live-search").fill("adolescent emotion regulation");
	await page.locator("#save-search").click();
	await page.waitForSelector("#save-search-form", { timeout: 8000 });
	await page.locator('#save-search-form input[name="name"]').fill("smoke 验证检索");
	await page.locator("#save-search-form button[type=submit]").click();
	await page.waitForTimeout(1000);
	console.log("保存后按钮计数:", (await page.locator("#saved-searches").innerText()).trim());

	// 4) 保存的检索列表 → 重跑
	await page.locator("#saved-searches").click();
	await page.waitForSelector(".saved-search-item", { timeout: 8000 });
	console.log("保存列表项:", await page.locator(".saved-search-item").count());
	console.log("提醒开关:", await page.locator("[data-search-alert]").count());
	await page.locator("[data-search-alert]").first().check();
	await page.waitForTimeout(600);
	await page.locator("[data-search-rerun]").first().click();
	await page.waitForTimeout(8000);
	console.log("重跑后检索结果卡:", await page.locator(".search-result-card").count());
	await page.waitForTimeout(1200);

	// 5) 项目抽屉：角色选择 + 角色筛选
	await page.goto(`${base}/ui/hana-research/projects`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector("[data-project-id]", { timeout: 20000 });
	await page.waitForTimeout(800);
	await page.locator("[data-project-id]").first().click();
	await page.waitForSelector(".drawer-panel", { timeout: 15000 });
	await page.waitForTimeout(1000);
	console.log("角色选择器:", await page.locator("[data-role-set]").count());
	console.log("角色筛选行:", await page.locator("#drawer-roles").count());
	if ((await page.locator("[data-role-set]").count()) > 0) {
		await page.locator("[data-role-set]").first().selectOption("core");
		await page.waitForTimeout(800);
		const badge = (await page.locator(".paper-role").first().innerText()).trim();
		console.log("角色徽标:", badge);
		await page.locator('[data-drawer-role-filter="core"]').click();
		await page.waitForTimeout(300);
		const filtered = await page.locator("[data-drawer-role='core']").count();
		console.log("角色筛选后 core 可见:", filtered);
	}

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
	console.log("SMOKE-P2B-OK");
} catch (e) {
	console.log("SMOKE-P2B-FAILED:", e.message);
}
await browser.close();
