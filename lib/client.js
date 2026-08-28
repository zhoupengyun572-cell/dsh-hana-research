// Client half of @local/dsh-hana-research — hand-written bundle in the exact
// factory-CJS format the browser module loader expects.
// P1: sidebar entry (sidebar.footer.action) + full-screen overlay iframe host
// (shell.overlay) for the ported literature/projects pages, plus a
// settings.section health panel.
window.__ModuleLoader__.load({
	id: "@local/dsh-hana-research",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");

		// ── 入口按钮 ↔ overlay 宿主之间的共享状态（模块级订阅） ──
		var overlayListeners = [];
		var overlayState = { open: false, page: "literature" };
		function setOverlay(next) {
			overlayState = next;
			overlayListeners.forEach(function (fn) { fn(); });
		}
		function subscribeOverlay(fn) {
			overlayListeners.push(fn);
			return function () {
				overlayListeners = overlayListeners.filter(function (f) { return f !== fn; });
			};
		}
		function useOverlay() {
			var useState = react.useState;
			var useEffect = react.useEffect;
			var [state, setState] = useState(overlayState);
			useEffect(function () {
				return subscribeOverlay(function () { setState(overlayState); });
			}, []);
			return state;
		}

		// ── 研究界面 → 当前 Agent 输入框：只填入草稿，不自动发送 ──
		function ResearchComposerBridge(props) {
			var useState = react.useState;
			var useEffect = react.useEffect;
			var [notice, setNotice] = useState(null);
			var draft = props && props.input ? props.input.draft : "";
			var inputActions = props && props.inputActions;
			useEffect(function () {
				if (!inputActions) return;
				var clearTimer = null;
				function receive(event) {
					if (event.origin !== window.location.origin) return;
					var message = event.data;
					if (!message || message.type !== "hana-research.agent-handoff") return;
					var prompt = String(message.prompt || "").trim();
					if (!prompt) return;
					try {
						inputActions.setDraft(draft && draft.trim() ? draft.trimEnd() + "\n\n" + prompt : prompt);
						if (message.requestId && event.source && event.source.postMessage) {
							event.source.postMessage({
								type: "hana-research.agent-handoff-ack",
								requestId: message.requestId,
								ok: true
							}, event.origin);
						}
						setOverlay({ open: false, page: overlayState.page });
						setNotice(message.label || "研究上下文已加入输入框");
					} catch (error) {
						if (message.requestId && event.source && event.source.postMessage) {
							event.source.postMessage({
								type: "hana-research.agent-handoff-ack",
								requestId: message.requestId,
								ok: false,
								error: "无法写入 Agent 输入框"
							}, event.origin);
						}
						setNotice("交接失败，请重试");
						return;
					}
					if (clearTimer) window.clearTimeout(clearTimer);
					clearTimer = window.setTimeout(function () { setNotice(null); }, 4200);
					window.requestAnimationFrame(function () {
						var textarea = document.querySelector("textarea");
						if (textarea) {
							textarea.focus();
							textarea.setSelectionRange(textarea.value.length, textarea.value.length);
						}
					});
				}
				window.addEventListener("message", receive);
				return function () {
					window.removeEventListener("message", receive);
					if (clearTimer) window.clearTimeout(clearTimer);
				};
			}, [inputActions, draft]);
			if (!notice) return null;
			return react.createElement(
				"div",
				{ role: "status", style: { display: "flex", alignItems: "center", gap: "6px", padding: "3px 8px", color: "var(--dsw-alias-label-secondary)", fontSize: "11px" } },
				react.createElement("span", { style: { color: "var(--dsw-alias-accent, #9c4f33)" } }, "◆"),
				notice + " · 检查后发送"
			);
		}

		// ── 侧栏底部入口：打开科研工作区 ──
		function ResearchEntry() {
			var overlay = useOverlay();
			var active = overlay.open;
			return react.createElement(
				"button",
				{
					onClick: function () { setOverlay({ open: !active, page: "literature" }); },
					title: "文献中心 / 项目库（Hana Research）",
					style: {
						display: "flex", alignItems: "center", gap: "8px", width: "100%",
						padding: "7px 12px", borderRadius: "8px", border: "1px solid transparent",
						background: active ? "var(--dsw-alias-fill-l2, transparent)" : "transparent",
						color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
						fontSize: "13px", cursor: "pointer"
					}
				},
				react.createElement(
					"span",
					{ style: { fontSize: "14px", lineHeight: 1 } },
					"📚"
				),
				react.createElement("span", null, "科研")
			);
		}

		// ── 全屏 overlay：iframe 承载文献中心 / 项目库页面 ──
		function ResearchOverlay() {
			var overlay = useOverlay();
			var iframeRef = react.useRef(null);
			var useEffect = react.useEffect;

			// Esc 关闭：同时监听父文档与同源 iframe 内部（焦点在 iframe 里时
			// 按键不会冒泡到父文档，必须直接挂到 iframe.contentWindow）。
			useEffect(function () {
				if (!overlay.open) return;
				function escHandler(e) {
					if (e.key === "Escape") {
						e.preventDefault();
						setOverlay({ open: false, page: overlay.page });
					}
				}
				window.addEventListener("keydown", escHandler);
				var frame = iframeRef.current;
				function attachFrame() {
					var win = iframeRef.current && iframeRef.current.contentWindow;
					if (win) win.addEventListener("keydown", escHandler);
				}
				if (frame) {
					if (frame.contentWindow) attachFrame();
					frame.addEventListener("load", attachFrame);
				}
				return function () {
					window.removeEventListener("keydown", escHandler);
					var win = iframeRef.current && iframeRef.current.contentWindow;
					if (win) win.removeEventListener("keydown", escHandler);
					if (frame) frame.removeEventListener("load", attachFrame);
				};
			}, [overlay.open, overlay.page]);

			if (!overlay.open) return null;
			var PAGES = {
				literature: { label: "文献中心", url: "/ui/hana-research/literature" },
				projects: { label: "项目库", url: "/ui/hana-research/projects" },
			};
			var page = PAGES[overlay.page] || PAGES.literature;
			// Windows 桌面壳会在页面最上层注入左侧拖动区（0–168px）和右侧
			// caption 控件（末 138px）。全屏 shell.overlay 仍位于这些宿主控件下方，
			// 因此桌面版顶栏需要主动避让；普通浏览器页面保持原有紧凑间距。
			var desktopChrome = !!window.dshDesktop;
			var barStyle = {
				display: "flex", alignItems: "center", gap: "6px",
				padding: desktopChrome ? "8px 152px 8px 182px" : "8px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))",
				background: "var(--dsw-alias-bg-base, #1a1a1a)",
				flex: "none"
			};
			var tabStyle = {
				padding: "5px 14px", borderRadius: "7px", border: "none", cursor: "pointer",
				fontSize: "13px", background: "transparent", color: "var(--dsw-alias-label-secondary)"
			};
			var tabActive = Object.assign({}, tabStyle, {
				background: "var(--dsw-alias-fill-l2, rgba(128,128,128,.15))",
				color: "var(--dsw-alias-label-primary)"
			});
			var closeStyle = {
				marginLeft: "auto", padding: "5px 12px", borderRadius: "7px", border: "none",
				cursor: "pointer", fontSize: "13px",
				background: "transparent", color: "var(--dsw-alias-label-secondary)"
			};
			return react.createElement(
				"div",
				{
					style: {
						// 宿主 shell.overlay 层是 click-through（pointer-events:none，会继承），
						// 必须显式接管指针事件，否则整层（含 iframe）点击穿透、项目库按钮无反应。
						position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "auto",
						display: "flex", flexDirection: "column",
						background: "var(--dsw-alias-bg-base, #1a1a1a)"
					}
				},
				react.createElement(
					"div",
					{ style: barStyle },
					Object.keys(PAGES).map(function (key) {
						return react.createElement(
							"button",
							{
								key: key,
								onClick: function () { setOverlay({ open: true, page: key }); },
								style: overlay.page === key ? tabActive : tabStyle
							},
							PAGES[key].label
						);
					}),
					react.createElement(
						"button",
						{ onClick: function () { setOverlay({ open: false, page: overlay.page }); }, style: closeStyle },
						"关闭 (Esc)"
					)
				),
				react.createElement("iframe", {
					ref: iframeRef,
					src: page.url,
					title: page.label,
					style: { flex: 1, border: "none", width: "100%", background: "var(--dsw-alias-bg-base, #1a1a1a)" }
				})
			);
		}

		// ── 设置页：数据层健康状态 + 工作区入口 ──
		function ResearchPanel() {
			var useState = react.useState;
			var useEffect = react.useEffect;
			var [health, setHealth] = useState(null);
			var [error, setError] = useState(null);

			useEffect(function () {
				fetch("/api/hana-research/health")
					.then(function (r) { return r.json(); })
					.then(setHealth)
					.catch(function (e) { setError(String((e && e.message) || e)); });
			}, []);

			var noteStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", margin: "0 0 10px", lineHeight: "18px" };
			var cardStyle = {
				marginTop: "8px", padding: "10px 12px", borderRadius: "10px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-fill-l2)",
				color: "var(--dsw-alias-label-primary)", fontSize: "13px", lineHeight: "20px"
			};
			var buttonStyle = {
				marginTop: "10px", marginRight: "8px", padding: "6px 14px", borderRadius: "8px",
				border: "none", background: "var(--dsw-alias-button-floating-fill, rgba(128,128,128,.2))",
				color: "var(--dsw-alias-label-primary)", fontSize: "13px", cursor: "pointer"
			};

			return react.createElement(
				"div",
				{ style: { maxWidth: "640px" } },
				react.createElement("p", { style: noteStyle }, "Hana Research：文献检索、期刊追踪、项目库与 PDF 阅读。"),
				error
					? react.createElement("p", { style: cardStyle }, "宿主未响应：" + error)
					: health
						? react.createElement(
							"div",
							{ style: cardStyle },
							"数据层已就绪 · schema v" + health.schemaVersion + " · 项目 " + health.projects + " 个 · 文献 " + health.papers + " 篇 · " + health.dbPath
						)
						: react.createElement("p", { style: cardStyle }, "检查中…"),
				react.createElement(
					"button",
					{ style: buttonStyle, onClick: function () { setOverlay({ open: true, page: "literature" }); } },
					"打开文献中心"
				),
				react.createElement(
					"button",
					{ style: buttonStyle, onClick: function () { setOverlay({ open: true, page: "projects" }); } },
					"打开项目库"
				)
			);
		}

		// ── 对话内嵌卡片：研究工具调用 → iframe 卡片（tool.call.toolview） ──
		function ResearchCardView(props) {
			var block = props && props.block;
			var toolName = props && props.toolName;
			var src = null;
			var label = "";
			try {
				var args = block && block.arguments ? JSON.parse(block.arguments) : {};
				if (toolName === "hana_research_search_literature") {
					src = "/ui/hana-research/cards/search-results" + (args && args.query ? "?q=" + encodeURIComponent(String(args.query)) : "");
					label = "全网学术检索结果";
				} else if (toolName === "hana_research_report_journal_updates") {
					src = "/ui/hana-research/cards/journal-updates";
					label = "期刊更新";
				} else if (toolName === "hana_research_list_research_projects") {
					src = "/ui/hana-research/cards/project-overview";
					label = "项目概览";
				} else if (toolName === "hana_research_get_project_brief") {
					src = "/ui/hana-research/cards/project-brief" + (args && args.projectId ? "?projectId=" + encodeURIComponent(String(args.projectId)) : "");
					label = "项目研究简报";
				}
			} catch (e) { /* arguments 解析失败时静默降级 */ }
			if (!src) return null;
			return react.createElement(
				"div",
				{
					style: {
						border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3))",
						borderRadius: "10px", overflow: "hidden", margin: "6px 0"
					}
				},
				react.createElement("iframe", {
					src: src,
					title: label,
					style: {
						width: "100%", height: "360px", border: "none", display: "block",
						background: "var(--dsw-alias-bg-base, #1a1a1a)"
					}
				})
			);
		}

		var inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("sidebar.footer.action", function () {
				return ctx.slots.register(
					{ name: "sidebar.footer.action", id: "hana-research-entry", order: 510, label: "科研" },
					ResearchEntry
				);
			});
			ctx.slots.inject("shell.overlay", function () {
				return ctx.slots.register(
					{ name: "shell.overlay", id: "hana-research-overlay", order: 100 },
					ResearchOverlay
				);
			});
			ctx.slots.inject("conversation.input.dock", function () {
				return ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "hana-research-agent-bridge",
						order: 420,
						label: "研究上下文",
						inject: function (sessionId) {
							try {
								var sessions = ctx.get("sessions");
								var conversation = ctx.get("conversation");
								var scoped = sessions && sessions.scope(sessionId);
								var shell = scoped && conversation && conversation.input && conversation.input.for(scoped);
								return { inputActions: shell && shell.actions };
							} catch (error) {
								return { inputActions: null };
							}
						}
					},
					ResearchComposerBridge
				);
			});
			// 对话卡片：按工具名注册 iframe 卡片视图
			["hana_research_search_literature", "hana_research_report_journal_updates", "hana_research_list_research_projects", "hana_research_get_project_brief"].forEach(function (name) {
				ctx.slots.inject("tool.call.toolview", function () {
					return ctx.slots.register({ name: "tool.call.toolview", key: name }, ResearchCardView);
				});
			});
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{ name: "settings.section", id: "hana-research", order: 510, label: "科研（Hana Research）" },
					ResearchPanel
				);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
