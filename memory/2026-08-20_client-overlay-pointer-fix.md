# 修复：宿主覆盖层点击穿透导致「项目库」按钮无反应 / 鼠标飘逸

日期：2026-08-21

## 症状
从宿主侧边栏/设置点击「项目库」入口后无反应，且鼠标出现飘逸/卡顿感。

## 根因（宿主 slot 契约）
- 宿主 `shell.overlay`（`dsh-client-ui-layout`）的容器 CSS 为
  `z-index:20; pointer-events:none; position:absolute; inset:0` —— **默认 click-through**，
  规范要求条目自己 `pointer-events:auto` 接管指针。
- 插件 `lib/client.js` 的 `ResearchOverlay` 渲染 `position:fixed; inset:0; zIndex:9990`
  的覆盖层 + iframe，但根 div **未设 `pointerEvents`** → 整层（含 iframe）继承宿主
  `pointer-events:none` → **点击全部穿透**：项目库按钮点了没反应；fixed 层与宿主
  overlayLayer（absolute inset:0）叠加产生指针漂移。

## 修复
- `lib/client.js` 的 `ResearchOverlay` 根 div style 增加 `pointerEvents: "auto"`。
- 同步到安装副本 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\lib\client.js`，
  SHA-256 校验一致；`node --check` 语法通过。
- 宿主对 `data-shell-overlay`/`overlayLayer` 无任何额外点击/拖拽 handler，确认无其它冲突源。

## 生效与回滚
- 属宿主侧 client 桥接改动，需**重启 Harness** 生效。
- 备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\2026-08-21-client-overlay-pointerfx\client.js.fixed`
  （回滚 = 用 2026-08-20 备份目录中的原 client.js 覆盖）。

## 备注
- 项目库页面本体（`/ui/hana-research/projects`）与两个项目抽屉此前已确认可正常打开、
  零控制台错误——问题只在宿主覆盖层入口的指针接管。
- 仓库 `lib/client.js` 与安装版此前完全一致（hash 相同），因此修复一处即处处生效。
