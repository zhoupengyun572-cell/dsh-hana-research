// 诊断：打开 DSH GUI，检查客户端是否正常渲染、控制台错误
import { chromium } from "playwright";

const url = process.env.DSH_WEB_URL || "http://127.0.0.1:2048";
const browser = await chromium.launch({
	executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	headless: true,
});
const page = await browser.newPage();
const errors = [];
const consoleErrors = [];
page.on("pageerror", (err) => errors.push(String(err).slice(0, 500)));
page.on("console", (msg) => {
	if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
});

try {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
	await page.waitForTimeout(8000);
	console.log("title:", await page.title());
	const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
	console.log("body:", JSON.stringify(bodyText.slice(0, 200)));
	console.log("pageerrors:", errors.length ? errors.join("\n") : "none");
	console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 8).join("\n") : "none");
	// 侧栏「科研」入口是否渲染
	const entry = await page.locator("text=科研").count().catch(() => 0);
	console.log("sidebar 科研 entry count:", entry);
} catch (e) {
	console.log("GOTO FAILED:", e.message);
}
await browser.close();
