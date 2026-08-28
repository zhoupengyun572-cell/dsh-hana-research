# v40 里程碑：按文献归档的笔记文件

时间：2026-08-28（Asia/Shanghai）

## 目标

重构项目“任务与笔记”中的笔记展示：不再把所有笔记平铺堆叠，而是明确归属来源文献，并将同一文献产生的内容汇总为一份连续文件，同时保留逐条修改和批注能力。

## 已实现

- 项目笔记按 `paperId` 自动归档；历史上未关联文献的内容进入“项目通用笔记”。
- 每篇文献显示为可折叠的笔记文件，文件头展示题名、期刊、年份、笔记数和最近更新时间。
- 文件内部用连续文档组织全部笔记，保留顺序号、页码、标签、跨文献关系、原文摘录和更新时间。
- 每条笔记支持就地“修改 / 批注”，可编辑笔记正文、页码和标签；原文摘录保持只读，避免误改证据。
- 新建笔记时先选择来源文献，保存后自动归入对应文件。
- 保留项目级 Markdown 总汇下载，方便外部查看与归档。
- 文件按最近活动时间排序，文件内按页码和创建时间排序。

## 验证

- `node --check assets/research.js`：通过。
- 全部 Node 测试：154/154 通过。
- Markdown 编辑器测试：7/7 通过。
- 真实 Harness 动态端口 6857：现有 2 条笔记正确汇入同一篇文献文件；展开、逐条编辑和取消操作通过，未改动真实笔记内容。
- 截图：
  - `output/playwright/v40/literature-note-files.png`
  - `output/playwright/v40/note-inline-edit.png`

## 部署与恢复

- 已同步 `assets/research.js|css` 到运行副本，SHA-256 与项目文件一致，静态资源无需重启即可生效。
- 同步前可恢复备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\v40-note-files-20260828-171555\pre-deploy-static-assets.zip`。
- 备份内容已核验，包含同步前的 `assets/research.js` 与 `assets/research.css`。
- 未修改数据库 schema；沿用已有笔记字段与 PATCH API，兼容现有数据。

