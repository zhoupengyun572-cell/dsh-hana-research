# 历史档案清单（Archive Manifest）

> 用途：把项目早期阶段产生的**历史文档 / 一次性验证脚本 / 历史截图 / 临时产物**集中归档并记录「原路径 → 归档路径」映射，让主目录只保留当前运行与维护所需的文件。
> 归档日期：2026-08-20。本清单保证**可反归档**（按映射移回即可）。

## ⚠️ 安全边界（绝不归档/删除的运行必需件）

| 位置 | 内容 | 为何保留 |
|---|---|---|
| `lib/` | 宿主数据层 / API / 页面路由 / 工具注册 | 插件运行核心 |
| `assets/` | 前端与 PDF 引擎（自托管 vendor） | 页面/阅读器资产 |
| `web/` | 阅读工作区源码与构建 | 前端构建源 |
| `tests/*.test.mjs` | 全部 `*.test.mjs` 自动化测试 | 回归基线（`node --test`） |
| `tools/*.js` + `_shared.js` | 20 个 Agent 工具（宿主 `lib/register-tools.js` 引用） | 运行时工具，移动即失效 |
| `tools/cleanup-temp-entities.mjs` | 临时数据兜底清理器 | 被当前验证工具 import |
| `tools/{button-audit, verify-cockpit, verify-evidence-closure, verify-shortcuts, walk-workbench-buttons}.mjs` | 当前验证套件 | 持续回归 |
| `docs/USER_GUIDE.md` / `docs/PLUGIN_OVERVIEW.md` | 使用说明 / 关键内容总览 | 当前文档 |
| `memory/` | 里程碑运行记录（活档案） | 持续追加 |

---

## 归档结构

```
archive/
├─ MANIFEST-历史档案清单.md        ← 本文件
├─ docs/                           历史开发文档（PHASE*/PORT_PLAN/PRODUCT_DESIGN/...）
├─ tools/                          历史一次性验证/诊断脚本 + wb-debug.css
├─ tests/                          历史诊断脚本（非 *.test.mjs）
├─ shots/                          # 历史截图产物（含 before/ 子目录、report.json）
└─ misc/playwright-cli/            Playwright/一次性临时元素截图与页面 yml
```

## 原路径 → 归档路径 映射

### archive/docs/（历史开发文档，17 个）

| 原路径（docs/） | 归档路径（archive/docs/） | 内容 |
|---|---|---|
| PHASE_P0_DATA_LAYER.md | 同左 | P0 数据层阶段报告 |
| PHASE_P1_BATCH1.md | 同左 | P1 文献中心批次 1 |
| PHASE_P1_BATCH2.md | 同左 | P1 批次 2 |
| PHASE_P1_BATCH3.md | 同左 | P1 批次 3 |
| PHASE_P1_LITERATURE_CENTER.md | 同左 | 文献中心设计/实施 |
| PHASE_P2_A.md … PHASE_P2_D.md | 同左 | P2 四批（检索增强/阅读/翻译/证据矩阵等） |
| PHASE_P3_P4_P5.md | 同左 | 文献角色/证据矩阵/论证链阶段 |
| PHASE_READER_PDFJS.md | 同左 | 旧 pdf.js 阅读器阶段 |
| PHASE_READER_WORKBENCH.md | 同左 | 新三栏阅读工作区（EmbedPDF+Tiptap） |
| PHASE_UI_POLISH.md / PHASE_UI_POLISH_V9.md | 同左 | UI 收敛/产品化阶段 |
| PORT_PLAN.md | 同左 | OpenHanako→DSH 移植方案 |
| PRODUCT_DESIGN.md | 同左 | 产品功能设计稿（路线图参考） |
| COMPATIBILITY_REVIEW.md | 同左 | 兼容性审查 |

### archive/tools/（历史一次性脚本，10 个）

| 原路径（tools/） | 归档路径（archive/tools/） | 内容 / 处置 |
|---|---|---|
| verify-menu.mjs | 同左 | 管理菜单多尺寸验证（已被 button-audit 覆盖，可删可留） |
| smoke-workbench.mjs | 同左 | 阅读工作台旧冒烟（已被 walk/flow 覆盖） |
| smoke-project-tasks.mjs | 同左 | 旧任务面板冒烟 |
| test-back-button.mjs | 同左 | 返回按钮专项（问题已修复并回归） |
| test-selection-flow.mjs | 同左 | 选区全链路（⚠️ 它 import `./cleanup-temp-entities.mjs`，归档后相对路径失效，仅作历史参考） |
| check-sentence-tab.mjs | 同左 | 逐句 Tab 检查 |
| check-tdz.mjs | 同左 | 静态 TDZ 检查（历史；TDZ 问题已修复） |
| diag-local-papers.mjs | 同左 | 本地论文诊断 |
| manual-cleanup.mjs | 同左 | 手动清理辅助（正式清理用 `tools/cleanup-temp-entities.mjs`） |
| wb-debug.css | 同左 | 工作台调试样式 |

### archive/tests/（历史诊断脚本，26 个）

全部来自 `tests/`（非 `*.test.mjs`，`node --test` 不执行它们）：`diag-*.mjs`（7）、`e2e-cn-title.mjs`、`repro-venue-filter.mjs`、`smoke-p1b2/b1b3/p1-ui/p2a/p2b/p2c/p2d.mjs`（7）、`verify-*.mjs`（13：cards/chinese-title/cn-download/full-viewer/journal-bar/merge-venues/pdfjs-node/reader-selection/viewer/zero-intervention 等）。
内容：早期阶段对真实页面的中文标题/官网直连/期刊栏/全屏阅读器/零干预等的验证脚本。处置：仅历史，无保留必要；可随时删除。

### archive/shots/（历史截图产物，61 个）

- 原 `tools/shots/`（37 文件：多尺寸/主题/缩放菜单截图 + `report.json` + `before/` 24 文件）
- 原 `tools/shots/before/` 为改版前对照。
- 处置：截图产物，仅存档；当前验证工具会重新生成 `tools/shots/`。

### archive/misc/playwright-cli/（4 个）

- `element-*.png` / `page-*.png` / `page-*.yml`：一次性 Playwright 元素截图与页面快照。
- 处置：临时产物，可删。

---

## 如何反归档 / 删除

- **反归档**：把 `archive/<类>/<文件>` 移回映射表中的原路径即可（`docs/`、`tools/`、`tests/`）。
- **删除**：以上全部为历史/产物，确认无用后可整体删除 `archive/`；删除不影响插件运行与测试。
- **运行验证（归档后复测）**：`node --test tests/*.test.mjs` = 109/109 通过；`tools/verify-cockpit.mjs`、`tools/verify-shortcuts.mjs` 真实宿主零控制台错误。
