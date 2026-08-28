# 社区发布 R8：公开仓库、Release 与零安装验证

时间：2026-08-28（Asia/Shanghai）

## 目标

创建可公开审阅的干净 Git 仓库，发布 `v0.4.0-beta.1`，完成 CI、发布资产、社区可发现性与公开 GitHub 标签安装验证。

## 已完成

- 公开仓库：`https://github.com/zhoupengyun572-cell/dsh-hana-research`
- Beta Release：`https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1`
- 最终 CI：`https://github.com/zhoupengyun572-cell/dsh-hana-research/actions/runs/33183002580`
- 公开仓库采用独立干净历史；最终标签提交为 `53bad94241a5b034395a90384513e58bac8e04f0`。
- topics：`academic-research`、`deepseek-harness`、`dsh-plugin`、`literature-review`、`pdf-annotation`。
- 公开历史隐私扫描未发现作者本机路径、内部包名、原研究项目名、`archive/`、`memory/` 或 `CLAUDE.md`。

## 发布资产

- `dsh-hana-research-0.4.0-beta.1.tgz`：18,493,037 bytes。
- `dsh-hana-research-checksums.sha256`：101 bytes。
- SHA-256：`437495d420fdff5268d8fb5431a06b8f7afcb7702ae4aa7133531f6bd9b2a8e7`。
- 压缩包共 68 个条目；Release 附件与最终 CI artifact 校验一致。

## 验证

- GitHub Actions：Ubuntu/Windows × Node 22/24 全部通过；打包任务通过。
- 根测试 167/167、编辑器测试 7/7。
- 在全新隔离目录 `C:/Users/zhou/.codex/tools/dsh-hana-public-install-20260828-231156` 中执行：

  `dsh plugin --profile web add github:zhoupengyun572-cell/dsh-hana-research#v0.4.0-beta.1`

  安装成功，pnpm 完成 118 个包部署；`dsh --profile web --dump-config` 出现 `# == dsh-hana-research`、`id: hana-research` 与 `name: dsh-hana-research`。此次验证未触碰用户当前 Harness Profile。

## 发布结论与边界

- R0–R8 发布门槛全部完成，可提交/展示于 DeepSeek Harness 社区并供用户通过 GitHub 标签安装。
- 当前为 Beta：Harness 本身仍处开发者预览期。
- Windows 已完成真实 Harness 端到端验收；Ubuntu 仅完成自动化 CI，尚无完整 GUI 人工验收。
- `exceljs → uuid@8.3.2` 仍有 2 项中等上游告警，且有 6 项传递依赖弃用告警；无高危/严重漏洞，详情见 `SECURITY.md`。
- 当前发布渠道为 GitHub Release，未发布到 npm。
