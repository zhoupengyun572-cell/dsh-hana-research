// P2-D smoke：论证链（关系）、证据矩阵、跨文献笔记、导出笔记
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 12507;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));

try {
	// 项目页 → 抽屉
	await page.goto(`${base}/ui/hana-research/projects`, { waitUntil: "networkidle", timeout: 30000 });
	await page.waitForSelector("[data-project-id]", { timeout: 20000 });
	await page.waitForTimeout(800);
	await page.locator("[data-project-id]").first().click();
	await page.waitForSelector(".drawer-panel", { timeout: 15000 });
	await page.waitForTimeout(1500);

	console.log("关系按钮:", await page.locator("[data-relation-add]").count());
	console.log("证据矩阵按钮:", await page.locator("#evidence-matrix").count());
	console.log("导出笔记按钮:", await page.locator("#export-notes").count());
	console.log("论证链区:", await page.locator("#drawer-relations").count());
	console.log("项目笔记区:", await page.locator("#drawer-notes-section").count());
	console.log("关系条目:", await page.locator(".relation-item").count());
	console.log("笔记条目:", await page.locator(".drawer-note-item").count());

	// 关系 modal
	await page.locator("[data-relation-add]").first().click();
	await page.waitForSelector("#relation-form", { timeout: 8000 });
	console.log("关系 modal 目标文献选项:", await page.locator('#relation-form select[name="toPaperId"] option').count());
	await page.locator('#relation-form select[name="relation"]').selectOption("refutes");
	await page.locator('#relation-form input[name="note"]').fill("smoke 备注");
	await page.locator("#relation-form button[type=submit]").click();
	await page.waitForTimeout(1800);
	console.log("保存后关系条目:", await page.locator(".relation-item").count());

	// 跨文献笔记表单
	const noteCountBefore = await page.locator(".drawer-note-item").count();
	await page.locator("#drawer-note-content").fill("smoke 跨文献笔记");
	if ((await page.locator('#drawer-note-linked option').count()) > 1) {
		await page.locator("#drawer-note-linked").selectOption({ index: 1 });
	}
	await page.locator("#drawer-note-form button[type=submit]").click();
	await page.waitForTimeout(1800);
	const noteCountAfter = await page.locator(".drawer-note-item").count();
	console.log(`笔记: ${noteCountBefore} → ${noteCountAfter}`);
	console.log("关联徽标:", await page.locator(".note-linked").count());

	// 证据矩阵 modal
	await page.locator("#evidence-matrix").click();
	await page.waitForSelector(".evidence-table", { timeout: 20000 });
	console.log("证据矩阵行:", await page.locator(".evidence-table tbody tr").count());
	console.log("论证链行:", await page.locator(".evidence-relations").count());
	console.log("导出按钮:", await page.locator("#evidence-csv").count(), await page.locator("#evidence-md").count());
	await page.locator('[data-modal-cancel]').first().click();
	await page.waitForTimeout(400);

	// 导出笔记 modal
	await page.locator("#export-notes").click();
	await page.waitForSelector(".export-option", { timeout: 8000 });
	console.log("导出选项:", await page.locator(".export-option").count());
	await page.locator('[data-export-format="markdown"]').click();
	await page.waitForTimeout(800);

	console.log("JS errors:", errors.length ? errors.join(" | ") : "none");
	console.log("SMOKE-P2D-OK");
} catch (e) {
	console.log("SMOKE-P2D-FAILED:", e.message);
}
await browser.close();
