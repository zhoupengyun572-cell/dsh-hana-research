// P4 verification: host-LLM aggregation, AI search JSON handling, translation
// chunking/cache, and pdfjs text extraction in Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { completeWithHostLlm, HostLlmError } from "../lib/host-llm.js";
import { extractJsonFromAi, normalizeAiRecommendations, aiSummarizeSearch } from "../lib/ai-search.js";
import { splitIntoChunks, cachedTranslation, storeTranslationCache, translateChunk, TranslationError , flushTranslationCache } from "../lib/translation.js";
import { extractPdfText } from "../lib/document-translation.js";

/** mock llm.stream：按固定文本输出 */
function fakeLlm(text) {
	return {
		stream: async function* () {
			for (const part of [text.slice(0, 3), text.slice(3)]) {
				if (part) yield { type: "text-delta", index: 0, text: part };
			}
			yield { type: "finish", index: 0, reason: "stop" };
		},
	};
}

function fakeLlmError() {
	return {
		stream: async function* () {
			yield { type: "finish", index: 0, reason: "error" };
		},
	};
}

const SELECTION = { provider: "deepseek", model: "deepseek-chat" };

test("completeWithHostLlm aggregates text deltas", async () => {
	const text = await completeWithHostLlm({ llm: fakeLlm("你好世界"), selection: SELECTION, user: "hi" });
	assert.equal(text, "你好世界");
});

test("completeWithHostLlm sends content blocks and object finish reason", async () => {
	let captured = null;
	const llm = {
		stream: async function* (options) {
			captured = options;
			yield { type: "text-delta", index: 0, text: "ok" };
			yield { type: "finish", index: 0, reason: { kind: "stop" } };
		},
	};
	const text = await completeWithHostLlm({ llm, selection: SELECTION, system: "sys", user: "hi" });
	assert.equal(text, "ok");
	assert.equal(captured.system, "sys");
	assert.equal(captured.provider, "deepseek");
	assert.equal(captured.messages[0].role, "user");
	assert.deepEqual(captured.messages[0].content, [{ type: "text", text: "hi" }]);
});

test("completeWithHostLlm: no model -> HostLlmError NO_MODEL", async () => {
	await assert.rejects(
		() => completeWithHostLlm({ llm: fakeLlm("x"), selection: null, user: "hi" }),
		(err) => err instanceof HostLlmError && err.code === "LLM_NO_MODEL",
	);
});

test("completeWithHostLlm: finish error -> HostLlmError", async () => {
	await assert.rejects(
		() => completeWithHostLlm({ llm: fakeLlmError(), selection: SELECTION, user: "hi" }),
		(err) => err instanceof HostLlmError && err.code === "LLM_ERROR",
	);
});

test("extractJsonFromAi tolerates fenced and embedded JSON", () => {
	assert.deepEqual(extractJsonFromAi('{"a":1}'), { a: 1 });
	assert.deepEqual(extractJsonFromAi('```json\n{"b":2}\n```'), { b: 2 });
	const embedded = extractJsonFromAi('说明文字 {"c":3} 结尾');
	assert.deepEqual(embedded, { c: 3 });
	assert.equal(extractJsonFromAi("无 JSON"), null);
});

test("normalizeAiRecommendations drops invalid/duplicate indexes", () => {
	const normalized = normalizeAiRecommendations({
		recommendations: [
			{ index: 0, reason: "好" },
			{ index: 0, reason: "重复" },
			{ index: 99, reason: "越界" },
			{ index: 1 },
			{ index: "x", reason: "非法" },
		],
	}, 3);
	assert.deepEqual(normalized, [
		{ index: 0, reason: "好" },
		{ index: 1, reason: "值得优先阅读" },
	]);
});

test("aiSummarizeSearch works with fake host llm", async () => {
	const llm = fakeLlm(JSON.stringify({
		summary: "这是中文综述",
		recommendations: [{ index: 1, reason: "相关" }],
	}));
	const result = await aiSummarizeSearch({
		llm,
		selection: SELECTION,
		query: "emotion",
		results: [{ title: "A" }, { title: "B" }],
	});
	assert.equal(result.summary, "这是中文综述");
	assert.equal(result.recommendations[0].index, 1);
});

test("splitIntoChunks respects paragraph boundaries and maxChars", () => {
	const text = "段1内容。\n\n段2内容。\n\n段3内容。";
	const chunks = splitIntoChunks(text, 12);
	assert.ok(chunks.length >= 2);
	assert.ok(chunks.every(c => c.length <= 12 + 6)); // 段边界容忍
});

test("translation cache roundtrip with TTL", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-tl-cache-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const miss = cachedTranslation(dir, "hello world chunk");
	assert.equal(miss.hit, false);
	storeTranslationCache(dir, miss.key, "你好世界");
	const hit = cachedTranslation(dir, "hello world chunk");
	assert.equal(hit.hit, true);
	assert.equal(hit.translated, "你好世界");
});

test("segment cache persists to disk on flush and reloads in a fresh process state", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-tl-flush-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const { key } = cachedTranslation(dir, "persist me");
	storeTranslationCache(dir, key, "已持久化");
	flushTranslationCache(dir);
	const raw = JSON.parse(fs.readFileSync(path.join(dir, "translation-cache.json"), "utf-8"));
	assert.equal(raw[key].translated, "已持久化");
});

test("translateChunk uses host llm", async () => {
	const translated = await translateChunk({ llm: fakeLlm("译文内容"), selection: SELECTION, text: "原文", sourceLang: "en", targetLang: "zh" });
	assert.equal(translated, "译文内容");
});

test("translateChunk: no model -> TranslationError", async () => {
	await assert.rejects(
		() => translateChunk({ llm: fakeLlm("x"), selection: null, text: "x" }),
		(err) => err instanceof TranslationError && err.code === "TRANSLATE_NO_MODEL",
	);
});

test("extractPdfText works in Node with a generated PDF", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-pdfjs-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const chunks = [];
	const source = new PDFDocument({ autoFirstPage: true });
	source.on("data", (chunk) => chunks.push(chunk));
	const completed = new Promise((resolve, reject) => {
		source.on("end", resolve);
		source.on("error", reject);
	});
	source.fontSize(12).text(`Attention extraction fixture. ${"Stable local PDF text. ".repeat(40)}`);
	source.end();
	await completed;
	const buf = Buffer.concat(chunks);
	const pdfjs = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "vendor", "pdfjs.mjs")).href);
	const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true });
	const doc = await task.promise;
	try {
		const text = await extractPdfText(doc);
		assert.ok(text.includes("Attention"), "extracted text contains title");
		assert.ok(text.length > 500, "extracted text substantial");
	} finally {
		await doc.destroy();
	}
});
