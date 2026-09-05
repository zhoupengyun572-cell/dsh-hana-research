# v52 性能清账（P0-4：N+1、写放大、契约盘点与两项评估结论）

时间：2026-09-05（Asia/Shanghai）

对应 `docs/OPTIMIZATION_PLAN.md` P0-4 与 v48 遗留清单。**0.5.0 的四个 P0 到此全部完成**。

## 已实现

### renameNoteTag N+1 修复（lib/store.js）

- 三张表（notes/sentence_notes/paper_note_documents）的标签重命名查询加 JSON 片段 LIKE 预过滤（`tags_json LIKE '%"tag"%'`），把全表扫描缩到候选行；JS 端 `tags.includes(from)` 保留为精确判定。
- 预过滤的漏筛边界：标签含 `"` `\` `%` `_` 时无法安全构造 JSON 片段模式 → 自动退回全表（罕见路径，正确性优先）。
- 关联批注从逐条 SELECT 改为按 annotation_id 批量 IN 加载（Map 查找），消除 N+1。

### syncProjectNotesFile 写放大修复（lib/store.js）

- 原行为：每条笔记变更（7 个调用点）立即整文件重渲染 + 重写 project-notes.md；批量操作 = N 次全量写。
- 现行为：`#scheduleProjectNotesSync` 300ms 时间窗合并（Set 去重 + 单 timer + unref），同一窗口内多次变更只落盘一次；close() 清理 timer；实例已关闭时跳过。
- **读取路径不变**：`getProjectNotesFile` 仍强制同步，外部消费不会读到过期内容（测试覆盖：连续 5 条变更后立即读即包含全部，450ms 后文件为最终状态）。

## 盘点结论（无需/暂缓改动）

1. **/papers 旧契约**：SPA 已全部走 `paged=1`（`paperPagePath` 默认带 paged、收藏夹同理）；无 paged 的全量返回是给旧客户端/Agent 生态的兼容层（路由内有注释声明）。**无需改动**；0.6 可考虑给旧契约加 deprecated 标记。
2. **withError 样板收敛（133 处）**：评估后**推迟到 0.6 周期**——纯代码组织重构、零行为收益、133 个触点的回归风险与 0.5.0 发布前稳定性要求不成比例（参照 v48 弹层工厂「价值密度低不再做」的先例）。若做，方案是 route() 助手统一自动包装 withError + 机械去除内层。
3. **reader-workbench.js 2.89MB**：评估结论——构建已 `minify: !watch` + esbuild 默认 tree-shaking，剩余体积为 @embedpdf/react-pdf-viewer + tiptap 的功能性代码，**无低垂果实**。可选的 0.6 项：tiptap 编辑器懒加载（代码分割）。

## 验证

- `tests/notes-update.test.mjs` 新增延迟合并写行为测试（6/6）：强制同步立即一致 + 时间窗后文件最终一致。
- 全量 `node --test`：**208/208**（renameNoteTag 既有测试覆盖 LIKE 预过滤路径的行为等价）。

## 0.5.0 状态

P0-1 全文检索 ✅、P0-2 引用核验 ✅（剩 React 徽标 + Agent 工具尾巴）、P0-3 AI 预筛 ✅、P0-4 性能清账 ✅。下一步是发版准备：版本口径统一（0.5.0-beta.1）、CHANGELOG、打包白名单核对（新增 lib/ai-screening.js、lib/fulltext-index.js、lib/citation-verify.js 由 `lib` 目录规则覆盖；tools/get-ai-screening.js 已在白名单）、发布前 R0–R8 流程对照。
