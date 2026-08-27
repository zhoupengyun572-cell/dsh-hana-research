# v30 里程碑：系统综述两阶段筛选

## 目标

把项目证据页从单纯的文献归类升级为可追溯的系统综述筛选工作台，支持题录/摘要筛选、全文筛选、纳排标准、批量判断和证据矩阵导出。

## 已完成

- 新增题录/摘要与全文两个独立筛选阶段，结论包括待筛选、纳入、待定、排除。
- 排除时强制填写理由；每次筛选保留更新时间并写入审计记录。
- 新增项目级纳入与排除标准，可使用“名称｜说明”维护操作性定义。
- 新增筛选进度看板，展示两个阶段的待筛、纳入、待定、排除及最终纳入数量。
- 新增多选与批量应用，单次支持 1–500 篇，服务端事务保证整批成功或整批回滚。
- 未通过题录/摘要阶段的文献不会开放全文筛选，减少误操作。
- 证据矩阵、Markdown、CSV 和 XLSX 导出均加入两个阶段的判断与理由。
- 修复 XLSX 空理由单元格被预览工具显示为数字的问题，空值现在写为真正的空单元格。
- 数据库架构升级至 v14，插件发布版本升级至 v30。

## 主要文件

- `lib/store.js`
- `lib/api.js`
- `lib/version.js`
- `assets/research.js`
- `assets/research.css`
- `tests/screening.test.mjs`
- `tests/ui-interactions.test.mjs`
- `tests/generate-qa-output.mjs`
- `README.md`

## 验证

- 全量自动化测试：138/138 通过（插件 131 项，Web Markdown 7 项）。
- 覆盖架构迁移、迁移快照幂等性、纳排标准校验、两个筛选阶段、排除理由、批量事务、API 与真实 DOM 交互。
- XLSX 已完成结构检查与渲染检查：证据矩阵为 12 列，筛选判断、理由及空值显示正确。
- 真实 Harness 页面已完成 Playwright 验收：筛选进度、标准弹窗、单篇筛选、全文锁定和批量工具栏均正常。
- 浏览器控制台：0 个错误、0 个警告。
- 筛选接口：`GET /api/hana-research/projects/project-adolescent-emotion/screening` 返回 200，真实项目 4 篇文献均保持待筛状态；验收未改动筛选数据。
- 截图：`output/playwright/v30-screening-workbench.png`、`v30-screening-criteria.png`、`v30-screening-batch.png`。

## 部署与恢复点

- 已同步至运行副本并重启 Harness，当前地址为 `http://127.0.0.1:5207`。
- 健康检查显示：release v30、schema 14、2 个项目、781 篇文献。
- 运行副本升级前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260825-224309`。
- 数据库 v14 迁移快照：`C:\Users\zhou\.dsh\plugin-data\hana-research\research.db.bak-v14-2026-08-25T14-44-29-432Z`。

## 下一步

实现自定义证据列与研究编码模板，让不同研究类型可以定义自己的变量、编码规则、缺失值与导出顺序。
