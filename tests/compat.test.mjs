// 兼容性验证（当前开发基线 dsh-tools 0.1.0-rc.13，运行于 profile 环境）：
//   1) defineTool 编译全部 20 个工具（参数 + output）不抛错；
//   2) parameterSchemaSpecToJsonSchema 输出结构正确（嵌套 object/array/required）；
//   3) validateArgs 对非法参数拒绝；
//   4) 模拟注册 + 实际执行：一个只读工具 + 一个需审批的写工具（批准/拒绝两路）；
//   5) output.render 返回合法 ContentBlock。
// 运行：node <profile>/node_modules/dsh-hana-research/tests/compat.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool, parameterSchemaSpecToJsonSchema, validateArgs } from "@deepseek-ai/dsh-tools";
import { toFlatParameters } from "../lib/tool-utils.js";
import { registerResearchTools } from "../lib/register-tools.js";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";

import * as listResearchProjects from "../tools/list-research-projects.js";
import * as saveSearchResult from "../tools/save-search-result.js";
import * as searchLiterature from "../tools/search-literature.js";
import * as subscribeTopic from "../tools/subscribe-topic.js";
import * as addPaperToProject from "../tools/add-paper-to-project.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function makeStore(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-compat-"));
	const store = new ResearchStore(dir, { seedDemoData: true });
	t.after(() => {
		clearResearchStoreCache();
		store.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return store;
}

/** 模拟 DSH tools registry + approval + logger。 */
function makeHost(approvalOutcome = "allowed-once") {
	const registered = [];
	const disposers = [];
	const host = {
		registered,
		approvalCalls: [],
		ctx: {
			tools: {
				register: (definition) => {
					registered.push(definition);
					const dispose = () => {
						const index = registered.indexOf(definition);
						if (index >= 0) registered.splice(index, 1);
					};
					disposers.push(dispose);
					return dispose;
				},
			},
			approval: {
				request: async (req) => {
					host.approvalCalls.push(req);
					return approvalOutcome;
				},
			},
			logger: { info: () => {}, warn: () => {}, error: () => {} },
		},
		disposeAll: () => disposers.forEach((d) => d()),
	};
	return host;
}

function runExec(def, args, agentId = "s-compat") {
	return def.execute(args, {
		agent: { id: agentId },
		callId: `call-${Math.random().toString(36).slice(2)}`,
		signal: new AbortController().signal,
	});
}

test("defineTool compiles all 21 tools with parameters + output", (t) => {
	const store = makeStore(t);
	const host = makeHost();
	registerResearchTools(host.ctx, store);
	assert.equal(host.registered.length, 21, "21 tools registered");
	const searchDef = host.registered.find((def) => def.name === "hana_research_search_literature");
	assert.match(searchDef.description, /使用指引/);
	for (const def of host.registered) {
		assert.ok(def.name.startsWith("hana_research_"), def.name);
		assert.equal(typeof def.description, "string");
		// output 声明存在（当前 rc 契约）
		assert.ok(def.output, `${def.name} has output`);
		assert.ok(def.output.schema, `${def.name} output.schema`);
		assert.equal(typeof def.output.render, "function", `${def.name} output.render`);
		// render 返回合法 ContentBlock[]
		const rendered = def.output.render({}, { text: "测试输出" });
		assert.ok(Array.isArray(rendered) && rendered[0]?.type === "text" && rendered[0].text === "测试输出", `${def.name} render -> content block`);
	}
	host.disposeAll();
	assert.equal(host.registered.length, 0, "unregister removes all tools");
});

test("nested parameter schema: record object with additionalProperties + nested required", () => {
	const flat = toFlatParameters(saveSearchResult.parameters);
	assert.equal(flat.record.type, "object");
	assert.equal(flat.record.additionalProperties, true);
	assert.ok(flat.record.properties.title, "record.properties.title");
	assert.equal(flat.record.properties.title.required, true, "nested required title");
	assert.equal(flat.record.properties.doi.required, undefined, "nested optional doi");
	// 编译为原始 JSON Schema 不抛错
	const compiled = parameterSchemaSpecToJsonSchema(flat);
	assert.equal(compiled.type, "object");
	const record = compiled.properties.record;
	assert.equal(record.type, "object");
	assert.equal(record.additionalProperties, true);
	assert.deepEqual(record.required, ["title"]);
});

test("array parameter schema: enum items preserved", () => {
	const flat = toFlatParameters(searchLiterature.parameters);
	assert.equal(flat.sources.type, "array");
	assert.deepEqual(flat.sources.items.enum, ["openalex", "crossref", "arxiv", "pubmed"]);
	assert.equal(flat.query.required, true);
});

test("validateArgs rejects missing required and accepts valid args", () => {
	const flat = toFlatParameters(addPaperToProject.parameters);
	const violations = validateArgs(flat, {});
	assert.ok(violations.length >= 2, "missing projectId/paperId flagged");
	const clean = validateArgs(flat, { projectId: "p", paperId: "x" });
	assert.deepEqual(clean, [], "valid args pass");
});

test("read-only tool executes without approval (list_research_projects)", async (t) => {
	const store = makeStore(t);
	const host = makeHost("rejected"); // 只读工具不应触发审批
	registerResearchTools(host.ctx, store);
	const def = host.registered.find((d) => d.name === "hana_research_list_research_projects");
	assert.ok(def);
	assert.equal(host.approvalCalls.length, 0);
	const value = await runExec(def, {});
	assert.equal(typeof value.text, "string");
	assert.ok(value.text.includes("示例：情绪调节文献综述"));
	assert.equal(host.approvalCalls.length, 0, "read tool never asks approval");
	host.disposeAll();
});

test("write tool with approval allowed-once executes and persists", async (t) => {
	const store = makeStore(t);
	const host = makeHost("allowed-once");
	registerResearchTools(host.ctx, store);
	const def = host.registered.find((d) => d.name === "hana_research_subscribe_topic");
	assert.ok(def);
	const value = await runExec(def, { topic: "情绪调节", keywords: "emotion regulation" });
	assert.ok(value.text.includes("已订阅"));
	assert.equal(host.approvalCalls.length, 1, "approval asked once");
	assert.equal(host.approvalCalls[0].toolName, "hana_research_subscribe_topic");
	assert.equal(host.approvalCalls[0].agent.id, "s-compat");
	assert.ok(store.listTopicSubscriptions().some((s) => s.topic === "情绪调节"), "subscription persisted");
	host.disposeAll();
});

test("write tool with approval rejected returns cancel and does not persist", async (t) => {
	const store = makeStore(t);
	const host = makeHost("rejected");
	registerResearchTools(host.ctx, store);
	const def = host.registered.find((d) => d.name === "hana_research_subscribe_topic");
	const value = await runExec(def, { topic: "不该存在" });
	assert.ok(value.text.includes("已取消"), "rejected -> cancel text");
	assert.equal(store.listTopicSubscriptions().length, 0, "nothing persisted");
	host.disposeAll();
});

test("write tool without agent context returns friendly message", async (t) => {
	const store = makeStore(t);
	const host = makeHost("allowed-once");
	registerResearchTools(host.ctx, store);
	const def = host.registered.find((d) => d.name === "hana_research_subscribe_topic");
	const value = await def.execute({ topic: "x" }, {});
	assert.ok(value.text.includes("缺少会话上下文"));
	assert.equal(store.listTopicSubscriptions().length, 0);
	host.disposeAll();
});

test("approval.request throwing (idle) degrades to friendly message", async (t) => {
	const store = makeStore(t);
	const host = makeHost();
	host.ctx.approval.request = async () => { throw new Error("no open turn"); };
	registerResearchTools(host.ctx, store);
	const def = host.registered.find((d) => d.name === "hana_research_subscribe_topic");
	const value = await runExec(def, { topic: "x" });
	assert.ok(value.text.includes("无法请求批准"));
	assert.equal(store.listTopicSubscriptions().length, 0);
	host.disposeAll();
});
