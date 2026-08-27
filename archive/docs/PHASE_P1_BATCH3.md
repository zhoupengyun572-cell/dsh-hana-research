# P1 增强批次 3：文献集合 + 收藏批量导出（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P1 第三批次。

## 交付内容

### 文献集合（L4，schema v6）
- 新表：`collections`（id/title/description/时间戳）+ `collection_papers`（多对多，FK 级联删除）
- store：`listCollections`（含 paperCount）、`createCollection`（校验+审计）、`deleteCollection`（审计）、`addPaperToCollection`（幂等+审计）、`removePaperFromCollection`（审计）、`paperCollectionMap`（全量关系映射）
- API：`GET/POST /collections`、`DELETE /collections/:id`、`POST /collections/:id/papers`、`DELETE /collections/:id/papers/:paperId`；`GET /papers` 合并 `collectionIds`
- 前端：
  - 文献卡「收藏集」按钮 → modal：现有集合多选（勾选即时保存）+ 新建集合（创建后自动加入该文献）
  - 工具栏「全部收藏集」下拉筛选（计数显示在选项里），筛选计数提示含集合名
  - 前端对 `/collections` 请求做了**容错**（旧宿主降级为空集合，页面不挂）

### 收藏批量导出（L8 扩展）
- 工具栏「导出收藏」按钮：导出全部收藏为 BibTeX（确认）或 RIS（取消），沿用 `/papers/export` 链路

## 验证

- 测试 **61/61**（工作区 52：store 12 + pdf-import 6 + tools 8 + ai 11 + enhancements 14；profile compat 9）
- enhancements 新增 collections 用例：创建/幂等加入/映射/移除/删除/审计/参数校验
- 集合实测：两集各加入同一文献 → map 正确；移除/删除级联正确
- Playwright smoke：1409 卡片收藏集按钮、集合下拉、导出按钮、modal 与新建表单、零 JS 错误（旧宿主下容错路径同样通过）

## 待重启生效与回归

宿主侧（collections 表 + 5 个 API + /papers 合并 collectionIds）需重启；前端已容错部署。

重启后人工回归：
1. 文献卡「收藏集」→ 勾选/取消集合（即时保存）→ 卡片按钮显示集合数
2. 新建集合 → 文献自动加入
3. 工具栏下拉按集合筛选
4. 收藏几篇文献 → 「导出收藏」→ 下载 BibTeX/RIS

## 已知限制

- 集合无排序/重命名（title 不可改，可删除重建）
- 导出收藏为全量收藏（无按集合导出）；集合导出可后续加
