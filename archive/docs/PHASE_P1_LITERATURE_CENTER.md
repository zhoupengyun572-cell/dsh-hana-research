# P1：文献中心（已完成，2026-08-15）

## 交付内容

1. **`lib/literature-search.js`：四源检索移植**
   - OpenAlex / Crossref / arXiv / PubMed 适配器、统一文献模型、跨源去重、单源降级、429 重试：逐行等价保留
   - 网络层：`ctx.network.fetch` → 本地 `httpFetch` 兼容层（全局 fetch + `AbortSignal.timeout` 12s + 响应体积上限 + 5 分钟 GET 内存缓存 + 250ms 源节流）
   - `OPENALEX_MAILTO` 修正为 `research@dsh.local`（原版预编码 bug）
2. **`lib/journal-sync.js`：期刊同步移植**
   - 25 内置源、近三期保留、在线优先封顶、超期清理、Crossref 回退、源间 1200ms 节流：逐行等价保留
   - 定时器由 `setTimeout` 链改为 `ctx.timer.timeout`（index.js 挂载，fiber 生命周期自动清理）
3. **`lib/api.js`：业务 API dispatch**
   - `/api/hana-research` prefix 路由 + 轻量路由表（`:param` 匹配、body 读取、业务错误映射）
   - 10 个 API：`health` / `search` / `search/web`（AI 降级占位）/ `search/save` / `papers` / `papers/:id/favorite` / `projects` / `journals` / `journals/sync`
   - 下载白名单 `DOWNLOAD_ALLOWED_HOSTS`：原版 manifest `network.allowedHosts` → 代码常量
4. **`lib/pages.js`：页面壳 + 资产服务**
   - `/ui/hana-research/{literature,projects,project-notes}` 三页面 + `/ui/hana-research/assets/*` 静态服务（nosniff + no-cache）
   - **主题桥**：iframe 内联脚本从父窗口（同源）读取 DSH token（`--dsw-alias-bg-base` / `--dsw-alias-label-primary` / `--dsw-alias-brand-primary` 等 10 项）映射写入本页 `:root`，rgb 变量（green/coral/danger）自动转换
5. **`lib/index.js` 集成**：双 prefix 路由 + 期刊定时器（启动 15s 首次 + 24h）+ disposers 汇总
6. **`lib/client.js` UI**：
   - `sidebar.footer.action`「📚 科研」入口（模块级订阅状态，与 overlay 共享）
   - `shell.overlay` 全屏 iframe 宿主（文献中心/项目库 tab 切换 + Esc 关闭）
   - `settings.section`「科研（Hana Research）」健康状态 + 工作区入口
7. **前端资产**：`assets/research.js` / `research.css` / `research-companion.js` / `research-companion.css` 原样复用，仅改 `apiUrl` 前缀（`/api/plugins/hana-research/api` → `/api/hana-research`，surface session 参数透传移除）

## 验证结果（重启后实测）

- `GET /api/hana-research/health` → 200，papers 35 → 144+（自动期刊同步已写入）
- `GET /api/hana-research/search/web?q=emotion+regulation&perSource=4` → 16 条、4 源、0 失败
- `GET /api/hana-research/journals` → 25 源、0 错误、running 标志正确
- `GET /api/hana-research/papers` → 148 篇（期刊同步 113 + seed 35）
- `GET /ui/hana-research/literature` → 200 HTML 壳（含主题注入脚本）
- 资产服务 research.js / research.css → 200 + 正确 MIME
- 本地真实检索：emotion regulation → 12 条去重、4 源零失败
- 本地真实同步：Emotion 源 → 117 条近三期入库

## 待人工确认（浏览器侧）

- 侧栏「📚 科研」按钮可见，点击打开全屏文献中心
- iframe 页面主题跟随宿主（浅/深色切换）
- 文献中心 UI：检索 → 保存 → 收藏 → 选择项目（P2 完成导入前，保存/收藏可用）
- 设置页「科研（Hana Research）」分区显示健康状态

## 已知限制（按计划顺延）

- AI 解读占位（`AI_NOT_READY`）→ P4 接宿主模型
- 下载并导入 / 官网直连规则（`pdf-import.js` / `official-download.js`）→ P2
- 项目库完整 API（除 projects 列表）→ P2
