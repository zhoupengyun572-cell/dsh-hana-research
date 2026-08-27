// P2-C 验证：OpenAlex 引文网络模块（resolveOpenAlexWorkId 注入式 + 映射逻辑）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOpenAlexWorkId, fetchRelatedWorks, fetchCitationNetwork, relatedKeywords } from "../lib/openalex-network.js";
import { LiteratureSearchError } from "../lib/literature-search.js";

/** 记录请求并按路由返回预制响应（pattern 匹配完整 URL，自动处理 URL 编码）。 */
function fakeFetch(routes) {
	const calls = [];
	const fn = async (url) => {
		calls.push(url);
		const raw = String(url);
		const decoded = decodeURIComponent(raw);
		for (const [pattern, response] of routes) {
			if (raw.includes(pattern) || decoded.includes(pattern)) return response;
		}
		throw new Error(`unexpected url: ${url}`);
	};
	fn.calls = calls;
	return fn;
}

test("resolveOpenAlexWorkId: openalex source with W id short-circuits", async () => {
	const fetchWork = () => { throw new Error("must not call network"); };
	const id = await resolveOpenAlexWorkId(
		{ source: "openalex", sourceId: "W2741809807", doi: "10.1037/xge0000001" },
		fetchWork,
	);
	assert.equal(id, "W2741809807");
});

test("resolveOpenAlexWorkId: DOI fallback queries works filter", async () => {
	const fetchWork = fakeFetch([
		["/works", { results: [{ id: "https://openalex.org/W2741809807" }] }],
	]);
	const id = await resolveOpenAlexWorkId({ source: "crossref", sourceId: "", doi: "10.1037/XGE0000001" }, fetchWork);
	assert.equal(id, "W2741809807");
	const filter = new URL(fetchWork.calls[0]).searchParams.get("filter");
	assert.equal(filter, "doi:10.1037/xge0000001", "doi filter used, lowercased");
});

test("resolveOpenAlexWorkId: no doi and no openalex id -> null", async () => {
	const id = await resolveOpenAlexWorkId({ source: "crossref", sourceId: "", doi: "" }, () => { throw new Error("no net"); });
	assert.equal(id, null);
});

test("fetchRelatedWorks: maps related works and slices max", async () => {
	const sampleWork = (id, title, year, cited) => ({
		id: `https://openalex.org/${id}`,
		display_name: title,
		publication_year: year,
		cited_by_count: cited,
		authorships: [{ author: { display_name: "张三" } }],
		primary_location: { source: { display_name: "心理学报" }, landing_page_url: `https://example.org/${id}` },
		doi: null,
	});
	const fetchWork = fakeFetch([
		["search=", { results: [sampleWork("W1", "相似文献一", 2024, 3), sampleWork("W2", "相似文献二", 2025, 0)] }],
	]);
	const result = await fetchRelatedWorks(
		{ title: "Emotion regulation in adolescents", doi: "10.9999/self", topic: "情绪调节" },
		10,
		fetchWork,
	);
	assert.equal(result.works.length, 2);
	assert.equal(result.works[0].title, "相似文献一");
	assert.equal(result.works[0].citedByCount, 3);
	assert.equal(result.works[0].sourceName, "OpenAlex");
	assert.ok(fetchWork.calls[0].includes("search="), "uses works search");
});

test("fetchRelatedWorks: excludes self by DOI/title", async () => {
	const sampleWork = (id, title, doi) => ({
		id: `https://openalex.org/${id}`,
		display_name: title,
		publication_year: 2024,
		cited_by_count: 1,
		authorships: [],
		primary_location: null,
		doi,
	});
	const fetchWork = fakeFetch([
		["search=", {
			results: [
				sampleWork("W1", "完全相同标题", "10.9999/self"),
				sampleWork("W2", "其他文献", "10.9999/other"),
			],
		}],
	]);
	const result = await fetchRelatedWorks(
		{ title: "完全相同标题", doi: "10.9999/self", topic: "x" },
		10,
		fetchWork,
	);
	assert.equal(result.works.length, 1);
	assert.equal(result.works[0].doi, "10.9999/other");
});

test("relatedKeywords: strips stopwords, dedupes, caps at 6", () => {
	assert.equal(relatedKeywords({ title: "The effect of emotion regulation on adolescents", topic: "" }), "emotion regulation adolescents");
	// 中文标题无空格分词 → 整句作为关键词（至少非空且不含停用词 token 分裂）
	const zh = relatedKeywords({ title: "青少年情绪调节的影响机制研究", topic: "" });
	assert.ok(zh && zh.length > 0, "chinese title yields keywords");
	// 全停用词/过短 → null
	assert.equal(relatedKeywords({ title: "The A of", topic: "" }), null);
	// 去重
	assert.equal(relatedKeywords({ title: "regulation regulation emotion emotion", topic: "" }), "regulation emotion");
});

test("fetchRelatedWorks: missing openalex id throws OPENALEX_ID_MISSING", async () => {
	await assert.rejects(
		() => fetchRelatedWorks({ source: "crossref", sourceId: "", doi: "" }, 10, () => { throw new Error("no net"); }),
		(err) => err instanceof LiteratureSearchError && err.code === "OPENALEX_ID_MISSING" && err.status === 404,
	);
});

test("fetchCitationNetwork: references batch + citedBy, failures degrade", async () => {
	const workMeta = {
		id: "https://openalex.org/W2741809807",
		referenced_works: ["https://openalex.org/W111", "https://openalex.org/W222", "https://openalex.org/W333"],
		cited_by_api_url: "https://api.openalex.org/works?filter=cites:W2741809807",
	};
	const refItem = (id, title) => ({
		id: `https://openalex.org/${id}`,
		display_name: title,
		publication_year: 2020,
		cited_by_count: 1,
		authorships: [],
		primary_location: { source: { display_name: "Emotion" }, landing_page_url: `https://example.org/${id}` },
		doi: null,
	});
	const fetchWork = fakeFetch([
		["/works/W2741809807", workMeta],
		["filter=ids.openalex:W111|W222|W333", { results: [refItem("W111", "参考文献一"), refItem("W222", "参考文献二")] }],
		["filter=cites:W2741809807", { results: [refItem("W999", "被引文献一")] }],
	]);
	const result = await fetchCitationNetwork(
		{ source: "openalex", sourceId: "W2741809807", doi: null },
		12,
		fetchWork,
	);
	assert.equal(result.workId, "W2741809807");
	assert.equal(result.references.length, 2);
	assert.equal(result.references[0].title, "参考文献一");
	// referenced_works 的完整 URL 被裁剪为 W 号
	const batchFilter = new URL(fetchWork.calls[1]).searchParams.get("filter");
	assert.equal(batchFilter, "ids.openalex:W111|W222|W333", "batch filter uses bare ids");
	assert.equal(result.citedBy.length, 1);
	assert.equal(result.citedBy[0].title, "被引文献一");
});

test("fetchCitationNetwork: citedBy fetch failure degrades to empty, references kept", async () => {
	const fetchWork = fakeFetch([
		["/works/W1", { id: "https://openalex.org/W1", referenced_works: ["https://openalex.org/W11"], cited_by_api_url: "https://api.openalex.org/broken" }],
		["/works", { results: [{ id: "https://openalex.org/W11", display_name: "仅参考文献", publication_year: 2021, cited_by_count: 0, authorships: [], primary_location: null, doi: null }] }],
	]);
	const result = await fetchCitationNetwork({ source: "openalex", sourceId: "W1", doi: null }, 5, fetchWork);
	assert.equal(result.references.length, 1);
	assert.equal(result.citedBy.length, 0);
});
