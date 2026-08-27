# dsh-tools 兼容性审查与修复记录（2026-08-16）

针对「重启后客户端无法启动」报告，对 `dsh-hana-research` 与当前最新版 DeepSeek Harness / `@deepseek-ai/dsh-tools`（**0.1.0-rc.9**，profile 与 harness checkout 同版本）做了全面兼容性审查。

## 审查结论（逐项对照）

| 检查项 | 状态 | 说明 |
|---|---|---|
| 1. 工具模块导入路径 | ✅ | `lib/register-tools.js` 从 `../tools/*.js` 导入（16 个模块），工作区与 profile 部署 MD5 一致；lib/tools 不存在但无影响 |
| 2. `output.schema` + `output.render` | ✅（本次增强） | 每个 `defineTool` 声明 `output: { schema: {type:'object', additionalProperties:true, properties:{text:{type:'string',required:true}}}, render: ... }`；render 改为**防御性**（`value?.text ?? JSON.stringify(value)`），text 缺失时不再抛错 |
| 3. JSON Schema 递归转换 | ✅ | `lib/tool-utils.js#toDshSchema` 递归处理：嵌套 object → properties（扁平）+ `additionalProperties`（显式布尔，默认 true）+ 嵌套 `required`（属性级 `required: true`）；数组 → `items` 递归；`enum` 透传。16 个工具中最深嵌套为 `save_search_result.record`（11 字段对象） |
| 4. 16 个工具参数/输出/审批/注册/卸载 | ✅ | compat 测试逐项验证：16 注册、output 编译、validateArgs、只读无审批、写工具批准/拒绝/无 agent/approval 抛错四路 |
| 5. 完整启动测试（真实 rc.9） | ✅ | `tests/compat.test.mjs` 在 **profile 环境**运行（可解析真实 `@deepseek-ai/dsh-tools`）：9/9 通过；Playwright 客户端主界面无错误、侧栏入口渲染、3 个卡片 key 注册生效 |
| 6. 审批接口 | ✅（本次增强） | `approval.request` 包 try/catch：无 open turn 等拒绝场景降级为友好文本，不再向上抛出 |

## 验证汇总（46/46 测试通过）

- store 12/12 · pdf-import 6/6 · tools 8/8 · ai 11/11（工作区，Node v24）
- **compat 9/9（profile 环境，真实 dsh-tools rc.9）**：
  - `defineTool` 编译 16 个工具 + output 契约
  - 嵌套 schema 编译（record.additionalProperties=true、required=['title']）
  - `validateArgs` 拒绝缺失必填参数
  - 只读工具（list_research_projects）无审批执行成功
  - 写工具（subscribe_topic）：allowed-once 执行并落库（approval 调用 1 次、toolName/agent 正确）；rejected 返回取消且不落库；无 agent 上下文友好消息；approval 抛错降级
  - 卸载函数移除全部 16 个注册
- Playwright（真实 GUI 2048 端口）：客户端主界面渲染无 pageerror/console error；侧栏「科研」入口；`tool.call.toolview` 三个卡片 key 已占用；卡片页面（journal-updates / search-results 12 条 / project-overview 2 项）与文献中心（1410 篇）全部渲染零错误

## 「客户端无法启动」排查结论

当前实例（2048 端口）**未复现**该问题：插件宿主 health 200、16 工具注册、客户端渲染、卡片注册全部正常。推测原因为部署/重启时序问题或浏览器旧 bundle 缓存（客户端 bundle 带 rev 参数且 `no-cache`，刷新即更新）。若再出现，请提供浏览器控制台错误与 `plugins` 状态页的 entry 状态。

## 仍存在的风险

1. **`output.schema` 要求返回对象含 `text`**：当前 16 个工具的所有返回路径（正常/拒绝/降级）都保证 `text` 存在；未来新增工具若返回非 `{text}` 结构需同步更新 schema 或走 `additionalProperties` 宽松根（schema 已含 `additionalProperties: true`，但 `text` 仍必填——新工具需自带 `text` 或改用宽松 schema）。
2. **`approval.request` 依赖 open turn**：无 open turn（如非会话上下文调用）时 request 会拒绝——已降级为友好文本，但**写工具在 idle/无会话场景不可用**（符合 DSH 设计）。
3. **approval policy=never 时写工具自动拒绝**：DSH 全局策略决定，插件不绕过（安全默认）。用户需在会话中把策略设为 ask 才能使用写工具。
4. **宿主未配置模型时**：`/search/web` 的 AI 解读与翻译任务返回降级错误（`AI_SEARCH_NO_MODEL` / `TRANSLATE_NO_MODEL`），纯检索与阅读功能不受影响。
5. **静态插件加载时序**：register-tools.js 等宿主模块变更需重启生效；客户端 bundle 刷新即更新（`no-cache`）。
6. **卡片 iframe 高度固定 360px**：对话卡片为固定高度（原版协议 resize-request 在 DSH 无宿主支持），内容超长时卡片内滚动。
