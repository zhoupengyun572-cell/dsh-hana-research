# 里程碑：UI 可靠性与信息减负 v19

日期：2026-08-21

## 背景

用户反馈部分按钮点击后无响应、功能入口杂乱、动效不流畅、页面信息密度过高。本轮以“可靠反馈 → 渐进披露 → 克制动效”为顺序优化，保持温暖的学术编辑台方向。

## 已完成

- 修复项目抽屉关闭定时器与快速重开之间的竞争：新请求会取消旧关闭定时器，并用 request token 丢弃过期异步结果。
- 旧模态层退场时禁用 pointer events，避免 160ms 退场窗口截获新弹层点击。
- Agent 交接后在插件内显示可见 notice；全局未处理 Promise 异常也会转成错误 notice。
- 修复 `.button.primary` 的无效 `color-mix(... 106% ...)`，避免主按钮背景退化为透明。
- 文献中心改为主命令栏：全网检索为第一视觉层级；库内筛选、导入目标和保存检索为第二层级。
- 主题、阅读状态、方法学与收藏集进入可记忆的“精细筛选”面板。
- 期刊同步与期刊源列表改为默认折叠的 disclosure；选择特定期刊时自动保持展开。
- 文献卡片只常驻“导入、阅读状态、收藏、更多”；优先级、方法学、相关文献、引文、集合、BibTeX 与 Agent 进入就近菜单。
- 项目抽屉只常驻下一步和核心项目动作；副驾驶/研究闭环与论证链改为按需展开。
- 新增 `tests/ui-interactions.test.mjs`，覆盖筛选展开、Agent 反馈、文献更多菜单结构、抽屉快速关闭后重开。
- 静态资源版本提升到 `v19`，防止宿主 iframe 继续使用旧缓存。

## 验证

- `node --check assets/research.js` 通过。
- `tests/*.test.mjs`：111/111 通过（含新增 2 项 UI 回归测试）。
- `web/tests/markdown.test.mjs`：7/7 通过。
- 真实 Chromium 页面视觉检查：默认宽屏、760×900 窄屏均无横向拥挤；筛选、期刊 disclosure、文献更多菜单与项目抽屉正常。
- 动效遵循高频操作即时、浮层 150–240ms，并保留 `prefers-reduced-motion` 与显式 reduced motion 设置。

## 交付范围

- 源码：`assets/research.js`、`assets/research.css`、`lib/pages.js`。
- 回归测试：`tests/ui-interactions.test.mjs`。
- 未修改阅读工作台 React 源码，因此本轮无需重新构建 `reader-workbench.js/css`。
- 已同步到运行副本 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research`，三项文件 SHA-256 均与开发目录一致。
- 同步前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\ui-v19-before-sync-20260821-191418`。
- 本轮未擅自重启 Harness；若宿主已经运行，`v19` 缓存号需在下次正常重载/重启后完全生效。
