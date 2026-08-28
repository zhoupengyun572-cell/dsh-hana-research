// Host half of dsh-hana-research.
// P1: business API dispatch (/api/hana-research/*), workspace pages
// (/ui/hana-research/*), and the journal sync timer on the harness webServer.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
	getResearchStore,
	clearResearchStoreCache,
	RESEARCH_SCHEMA_VERSION
} from "./store.js";
import { createApiHandler, JOURNAL_SYNC_INTERVAL_MS } from "./api.js";
import { registerPages } from "./pages.js";
import { registerResearchTools } from "./register-tools.js";
import { registerSubscriptionReporting } from "./reporting.js";
import { HANA_RELEASE_VERSION } from "./version.js";

export const name = "hana-research";
export const inject = ["webServer", "timer", "tools", "approval", "llm", "agentDefaultModel"];

const API_PREFIX = "/api/hana-research";

/** Durable store root: <DSH_HOME>/plugin-data/hana-research. */
export function resolveDataDir() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const dataDir = join(home, "plugin-data", "hana-research");
	mkdirSync(dataDir, { recursive: true });
	return dataDir;
}

function sendJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

export async function apply(ctx) {
	const store = getResearchStore(resolveDataDir());

	// ── 业务 API：统一 prefix 路由 ──
	const { handle: apiHandler, journalSync } = createApiHandler(ctx, store);
	const apiDisposer = ctx.webServer.register({
		kind: "prefix",
		path: API_PREFIX,
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", "http://dsh.local");
			// 精简健康检查：不进入业务 dispatch
			if (url.pathname === `${API_PREFIX}/health`) {
				sendJson(res, 200, {
					ok: true,
					plugin: name,
					schemaVersion: RESEARCH_SCHEMA_VERSION,
					releaseVersion: HANA_RELEASE_VERSION,
					dbPath: store.dbPath,
					projects: store.listProjects().length,
					papers: store.listPapers().length,
				});
				return;
			}
			await apiHandler(req, res, url);
		},
	});

	// ── 研究页面与资产（iframe 复用 OpenHanako 前端） ──
	const pageDisposer = registerPages(ctx);

	// ── Agent 工具层（20 个工具；写工具经 approval 确认 + 审计） ──
	const toolsDisposer = registerResearchTools(ctx, store);

	// ── Agent 研究工作流 + 订阅主动汇报（新会话注入） ──
	const reportingDisposer = registerSubscriptionReporting(ctx, store);

	// ── 期刊同步定时器：启动 15s 后首次，之后每 24h；防重入由 createJournalSync 保证 ──
	const timerDisposers = [];
	const scheduleNext = () => {
		timerDisposers.push(ctx.timer.timeout(() => {
			journalSync.start();
			scheduleNext();
		}, JOURNAL_SYNC_INTERVAL_MS));
	};
	timerDisposers.push(ctx.timer.timeout(() => {
		journalSync.start();
		scheduleNext();
	}, 15_000));

	ctx.logger.info(
		"hana-research: host half active (schema v%d at %s)",
		RESEARCH_SCHEMA_VERSION,
		store.dbPath
	);

	return () => {
		apiDisposer();
		pageDisposer();
		toolsDisposer();
		reportingDisposer();
		for (const dispose of timerDisposers) dispose();
		clearResearchStoreCache();
	};
}
