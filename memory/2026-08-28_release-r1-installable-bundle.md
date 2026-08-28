# 社区发布 R1：标准 Harness Bundle

时间：2026-08-28（Asia/Shanghai）

## 目标

把仅能手工复制并修改 Profile 的本机插件改造成 DeepSeek Harness 标准可安装 bundle。

## 已完成

- 正式包名改为 `dsh-hana-research`，npm Registry 当前未发现同名公开包。
- 移除根包 `private: true`，增加 `dsh.bundle.patch = ./cordis.patch.yml`。
- 新增 `cordis.patch.yml`，以稳定 id `hana-research` 插入宿主与客户端插件。
- 客户端模块 id 与正式包名统一，避免安装后模块加载器找不到客户端半包。
- README 改为 `dsh plugin --profile web add/update/remove` 标准安装、更新和卸载流程。
- 发布元数据测试新增 bundle manifest、patch 内容和客户端模块 id 校验。

## 隔离安装验证

- 生成 `dsh-hana-research-0.4.0-beta.1.tgz` 候选包。
- 使用独立 `DSH_HOME` 和全新 `web` Profile 安装候选包。
- `--dump-config` 正确显示 `# == dsh-hana-research` 与 `name: dsh-hana-research`。
- 隔离 Harness 成功启动在动态端口 9842；健康接口返回 release `0.4.0-beta.1`、schema 19，文献中心页面返回 HTTP 200。
- 更新后 bundle 仍激活；卸载后配置层消失；重新安装后恢复。
- 全部 Node 测试：157/157 通过；Markdown 编辑器测试：7/7 通过。

## 发现但留待后续阶段处理

- 候选包仍为约 66 MB，包含 archive、memory、tests、tools、web 源码和临时 work 文件；在 R3 用发布白名单解决。
- 干净安装显示 6 个弃用的间接依赖，并包含已知 `uuid` 风险；在 R4/R5 处理。
- 首次启动仍自动生成 2 个作者项目和 35 篇种子文献，健康接口仍返回绝对数据库路径；在 R2 处理。
- 带空格的本地源码目录直接传给当前 `dsh plugin add` 会被拆分；候选 `.tgz` 安装不受影响，公开 npm/GitHub specifier 也不依赖本地空格路径。

