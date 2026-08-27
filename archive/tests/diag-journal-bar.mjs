// 诊断：期刊栏实际渲染内容
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
page.on("response", (res) => {
	if (res.url().includes("/api/hana-research/journals")) console.log("[api] journals ->", res.status());
});

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector("#journal-bar", { timeout: 15000 });
await page.waitForTimeout(2500);

const barText = await page.locator("#journal-bar").innerText();
console.log("=== journal-bar innerText ===");
console.log(barText.slice(0, 800));

const chipCount = await page.locator(".journal-source-chip").count();
console.log("chip count:", chipCount);
if (chipCount > 0) {
	const first = await page.locator(".journal-source-chip").first().evaluate(el => el.outerHTML);
	console.log("first chip HTML:", first.slice(0, 300));
}

await browser.close();
