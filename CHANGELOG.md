# 更新日志（Changelog）

本项目的显著变更记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循语义化版本（Beta 期以 `-beta.N` 标注）。

## [0.5.0-beta.1] - 2026-09-05

### 新增

- AI 预筛（第三评审）：按项目纳排标准对题录/摘要逐篇给出 include/exclude/uncertain 建议与置信度，按置信度分层展示；只出建议，不改动人工双盲判断，PRISMA 主流程口径不受影响。支持暂停/取消/断点续跑（幂等不重复计费）、串行队列保护宿主模型额度、与人工最终结论的一致率统计（schema v20）。
- 全库全文检索：服务端逐页提取本地 PDF 文本（复用自托管 pdf.js，零新增依赖）写入 SQLite FTS5；中文按字切分、英文按词，支持多词 AND 与短语检索；结果带页码定位与关键词高亮，可一键打开对应 PDF。导入自动索引，支持重建；扫描件（无文本层）与解析失败分别标记（schema v21）。
- 引用核验（定位为审计，不自动改写）：汇总笔记引文的四态账本——已确认 / 字段冲突 / 未收录（疑似幻觉）/ 需人工核对，由 Crossref 与 OpenAlex 双源确认并逐字段比对；中文本地题名对英文在线记录自动转人工。AI 综述草稿生成后自动核验草稿中的 DOI 与题名引用，并在草稿弹窗展示报告（schema v22）。
- Agent 工具新增只读 `hana_research_get_ai_screening`（查看预筛任务、分层建议与一致率），工具总数 20 → 21。

### 变更

- 项目笔记的外部 Markdown 文件改为时间窗合并写：同一时间窗内的多次笔记变更只落盘一次；读取路径仍强制同步，外部消费不会读到过期内容。
- 标签重命名增加 JSON 片段预过滤与批注批量加载，消除全表扫描与逐条查询。

### 兼容性

- 数据库 schema v19 → v22（v20/v21 为中间开发版本、从未随版本发布，真实升级路径为 v19 → v22），升级前自动备份 `.bak-v22-*` 快照；v20/v21 期间本地开发产生的库同样直接升级。
- Windows 实机（Node 24.15 + Harness dsh-tools 0.1.0-rc.13）完成 AI 预筛、全文检索端到端验收；Ubuntu/Windows × Node 22/24 自动化 CI 通过；macOS/Linux 实机仍未验证，已在 README 标注。

## [0.4.0-beta.1] - 2026-08-28

社区发布候选版。此前版本为本地开发迭代（v0–v40），未公开发布。

### 新增

- 标准 DeepSeek Harness 可安装 bundle：`dsh plugin --profile web add/update/remove` 一键安装、更新、卸载，无需手工修改 Profile（`dsh.bundle` + `cordis.patch.yml`）。
- 文献中心（多源检索、期刊订阅同步、重复文献合并）、项目研究驾驶舱（PRISMA 流程、双独立筛选、自定义研究编码、RoB 2/ROBINS-I/GRADE 质量评定）、阅读工作台（EmbedPDF 三栏精读：批注/逐句笔记/AI 简报）、原生导出（DOCX/PDF 项目笔记、CSV/XLSX/Markdown 证据矩阵）。
- Agent 协作：20 个只读/写入 Agent 工具，写入操作保留 Harness approval 确认与审计。

### 变更

- 发布包改为 `files` 白名单（lib/assets/docs/运行时工具），并移除未使用的 Noto 字重与旧版 pdf.js 阅读器回退；候选包从约 63 MB 压缩至 18.5 MB。
- 首次安装默认空数据库；示例数据改为显式 `seedDemoData: true`（仅测试/开发）。
- `engines.node >= 22.13.0`；`@deepseek-ai/dsh-tools` 以 optional peer `^0.1.0-rc.13` 声明（由宿主提供，公网 npm 暂无该版本）。

### 安全

- PDF 下载重定向每一跳重新执行主机白名单校验，修复重定向可被弹出到白名单外主机的问题。
- 新增 DNS/IP 级私网地址拦截（回环/私网/链路本地/CGNAT/组播及 IPv6 对应段），覆盖 PDF 下载与 Unpaywall 查询。
- 健康检查接口不再返回数据库绝对路径；公开源码与文档通过作者隐私扫描。联网行为与剩余风险清单见 `SECURITY.md`。

### 移除

- 旧版 pdf.js 阅读器回退路由 `/ui/hana-research/reader-legacy` 及其全部资产（阅读工作台自 v12 起为唯一入口）。

### 兼容性

- Windows 实机 + Node 24.15 + Harness `dsh-tools 0.1.0-rc.13` 已验证；其他 Node 版本（下限 22.13.0，由 `node:sqlite` 免旗标推导）与 macOS/Linux 未实测，已在 README 标注。

[0.5.0-beta.1]: https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.5.0-beta.1
[0.4.0-beta.1]: https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1
