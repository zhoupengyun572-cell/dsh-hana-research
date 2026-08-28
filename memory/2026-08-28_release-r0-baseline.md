# 社区发布 R0：发布基线与版本口径

时间：2026-08-28（Asia/Shanghai）

## 目标

启动 DeepSeek Harness 社区发布加固工作，建立统一候选版本、可执行阶段计划和自动验收门槛，避免 npm、静态资源、健康检查和文档继续使用不同版本口径。

## 已完成

- 候选版本统一为 `0.4.0-beta.1`：根包、阅读器前端包、健康检查与静态资源缓存版本共用同一口径。
- 当前数据库口径统一为 schema v19；README、用户指南和维护者总览移除 v13/v15 等过期描述。
- 当前 Harness 开发兼容基线记录为 `@deepseek-ai/dsh-tools 0.1.0-rc.13`。
- 新增 `docs/COMMUNITY_RELEASE_PLAN.md`，定义 R0–R8 阶段、公开发布门槛和当前风险基线。
- 新增发布元数据测试，自动校验根包、前端包、运行时版本、公开文档版本和 schema 一致性。

## 验证

- 发布元数据测试：2/2 通过。
- 全部 Node 测试：156/156 通过。
- Markdown 编辑器测试：7/7 通过。
- `git diff --check`：通过。

## 下一阶段

R1 标准 Harness Bundle：正式包名、`dsh.bundle`、`cordis.patch.yml`、一键安装/更新/卸载和全新临时 Profile 冒烟。

