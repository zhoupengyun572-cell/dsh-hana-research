# GitHub 社区展示完善：产品型 README、脱敏截图与反馈模板

时间：2026-08-29（Asia/Shanghai）

## 目标

把公开仓库首页从“开发版本功能清单”改成陌生用户能够快速理解、评估并安装的产品入口，同时补齐社区反馈与贡献流程。

## 参考项目与原则

- DeepSeek Harness 官方的 product-first root README 裁决：根 README 应作为紧凑的产品与贡献入口，详细能力下沉到用户指南和技术文档。
- Better Notes for Zotero：首屏视觉预览、按工作流解释能力、明确安装与快速开始。
- MetaScreener：用能力矩阵和步骤化流程解释系统综述工具。
- OpenDesign：产品导览截图使用两列布局，并为每张图提供一句用户价值说明。

## 已完成

- 重写中英文 README：产品定位、Beta 状态、能力矩阵、工作流、三分钟上手、安装、数据/安全边界、兼容性、文档导航与反馈入口。
- 增加 Release、CI、MIT、Node 与 Harness 徽章。
- 在独立 `DSH_HOME` 与合成演示 PDF 中生成 4 张新截图：项目库、项目概览、证据工作流、阅读工作台。
- 截图只使用显式演示项目、合成 PDF 和公开书目信息，不含真实用户项目、私人论文或作者本机路径。
- 增加 GitHub Issue Forms：Bug 报告、功能建议、安全报告/使用指南引导；增加 PR 模板与隐私安全检查项。
- `package.json` 白名单加入 `docs/images`，保证未来打包后的 README 图片不失效。

## 验证

- 根测试：167/167。
- 阅读器编辑器测试：13/13。
- `npm pack --dry-run`：72 个文件、18.93 MB，包含 4 张 README 图片，仍低于 30 MB 发布门槛。
- README 本地链接目标全部存在；新增公开文本通过作者路径与内部项目标记扫描。
- 4 张截图均经视觉检查；Playwright 浏览器与独立 Harness 服务验收后已关闭。

## 后续边界

- 暂不增加独立营销网站、GitHub Discussions 或大型 roadmap；Beta 阶段先通过结构化 Issues 收集真实用户反馈。
- 当前 UI 仍以简体中文为主，英文 README 已明确说明。
- `v0.4.0-beta.1` 标签与 Release 资产保持不变；本次是 `main` 分支的社区展示与治理改进，不重写已发布标签。
