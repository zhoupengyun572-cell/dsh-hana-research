# v26 里程碑：期刊源管理器

## 目标

把原先只能手填名称与 ISSN 的“添加期刊”升级为可核对、可维护的期刊源管理流程，同时保持文献中心低密度、宿主一致的交互风格。

## 已完成

- 新增 ISSN 格式化与校验位验证，拒绝无效刊号和重复来源。
- 新增 OpenAlex 期刊识别：订阅前返回期刊名称、主/备 ISSN、收录量、主页和最近 3 篇文章预览。
- 新增单刊同步、期刊启用/暂停、自定义源编辑和移除接口。
- 内置期刊只允许启停，不能改题录或删除；移除自定义订阅时保留已入库文献。
- 文献中心入口由“＋ 添加期刊”改为“管理期刊”。
- 新管理器采用“查找并订阅”优先、已订阅来源次级的单弹层结构；来源列表支持名称/主题/ISSN 搜索及状态筛选。
- 识别、订阅、同步、编辑、启停、移除均有 busy、防重复、成功或错误反馈；订阅成功但首次同步失败时不会误报整个订阅失败。
- 静态资源版本提升至 v26。

## 主要文件

- `lib/store.js`
- `lib/journal-sync.js`
- `lib/api.js`
- `lib/pages.js`
- `assets/research.js`
- `assets/research.css`
- `tests/enhancements.test.mjs`
- `tests/notes-update.test.mjs`
- `tests/ui-interactions.test.mjs`

## 验证

- JavaScript 语法检查：通过。
- `node --test tests/*.test.mjs`：115/115 通过。
- Happy DOM 交互测试：覆盖识别、订阅并同步、暂停/启用。
- API 路由直测：覆盖新增、编辑、暂停、禁用源拒绝同步、移除并保留文献。
- Playwright 无头真实浏览器：桌面与 390×844 窄屏均通过，无横向溢出；识别结果与订阅列表布局正常。
- 截图：`output/playwright/journal-manager-v26.png`、`journal-manager-resolved-v26.png`、`journal-manager-mobile-v26.png`。

## 部署状态

- 已备份当前运行副本到：`C:\Users\zhou\.codex\backups\dsh-hana-research\2026-08-22-v25-before-journal-manager-v26`。
- 尚未覆盖运行副本，也未重启 Harness；原因是后端新路由必须与前端同时生效，不能只热替换静态文件。
- 下一步：用户允许重启后，同步六个运行文件并重启/复核真实 Harness 页面。
