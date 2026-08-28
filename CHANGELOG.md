# 更新日志（Changelog）

本项目的显著变更记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循语义化版本（Beta 期以 `-beta.N` 标注）。

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
