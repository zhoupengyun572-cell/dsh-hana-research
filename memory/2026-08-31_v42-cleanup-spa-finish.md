# v42 清理与收官：死 reader 体系删除、companion 补漏、SPA 收官、z-index 收编

时间：2026-08-31（Asia/Shanghai）

## 背景

v41 修复周后按三路深度审查的优先级清单继续。本里程碑处理 UI 层清理项：约 1350 行死代码、v37 字号收敛的 companion 漏网、v38 SPA 的收官欠账、v36 层叠刻度的未收编魔数。

## 已实现

### 死 reader 体系删除（约 -1153 行 JS / -220 行 CSS）

- 删除 `renderPdfReader` 全家（原 4917–6035：阅读器渲染、文本选区、缩略图、大纲、全文搜索、键盘处理、animateStageScroll）——v38 阅读器迁往独立 workbench 后零调用点，占 research.js 约 18%。
- 删除 `showReaderToast` / `publishReaderContext` / `researchChannel` 定义与 message 监听 / `state.reader`。companion 侧的同名 channel 与 localStorage 兜底不受影响（其 context 生产者本就随旧 reader 消亡，一直走 renderIdle）。
- research.css 删除对应死样式：`.pdf-reader-shell` 全家、`.reader-*`、`.selection-popover`、`.annotation-rect`、`.textLayer`、`.search-hit`、`.page-*`、`.note-composer`、`.undo-toast`、`.notice`、死 keyframes（page-pulse/selection-pop/toast-in/toast-out）；reduced-motion 规则里的 undo-toast 残段一并清理。
- research.js 6150 → 约 5000 行；research.css 3137 → 2932 行。node --check 与花括号配平通过。

### companion 侧栏补漏（v37b）

- research-companion.css 全面字号收敛：6–8px（×20 处）→ kicker/徽章/元信息 10px 下限，正文/引文/文本域 11px，小标题 12.5px。
- 4 组硬编码青蓝/绿色 hex（引文边框/底、标签、成功通知）改为 `light-dark()` 双值 token（--quote-line/--quote-bg/--tag-ink/--tag-bg/--notice-ink/--notice-bg），深色模式首次正确。
- **theme-bridge 新增 color-scheme 同步**（外链 theme-bridge.js 与 pages.js 内联 THEME_BRIDGE_SCRIPT 两份同步）：按宿主 --bg 亮度设置 `root.style.colorScheme`，使 light-dark() 跟随宿主主题而非 OS 偏好；无宿主 tokens 时保持声明的 light dark 跟随系统。这是 companion 双值生效的前提。

### SPA 收官（v38 欠账）

- renderShell（lib/pages.js）按 workspace 输出 `<title>`（文献中心/项目库）；navigateWorkspace 与 boot 同步 document.title——深链接/历史条目/标签页不再无名。
- startViewTransition 回调改为 await 渲染 promise：转场新快照在内容就绪后采样，不再定格骨架屏。
- `history.scrollRestoration = 'manual'`（经 window.history 访问，兼容 happy-dom 测试环境）；boot 时消费 pagehide 写入的 `hana-literature-state`（筛选 + 滚动现场，仅 boot 一次，SPA 内不读避免覆盖内存态）——该键自 v38 写入后首次接上消费方。

### z-index 收编（v36 欠账）

- `.project-drawer` 35 → var(--research-z-modal)；`.paper-more-menu` 24 → var(--research-z-menu)（修复卡片菜单滚到顶部被 app-bar(30) 遮挡）；`.project-more` 30 → var(--research-z-menu)。
- 保留的裸值：app-bar 30（基层）、局部层叠 0/1/4（组件内相对层级，不涉全局刻度）。

## 验证

- 根测试 171 项全绿（含 ui-interactions 6 项 DOM 级交互测试；唯一修复过程问题：scrollRestoration 裸 `history` 全局在 happy-dom 缺失，改 window.history 后通过）。
- 仅 ai/tools 两项外网依赖测试因沙箱无网失败（与此前基线一致）。
- research.js / research-companion.js / theme-bridge.js / lib/pages.js 均通过 node --check。

## 部署与恢复

- 已同步静态资产（research.js / research.css / research-companion.css / theme-bridge.js）到运行副本 `@local/dsh-hana-research`，新页面直接生效。
- lib/pages.js 的 <title> 与内联 bridge 增强未同步运行副本（其 lib 仍为 0.4.0 前基线，理由同 v41：避免混合状态；随 0.4.0+v41+v42 整体升级时生效）。
- 同步前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\v42-cleanup-20260831-002617`。

## 留给 v43 的清单

1. store 单行查询改造（getPaper/getProject 全表聚合回读 ×29 调用点）+ papers(venue/source_name/doi) 索引 + 语句预编译。
2. listDuplicateCandidates O(n²) 改造、responseCache 容量上限、翻译任务并发控制 + 失败日志。
3. 弹层工厂第二步：36 处 openModalLayer 样板收敛（innerHTML+bind+close 统一）；109 处 data-* 绑定器收敛为事件委托。
4. 真机页面验证债务：v41/v42 的主题切换与 SPA 转场待 Harness 启动后补截图（端口动态发现）。
