# 2026-08-23 桌面壳顶栏命中区修复

## 症状

- Hana Research 全屏覆盖层打开后，点击「项目库」无响应。
- 点击时窗口会被拖动，主观表现为鼠标漂移。

## 根因

- DeepSeek Harness Desktop `0.1.0-rc.13` 在 Windows 页面顶层注入：
  - 左侧窗口拖动区：`x=0–168px, y=6–40px, z-index=2147483645`；
  - 右侧 caption 控件区：末 `138px, y=0–40px, z-index=2147483647`。
- 插件顶栏原按钮坐标为：
  - 文献中心：`x=14–94px, y=8–36px`；
  - 项目库：`x=100–167px, y=8–36px`；
  - 关闭：约 `x=938–1023px, y=8–36px`。
- 三个按钮分别被宿主拖动区或 caption 控件区覆盖。「项目库」点击实际触发窗口拖动，因此同时出现无响应与鼠标漂移。
- 旧的 `pointerEvents: "auto"` 修复只解决 `shell.overlay` 的 click-through 契约，无法越过宿主后来注入的最高层窗口 chrome。

## 修复

- `lib/client.js` 检测 `window.dshDesktop`：
  - 桌面壳顶栏 padding 使用 `8px 152px 8px 182px`，给左右宿主热区各留 14px 安全间隔；
  - 普通浏览器继续使用 `8px 14px`，布局不变。
- 新增 `tests/client-overlay.test.mjs`，真实加载手写客户端模块并验证：
  - 桌面 preload 存在时启用左右避让；
  - 普通浏览器环境保持紧凑间距。

## 验证

- `node --check lib/client.js`：通过。
- 新增回归测试：2/2 通过。
- 根测试：117 项中 115 通过；2 项为真实外部网络测试失败（arXiv TLS reset、文献源无返回），与本次 UI 修改无关。
- 编辑器测试：7/7 通过。
- 合计：122 项通过，2 项外部网络失败。
- 开发源码与运行副本 SHA-256 一致：`D8FB202F9D7A38B3AA7591FFCCECEE6BC1D940F41166694A0E7AA741E668D13D`。
- 运行副本语法检查通过。

## 部署与恢复

- 已同步：`C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\lib\client.js`。
- 同步前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\desktop-overlay-chrome-avoid-20260823-225025\client.js.before`。
- 这是宿主 client 桥接文件，当前已运行的 Harness 仍持有旧模块；必须重启 Harness 后生效。
- 未擅自关闭或重启 Harness。重启后的真实桌面视觉/点击复验仍需补做。
