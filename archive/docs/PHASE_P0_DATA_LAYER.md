# P0：包骨架 + 数据层（已完成，2026-08-15）

## 交付内容

1. **`dsh-hana-research` 静态插件包骨架**
   - `package.json`（`@local/dsh-hana-research` v0.1.0，`exports["./client"]` + `dsh.client.platform: "web"`）
   - `lib/index.js`：宿主半——数据目录解析（`$DSH_HOME/plugin-data/hana-research/`）+ `/api/hana-research/health` 路由 + 插件生命周期清理 store 缓存
   - `lib/client.js`：客户端半——`settings.section`「科研（Hana Research）」健康状态页（P0 最小壳）
2. **`lib/store.js`：数据层完整移植（v0.15.0 → node:sqlite）**
   - schema v4 全部 12 张表 + 原位迁移逻辑 + seed（2 项目 / 35 篇文献）原样保留
   - `better-sqlite3` → `node:sqlite` `DatabaseSync`：
     - `pragma()` ×3 → `exec("PRAGMA ...")`
     - `transaction()` ×7 → `withTransaction()` 兼容层（BEGIN/COMMIT/ROLLBACK，已导出）
     - `close()` 幂等化（node:sqlite 重复关闭抛错，与 better-sqlite3 语义对齐）
   - 其余 `prepare().get/all/run` 与 `exec` 同名同语义，零改动
3. **`tests/store.test.mjs`：12 用例全部通过**

## 验证结果

- `node --check`：store / index / client / tests 全部通过
- 数据层测试 12/12：
  - schema v4 建库（12 表 + WAL 落盘 + meta 版本）
  - seed（2 项目、35 篇文献）
  - 项目/文献 CRUD、收藏（changes 守卫）
  - 笔记创建/更新/标签聚合/删除
  - 摘录（高亮 + 关联笔记单事务）
  - 事务兼容层（提交 / 出错回滚 / 回滚后继续可用）
  - 期刊源（25 内置、upsert 幂等、同步日志、清理保护收藏/项目/附件文献）
  - 主题订阅 CRUD、审计行（`agent.tool.invoke` + 有界参数）
  - 持久化（close → 重开数据仍在）
  - DOI 去重 upsert（保留收藏状态）

## 部署

- 已安装到 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\`
- `cordis.patch.yml` 已追加 `hana-research` 条目（备份 `cordis.patch.yml.bak-hana-research`）
- **待办**：重启 Harness 后验证 `GET /api/hana-research/health` 返回 200 且数据库落盘；确认后进入 P1（文献中心）

## 移植备注（与原版的差异）

- `store.js` 头部新增 `withTransaction` 兼容层并导出（原版为 better-sqlite3 内置）
- `close()` 增加幂等保护（node:sqlite 适配）
- `index.js` 数据目录从 OpenHanako 的 `<HANA_HOME>` 语义改为 DSH 的 `$DSH_HOME/plugin-data/hana-research/`（与 spike 同约定，与 `.hanako-dev` 隔离）
- 其余业务逻辑（含 seed、审计、清理规则）与 v0.15.0 逐行等价
