# 社区发布 R6：公开文档与治理

时间：2026-08-28（Asia/Shanghai）

## 目标

提供中英文 README、LICENSE、CHANGELOG、SECURITY、CONTRIBUTING；陌生用户只阅读公开文档即可完成安装、使用、更新和卸载。

## 已完成

- 新增根 `LICENSE`（MIT，与 package.json 的 license 字段一致，版权归 dsh-hana-research contributors）。
- 新增 `CHANGELOG.md`：0.4.0-beta.1 条目，覆盖新增功能、包瘦身、隐私默认、安全修复、兼容性口径与旧阅读器移除；此前 v0–v40 为本地迭代，注明未公开发布。
- 新增 `CONTRIBUTING.md`：开发环境（Node ≥ 22.13、Harness 桌面端、web 前端构建）、测试命令（Windows 下逐个枚举 tests/*.test.mjs）、memory/ 里程碑协作约定、files 白名单边界、发布门槛联动。
- 新增 `README.en.md`：英文功能摘要、Beta 安装/更新/卸载、兼容性、数据与隐私、验证方式；明确以中文文档为准。
- 上述文件全部加入 `package.json` `files` 白名单；发布元数据测试新增「治理文档齐全 + CHANGELOG 含当前版本 + LICENSE 为 MIT」断言。
- 复核既有公开文档覆盖度：安装/使用/更新/卸载在 README 与用户指南；数据目录、备份回滚、schema 快照在 README「回滚」与用户指南第 5 节；联网域名清单在 SECURITY.md。

## 留待后续

- 问题反馈渠道（邮箱/Issue 链接）待 R8 公开仓库建立后补进 README 与 SECURITY.md。
- 中英文档后续如有内容改动需同步两份 README（已在 README.en 顶部注明中文为准）。

## 验证

- 全部 Node 测试 167/167 通过（新增 1 条治理文档断言）；Markdown 编辑器测试 7/7 通过。
- 发布元数据测试确认白名单包含全部治理文档且体积门槛仍满足。

## 后续边界

- R7：CI（GitHub Actions：完整 Node 测试、编辑器测试、打包检查、干净安装冒烟）+ 真实 Harness 端到端发布验收（安装→建项目→上传 PDF→阅读批注→导出→升级→卸载）。
