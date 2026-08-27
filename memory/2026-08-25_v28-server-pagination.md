# v28 文献库服务端分页里程碑（2026-08-25）

## 目标

在 v27 已将 DOM 限制为每批 60 篇的基础上，继续消除 `/papers` 每次传输全部文献的网络与解析开销。

## 实现

- `/papers?paged=1` 新增兼容式分页契约；不带 `paged=1` 时继续返回旧版全量结构。
- 支持 `page`、`pageSize`、`q`、`topic`、`venue`、`readStatus`、`collection`、`methodology`、`customTag`、`favorite`。
- 响应包含 `pagination` 与轻量 `facets`：主题、期刊计数、收藏数量、文献库总量。
- 前端初始只请求 60 篇；“继续显示”请求下一页并追加，索引连续。
- 关键词与各类筛选改为服务端执行，输入使用 180ms 防抖并通过请求 token 防止旧响应覆盖新响应。
- 收藏导出会按页读取全部收藏 ID，不受当前可见页限制。
- 旧宿主或测试桩返回旧响应时自动退回 v27 的客户端分批筛选逻辑。

## 验证

- 主项目：118/118 通过；阅读工作区：7/7 通过，总计 125/125。
- 真实 Harness：`releaseVersion: v28`、schema 13，页面加载 `research.js?v28`。
- 当前真实库 1,310 篇时：
  - 旧全量响应：1,652,019 bytes，约 89ms。
  - 首分页响应：42,990 bytes，约 22ms。
  - 响应体积下降 97.4%。
- 浏览器首屏：60 张卡片、2,375 个 DOM 节点、664 个按钮，无横向溢出。
- `emotion` 服务端筛选返回 258 个实时匹配；首屏 60 篇，加载下一页后 120 篇，请求参数正确进入 `page=2`。

## 部署与回滚

- 已部署到 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research` 并重启 Harness。
- v28 部署前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260825-202459`。
- v27 首轮备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260825-201013`。

## 后续

下一阶段优先开发真实 DOCX/PDF/CSV 导出；之后进入系统综述筛选状态、纳排原因和自定义证据提取列。

