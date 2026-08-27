# v35 里程碑：风险偏倚、双人裁决与 GRADE

时间：2026-08-27（Asia/Shanghai）

## 目标

- 为系统综述链路补齐结局级风险偏倚评定。
- 保留双人独立原始判断、冲突与逐领域裁决链。
- 按结局建立 GRADE 证据确定性评定，区分计算建议与研究者确认。

## 已实现

- 数据库升级到 schema 19；新增质量设置、RoB A/B 判断、裁决、GRADE 结局和领域判断表。
- 内置 RoB 2（2019）、ROBINS-I（2016）、ROBINS-I V2（2025 草案）与心理学通用质量框架。
- 工具模板版本进入评定与裁决主键；切换工具时旧数据保留但不会串用。
- RoB 按文献的具体结局记录领域判断、支持依据、总体汇总、完成度和冲突数。
- 双人模式分别保存 A/B 原始记录；双方判断不一致时逐领域填写裁决依据。
- GRADE 按结局记录重要性、研究设计、研究/参与者数量、效应估计、五个降级领域和三个升级领域。
- 系统计算建议确定性；研究者确认等级单独保存，不覆盖计算过程。
- 新增风险偏倚 CSV、GRADE 证据概况 CSV、完整审计 JSON 导出。
- 证据页新增质量评定入口、交通灯矩阵、GRADE 总览、桌面和窄屏编辑器。

## 方法学边界

- RoB 2 使用官方当前 2019 随机平行试验结构。
- ROBINS-I V2 在界面和导出中明确标为 2025 草案，避免把草案当成定稿。
- 心理学通用框架明确标为项目内框架，不冒充官方 RoB 工具。
- 未复制官方工具的完整提示问题原文；保存领域判断和研究者自写依据。
- GRADE 依据按关键/重要结局记录；软件只给计算建议，最终确定性由研究者确认。

## 验证

- 语法检查：`lib/store.js`、`lib/api.js`、`lib/quality-export.js`、`assets/research.js` 通过。
- 核心测试：153/153 通过，其中新增质量评定测试 5 项。
- 编辑器测试：11/11 通过。
- 真实 Harness：v35、schema 19、2 个项目、772 篇文献；质量 API 正常。
- 项目库卡片点击可正常进入项目详情，未复现无响应或鼠标漂移。
- 430px 窄屏：视口/页面滚动宽度均为 420px，无横向溢出。
- 浏览器控制台：0 error、0 warning。
- 验收未提交表单：两个真实项目均为 0 条 RoB 评定、0 个 GRADE 结局。

## 截图

- `output/playwright/v35-quality-desktop.png`
- `output/playwright/v35-rob-editor-desktop.png`
- `output/playwright/v35-grade-editor-desktop.png`
- `output/playwright/v35-grade-editor-mobile.png`

## 部署与恢复

- 运行副本已同步并重启 Harness，当前端口 13015（动态端口，不应硬编码）。
- schema 19 自动生成迁移前数据库备份：`C:\Users\zhou\.dsh\plugin-data\hana-research\research.db.bak-v19-2026-08-27T08-54-53-242Z`。
- 当前 v35 运行副本快照：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260827-quality-v35-deployed`。
- 本轮原计划的“部署前运行目录”复制因 PowerShell `-LiteralPath` 不展开通配符而未生成；空目录已安全清理。数据层仍可由上述 v19 迁移前备份完整恢复，旧版运行代码可从此前里程碑备份恢复后逐版更新。

## 下一步候选

- 支持一篇研究的多个结局/时间点评定，而不只使用默认 `primary` 入口。
- 增加 RoB 交通灯图 SVG/PNG 导出和 Summary of Findings 表格排版导出。
- 将风险偏倚结果与 GRADE 的“偏倚风险”领域建立可解释联动建议。
- 增加评定者一致性统计、完成队列和批量导航。
