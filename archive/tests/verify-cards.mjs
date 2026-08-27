// 验证：对话卡片页面 + 设置页 + 文献中心页面渲染（无 JS 错误）
import { chromium } from "playwright";

const port = process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : 2048;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});

async function checkPage(path, selector, waitMs = 4000) {
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (err) => errors.push(String(err).slice(0, 300)));
	try {
		await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
		await page.waitForTimeout(waitMs);
		const found = await page.locator(selector).count();
		console.log(`${path}: selector=${selector} found=${found} errors=${errors.length ? errors.join(" | ") : "none"}`);
		return { path, found, errors };
	} catch (e) {
		console.log(`${path}: GOTO FAILED ${e.message}`);
		return { path, found: 0, errors: [e.message] };
	} finally {
		await page.close();
	}
}

await checkPage("/ui/hana-research/cards/journal-updates", ".journal-source-chip, .journal-bar, .card-root, #card-root");
await checkPage("/ui/hana-research/cards/search-results?q=emotion+regulation", "#card-root .card-result, .search-card, .card-result");
await checkPage("/ui/hana-research/cards/project-overview", "#card-root .card-project, .project-card, .card-result");
await checkPage("/ui/hana-research/literature", ".paper-card");

await browser.close();
