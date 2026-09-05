// 工具注册器（DSH 移植）：把 OpenHanako 声明式工具模块注册为 DSH 动态工具。
// - 21 个工具，运行时名保留 `hana_research_` 前缀；
// - 读工具直接注册；写工具（sessionPermission.kind === 'review'）执行前
//   经 DSH approval 服务请求用户确认（policy=ask 弹确认，never 自动拒绝）；
// - 工具结果统一转换为 { text, ...details } 供模型与 UI 消费；
// - 审计信息（sessionId/agentId）从 DSH 工具执行上下文（exec.agent）提取。
import { defineTool } from "@deepseek-ai/dsh-tools";
import { toFlatParameters, toDsResult } from "./tool-utils.js";
import * as addPaperToProject from "../tools/add-paper-to-project.js";
import * as completeProjectTask from "../tools/complete-project-task.js";
import * as createProjectNote from "../tools/create-project-note.js";
import * as createProjectTask from "../tools/create-project-task.js";
import * as deleteProjectNote from "../tools/delete-project-note.js";
import * as editProjectNote from "../tools/edit-project-note.js";
import * as getReaderContext from "../tools/get-reader-context.js";
import * as getProjectBrief from "../tools/get-project-brief.js";
import * as getResearchContext from "../tools/get-research-context.js";
import * as getAiScreening from "../tools/get-ai-screening.js";
import * as listResearchProjects from "../tools/list-research-projects.js";
import * as listProjectTasks from "../tools/list-project-tasks.js";
import * as listSubscriptions from "../tools/list-subscriptions.js";
import * as listTags from "../tools/list-tags.js";
import * as readProjectNotes from "../tools/read-project-notes.js";
import * as reportJournalUpdates from "../tools/report-journal-updates.js";
import * as saveSearchResult from "../tools/save-search-result.js";
import * as searchLiterature from "../tools/search-literature.js";
import * as searchProjectPapers from "../tools/search-project-papers.js";
import * as subscribeTopic from "../tools/subscribe-topic.js";
import * as unsubscribeTopic from "../tools/unsubscribe-topic.js";

const TOOL_MODULES = [
	addPaperToProject,
	completeProjectTask,
	createProjectNote,
	createProjectTask,
	deleteProjectNote,
	editProjectNote,
	getReaderContext,
	getProjectBrief,
	getResearchContext,
	getAiScreening,
	listResearchProjects,
	listProjectTasks,
	listSubscriptions,
	listTags,
	readProjectNotes,
	reportJournalUpdates,
	saveSearchResult,
	searchLiterature,
	searchProjectPapers,
	subscribeTopic,
	unsubscribeTopic,
];

/** 注册全部研究工具；返回卸载函数。 */
export function registerResearchTools(ctx, store) {
	const disposers = [];
	for (const tool of TOOL_MODULES) {
		const runtimeName = `hana_research_${tool.name}`;
		const requiresApproval = tool.sessionPermission?.kind === "review";
		const describeSideEffect = typeof tool.describeSideEffect === "function"
			? (args) => {
				try {
					const side = tool.describeSideEffect(args);
					return side?.summary || side?.kind || "写入操作";
				} catch {
					return "写入操作";
				}
			}
			: () => "写入操作";

		const promptGuidelines = String(tool.promptGuidelines || "").trim();
		const toolDescription = promptGuidelines
			? `${tool.description}\n\n使用指引：\n${promptGuidelines}`
			: tool.description;
		const disposer = ctx.tools.register(defineTool({
			name: runtimeName,
			description: toolDescription,
			parameters: toFlatParameters(tool.parameters),
			output: {
				schema: {
					type: "object",
					additionalProperties: true,
					properties: {
						text: { type: "string", required: true },
					},
				},
				// 防御性渲染：text 缺失（理论上的非 textResult 透传）时回退 JSON。
				render: (_args, value) => [{
					type: "text",
					text: value?.text ?? JSON.stringify(value),
				}],
			},
			execute: async (args, exec) => {
				const agent = exec?.agent || null;
				const toolCtx = {
					store,
					sessionId: agent?.id || null,
					sessionPath: null,
					userId: null,
					agentId: agent?.id || null,
				};
				if (requiresApproval) {
					if (!agent) {
						return { text: "操作取消：缺少会话上下文，无法请求用户批准。" };
					}
					let outcome;
					try {
						outcome = await ctx.approval.request({
							agent,
							toolName: runtimeName,
							callId: exec?.callId,
							reason: describeSideEffect(args),
							signal: exec?.signal,
						});
					} catch (error) {
						// 无 open turn 等情形下 approval.request 会拒绝：转为友好结果，不抛出
						return { text: `操作未执行（无法请求批准：${error?.message || "approval 服务不可用"}）。` };
					}
					if (outcome !== "allowed-once") {
						return { text: `操作已取消（未获批准）。`, outcome };
					}
				}
				return toDsResult(await tool.execute(args, toolCtx));
			},
		}));
		disposers.push(disposer);
		ctx.logger.info("hana-research: registered tool %s%s", runtimeName, requiresApproval ? " (review)" : "");
	}
	return () => {
		for (const dispose of disposers) dispose();
	};
}
