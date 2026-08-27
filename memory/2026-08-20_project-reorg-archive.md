# 变更：项目目录整理 + 历史文件归档

日期：2026-08-20

## 做了什么

- 新建顶层 `archive/`，把项目早期阶段产物统一归档：
  - `archive/docs/`：17 个历史开发文档（PHASE_* 系列、PORT_PLAN、PRODUCT_DESIGN、COMPATIBILITY_REVIEW）
  - `archive/tools/`：10 个历史一次性验证/诊断脚本 + wb-debug.css
  - `archive/tests/`：26 个历史诊断脚本（非 *.test.mjs）
  - `archive/shots/`：61 个历史截图产物（含 before/、report.json）
  - `archive/misc/playwright-cli/`：4 个一次性临时产物
- 新增 `archive/MANIFEST-历史档案清单.md`：原路径→归档路径映射、每个文件用途、处置建议、反归档方法、安全边界。
- 新增 `docs/PLUGIN_OVERVIEW.md`：当前插件关键内容汇总（结构/能力矩阵/数据模型/API/部署/文档索引）。
- `README.md` 链接更新指向归档位置，并加 PLUGIN_OVERVIEW 入口。

## 保留（不可动）

lib/、assets/、web/、tests/*.test.mjs、tools/*.js（20 个 Agent 工具+_shared）、tools/cleanup-temp-entities.mjs、
tools/{button-audit,verify-cockpit,verify-evidence-closure,verify-shortcuts,walk-workbench-buttons}.mjs、
docs/USER_GUIDE.md、memory/。

## 验证

- `node --test tests/*.test.mjs` = 109/109 通过。
- `tools/verify-cockpit.mjs`、`tools/verify-shortcuts.mjs` 真实宿主零控制台错误。
- README 全部文档链接存在；顶层目录已清爽（archive + 运行必需 + 当前文档）。
