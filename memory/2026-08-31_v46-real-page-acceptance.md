# v46 真机验收：独立 Harness 截图检查 + 两处真机发现修复

时间：2026-08-31（Asia/Shanghai）

## 背景

v41–v45 五轮改版的布局/交互类交付一直欠真机截图验收（CLAUDE.md 固定验收门）。本轮搭建了可复用的独立验收环境并完成全量真机检查，顺带修复验收发现的两处缺陷。

## 验收环境（可复用流程）

1. `mklink /J C:\tmp\dsh-verify\profiles → %USERPROFILE%\.dsh\profiles`（junction 复用 profile 包，无需重装）；
2. 预置数据：node 脚本以 `new ResearchStore('C:/tmp/dsh-verify/plugin-data/hana-research', { seedDemoData: true })` 种演示项目/文献，`storeUploadedPdf` 挂真实 PDF（**pdfkit 生成，中文字体需显式注册否则画布乱码**；首次用空格填充的假 PDF 会被 PDFium 拒绝——FPDF_LoadMemDocument 错误码 3）；
3. `DSH_HOME=C:\tmp\dsh-verify node <profiles>/@deepseek-ai/dsh/lib/bin.js web --no-open --port 0`，启动日志输出动态端口；
4. Browser Use（IAB）执行检查；验收后 kill 进程、`rmdir` junction、删 scratch，运行副本不受影响。
5. 注意：junction 使实例运行的是**运行副本 lib**（0.4.0 前基线，空库自动播 153 篇旧演示数据）+ 已同步的新静态资产——这正好等同用户当前运行时状态，是合法验收对象。

## 验收结果（1440px + 430px + 强制深色）

- 文献中心：顶栏/工作区切换器/命令面板/设置入口/检索/期刊同步条/文献卡全套渲染正常；期刊同步真实拉取 1400+ 篇。
- SPA 转场（v42）：文献中心 ↔ 项目库 pushState 切换，`document.title` 双向同步（"文献中心/项目库 · HanaResearch"），window 标记跨导航存活（无整页刷新），浏览器前进/后退正常。
- 阅读器（v41/v45）：真实 PDF 三页渲染正常（93% 缩放、工具栏、左右面板、保存状态"已保存"）；**强制深色全工作台生效**（--wb-bg 变为内置深色 #0C121B，画布 key 重挂载后仍正常渲染）——v41 主题修复真机确认；阅读器标题 "文献题名 · 项目名" 正确。
- 窄屏 430px：顶栏紧凑、卡片堆叠正常。
- 快速连续切换压测（4 次 350ms 间隔）：零控制台错误、零未处理拒绝。

## 真机发现并修复的两处缺陷

1. **"Transition was skipped" 错误通知**（v42 引入的回归）：连续切换/文档隐藏时 `document.startViewTransition` 的 `ready`/`finished` promise 会拒绝，未接住即走全局 unhandledrejection 弹错误 toast。修复：`transition.ready?.catch(() => {}); transition.finished?.catch(() => {})`（assets/research.js navigateWorkspace）。修复后压测零异常。
2. **窄屏文献卡作者与按钮碰撞**（v38 时代存量）：≤680px 单列下 `.paper-actions` 的两列网格（作者+按钮同行）放不下，按钮叠在作者文字上。修复：≤680 断点改单列纵向堆叠（作者行在上、按钮行在下）（assets/research.css）。430px 复验通过。

两处均已同步运行副本（静态资产，新页面直接生效）。

## 验证

- 根测试 175/175；research.js node --check 通过。
- 验收实例已停止（端口 14261 已失活），scratch 目录与 junction 已清理，运行副本完好。

## 留给后续的清单

1. 翻页全树重渲染治理（LeftPanel/RightPanel React.memo + 回调稳定化）。
2. 弹层工厂第二步（36 处样板收敛）；API 路由样板收敛（90+ 处 withError）。
3. lib/pages.js 的 `<title>` 服务端输出与 theme-bridge 内联增强随 0.4.0 整体升级生效（本机验收已验证客户端兜底路径可用）。
