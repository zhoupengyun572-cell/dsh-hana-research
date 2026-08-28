// P3 verification: research tools on DSH-style ctx, approval gating, results.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { toFlatParameters, toDsResult } from "../lib/tool-utils.js";

import * as listResearchProjects from "../tools/list-research-projects.js";
import * as getProjectBrief from "../tools/get-project-brief.js";
import * as searchProjectPapers from "../tools/search-project-papers.js";
import * as createProjectNote from "../tools/create-project-note.js";
import * as createProjectTask from "../tools/create-project-task.js";
import * as completeProjectTask from "../tools/complete-project-task.js";
import * as listProjectTasks from "../tools/list-project-tasks.js";
import * as readProjectNotes from "../tools/read-project-notes.js";
import * as listTags from "../tools/list-tags.js";
import * as subscribeTopic from "../tools/subscribe-topic.js";
import * as listSubscriptions from "../tools/list-subscriptions.js";
import * as unsubscribeTopic from "../tools/unsubscribe-topic.js";
import * as searchLiterature from "../tools/search-literature.js";

const TOOLS = [
	listResearchProjects, getProjectBrief, searchProjectPapers, createProjectNote, createProjectTask, completeProjectTask, listProjectTasks, readProjectNotes,
	listTags, subscribeTopic, listSubscriptions, unsubscribeTopic, searchLiterature,
];

function makeStore(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-tools-test-"));
	const store = new ResearchStore(dir, { seedDemoData: true });
	t.after(() => {
		clearResearchStoreCache();
		store.close();
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return { store, ctx: { store, sessionId: "s-test", agentId: "a-test" } };
}

test("all tool modules expose name/description/parameters/execute", () => {
	for (const tool of TOOLS) {
		assert.equal(typeof tool.name, "string", `${tool.name} name`);
		assert.equal(typeof tool.description, "string", `${tool.name} description`);
		assert.equal(typeof tool.execute, "function", `${tool.name} execute`);
		assert.ok(tool.parameters, `${tool.name} parameters`);
	}
});

test("parameter conversion: JSON Schema object -> flat required map", () => {
	const flat = toFlatParameters({
		type: "object",
		properties: {
			projectId: { type: "string", description: "项目 ID" },
			noteId: { type: "string", description: "笔记 ID" },
			count: { type: "number" },
		},
		required: ["projectId", "noteId"],
	});
	assert.equal(flat.projectId.type, "string");
	assert.equal(flat.projectId.required, true);
	assert.equal(flat.noteId.required, true);
	assert.equal(flat.count.required, undefined);
	assert.equal(flat.count.type, "number");
});

test("result conversion: textResult -> { text, ...details }", () => {
	const converted = toDsResult({
		content: [{ type: "text", text: "完成" }],
		details: { total: 3, items: [1, 2] },
	});
	assert.equal(converted.text, "完成");
	assert.equal(converted.total, 3);
	assert.deepEqual(converted.items, [1, 2]);
	// 非 textResult 结构原样透传
	assert.deepEqual(toDsResult({ a: 1 }), { a: 1 });
});

test("list_research_projects (read) returns projects with counts", (t) => {
	const { store, ctx } = makeStore(t);
	const result = listResearchProjects.execute({}, ctx);
	assert.equal(result.content[0].type, "text");
	assert.ok(result.content[0].text.includes("示例：情绪调节文献综述"));
	assert.equal(result.details.projects.length, 2);
});

test("get_project_brief returns evidence gaps and actionable next steps", (t) => {
	const { store, ctx } = makeStore(t);
	const project = store.listProjects()[0];
	const result = getProjectBrief.execute({ projectId: project.id, evidenceLimit: 6 }, ctx);
	assert.ok(result.content[0].text.includes(`项目：${project.title}`));
	assert.equal(result.details.project.id, project.id);
	assert.equal(result.details.counts.papers, store.listProjectPapers(project.id).length);
	assert.ok(Array.isArray(result.details.gaps));
	assert.ok(Array.isArray(result.details.nextActions));
});

test("project task tools create/list/complete with project-note persistence", (t) => {
	const { store, ctx } = makeStore(t);
	const project = store.listProjects()[0];
	const created = createProjectTask.execute({ projectId: project.id, title: "补齐方法学编码", priority: "P1", dueDate: "2026-08-30" }, ctx);
	const taskId = created.details.task.id;
	let listed = listProjectTasks.execute({ projectId: project.id, status: "todo" }, ctx);
	assert.ok(listed.details.tasks.some(task => task.id === taskId && !task.done));
	completeProjectTask.execute({ projectId: project.id, taskId, completed: true }, ctx);
	listed = listProjectTasks.execute({ projectId: project.id, status: "done" }, ctx);
	assert.ok(listed.details.tasks.some(task => task.id === taskId && task.done));
});

test("create_project_note (write) creates note and audit row", (t) => {
	const { store, ctx } = makeStore(t);
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	const result = createProjectNote.execute({ projectId: project.id, paperId: paper.id, pageNumber: 2, content: "工具层测试笔记", tags: ["关键证据"] }, ctx);
	assert.ok(result.content[0].text.includes("创建笔记"));
	assert.ok(store.listNotes(project.id).some(n => n.content === "工具层测试笔记"));
	const audit = store.db.prepare("SELECT * FROM research_audit_log WHERE action = 'agent.tool.invoke' ORDER BY id DESC LIMIT 1").get();
	assert.equal(audit.entity_id, "create_project_note");
	const detail = JSON.parse(audit.detail_json);
	assert.equal(detail.sessionId, "s-test");
});

test("subscribe_topic (write) + list/unsubscribe roundtrip", (t) => {
	const { store, ctx } = makeStore(t);
	const sub = subscribeTopic.execute({ topic: "测试主题", keywords: "测试" }, ctx);
	assert.ok(sub.content[0].text.includes("已订阅"));
	assert.equal(store.listTopicSubscriptions().length, 1);
	const listed = listSubscriptions.execute({}, ctx);
	assert.ok(listed.details.subscriptions.some(s => s.topic === "测试主题"));
	const unsub = unsubscribeTopic.execute({ topic: "测试主题" }, ctx);
	assert.ok(unsub.content[0].text.includes("已取消"));
	assert.equal(store.listTopicSubscriptions().length, 0);
});

test("list_tags aggregates note tags", (t) => {
	const { store, ctx } = makeStore(t);
	const project = store.listProjects()[0];
	const paper = store.listPapers()[0];
	createProjectNote.execute({ projectId: project.id, paperId: paper.id, content: "a", tags: ["标签甲", "标签乙"] }, ctx);
	createProjectNote.execute({ projectId: project.id, paperId: paper.id, content: "b", tags: ["标签甲"] }, ctx);
	const result = listTags.execute({ projectId: project.id }, ctx);
	const counts = Object.fromEntries(result.details.tags.map(x => [x.tag, x.count]));
	assert.equal(counts["标签甲"], 2);
	assert.equal(counts["标签乙"], 1);
});

test("search_literature (read) hits real sources without network ctx", async (t) => {
	const { ctx } = makeStore(t);
	const result = await searchLiterature.execute({ query: "emotion regulation", perSource: 2 }, ctx);
	assert.ok(result.content[0].text.includes("匹配文献"));
	assert.ok(result.details.total > 0);
});
