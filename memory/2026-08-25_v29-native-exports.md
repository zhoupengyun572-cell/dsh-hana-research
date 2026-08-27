# v29 原生导出里程碑（2026-08-25）

## 目标

替换“HTML 伪装 Word”和“浏览器打印 PDF”，让项目笔记与证据矩阵直接生成可归档、可编辑的原生文件。

## 已完成

- 新增 `lib/exporters.js`：
  - 项目笔记原生 DOCX（标题层级、来源、页码、标签、引文、页脚）
  - 项目笔记原生 PDF（内嵌 Noto Sans Hans，可搜索中文、自动分页、页码）
  - 证据矩阵 UTF-8 BOM CSV
  - 证据矩阵原生 XLSX（冻结标题、自动筛选、语义列宽、交替底色、补充工作表）
- 新增 `GET /projects/:projectId/export?format=docx|pdf|csv|xlsx`，返回正确 MIME、下载文件名和长度。
- 前端导出弹窗改为 Markdown / 原生 DOCX / 原生 PDF；证据矩阵新增 Excel 下载，CSV 改由服务端生成。
- 移除已废弃的 Markdown→HTML Word 兼容转换代码。
- 新增运行依赖：`docx 9.7.1`、`exceljs 4.4.0`、`pdfkit 0.20.1`；许可证清单已更新。
- 发布版本：`v29` / npm `0.2.9`，schema 仍为 13。

## 验证

- 新增导出测试 6 项；全部根测试 124/124、阅读编辑器测试 7/7，总计 131/131。
- DOCX 经 Microsoft Word 转 PDF 后逐页渲染检查：中文/英文、换行、标题、页脚无截断或乱码。
- PDF 经 Poppler 渲染检查；发现并修复“绘制页脚新增空白页”问题，修复后仅 1 页且页脚正常。
- XLSX 经 `@oai/artifact-tool` 导入、结构检查和 PNG 渲染：2 个工作表、表头/列宽/换行正常。
- 真实 Harness：`v29 / schema 13`，动态端口 8834；真实项目四种格式接口均为 200，DOCX/XLSX=`PK`，PDF=`%PDF-`。
- 浏览器真实流程：项目库 → 项目 → 证据 → 论证链 → 证据矩阵/导出笔记；Excel 与 DOCX 均成功下载，控制台 0 error / 0 warning。
- 截图：`output/playwright/v29-export-modal.png`。

## 部署与回滚

- 运行副本：`C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research`
- 可恢复备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260825-205927`
- Harness 已重启，当前主服务端口：8834。

## 下一阶段

系统综述工作流：纳入/排除标准、题录/全文筛选状态、排除理由、筛选统计与批量操作。
