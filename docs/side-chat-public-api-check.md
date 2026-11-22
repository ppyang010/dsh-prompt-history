# Side Chat 客户端接口与选文入口

当前方案（2026-11-13）：Prompt History 自己渲染选文菜单中的「打开侧聊」按钮，通过 Cordis 客户端服务调用独立 Side Chat 的打开逻辑。运行时不再扫描选区 DOM、不识别上游浮窗、不代点原按钮。

## 接口契约

Side Chat 维护包 `1.2.2-ph.2` 提供 `sideChatActions` 服务，`version: 1`：

- `open({ sessionId, text? })`：调用原有 `openSide`，完成独立会话创建或恢复、引用缓存、面板展开和 Better Sidebar 导航。返回 `{ ok: true }` 或 `{ ok: false, error }`。文本可省略以只打开；选文菜单传入原生 `readText()` 完整返回值。禁止从 `sidechat-` 子会话再创建嵌套侧聊。
- `getSnapshot()`、`subscribe(listener)`：向按钮同步 ready / busy / disabled 状态。
- `claimSelectionMenu()`：暂停 Side Chat 自带的选文浮窗，返回幂等释放函数。所有持有者释放后恢复浮窗。

Prompt History 仅在原生菜单槽实际注册后，通过可选 `ctx.inject` 连接服务。启动顺序不限，服务卸载后按钮撤回；关闭集成设置、原生菜单或卸载 Prompt History 会释放浮窗归属。未安装维护版 Side Chat 时保留原插件的入口，不尝试 DOM 回退。

按钮防重复点击；打开失败显示错误并保留选区，成功后才清理仍有效的选文和菜单。菜单卸载后迟到的请求结果不会清除后来会话的选区。引用笔记及可选评论仍使用 Prompt History 自己的「引用」按钮。

Side Chat 自身仍沿用上游的引用处理限制（单条最多 8000 字符，最多 8 条，去重），不会自动发送消息。此接口只负责打开并放入侧聊引用。

## 维护边界

上游来源：https://github.com/xlennart/dsh-side-chat ，固定提交 `acb3e67`（1.2.2）。原版仅提供服务端 `sideChat.open`，前端 `openSide` 是内部函数，不能只调用 RPC 就完成界面展开。

本仓库的 `scripts/side-chat-client-api.mjs` 添加上述客户端服务；`scripts/prepare-side-chat.mjs` 组合它与关闭后自动重开的修复，生成独立包。Side Chat 仍独立安装；无需维护第二个 fork，但升级上游仍需复核补丁锚点和契约。未向上游推送、提交 Issue 或 PR。

重建、安装与回退见 `local-maintenance.md`。旧 `sideChatDomCompat` 设置键保留以沿用用户偏好，现在表示启用直接调用接口；不再代表 DOM 兼容模式。

## 验证

`test/side-chat-actions.test.mjs` 使用真实 Cordis 服务生命周期和带 MIT 许可的上游源码夹具，验证：完整会话/选文传递、复用已有侧聊、失败和忙碌反馈、无上游浮窗时独立按钮仍可用、先后加载、热卸载/重载、设置回退、重复点击、菜单卸载后的迟到结果以及接口参数校验。关闭状态修复继续由原回归测试覆盖。

桌面服务之前返回 `Browser access is disabled`。组件与服务集成测试不等同于 desktop 实机点击验收；安装后需刷新当前界面。

## 方案演进记录

最初尝试扩展列表插槽，但未经修改的上游不提供该能力。随后使用 DOM 兼容层接管上游浮窗，发现多段选文的空白投影差异会导致识别失败，虽已补过回归用例，用户仍希望摆脱浮窗识别依赖。

当前按用户要求改为 Prompt History 自有按钮和显式客户端服务。之前的 `1.2.2-ph.1` 包只修复自动重开，原始 `1.2.2` 包与该旧修复包均保留作回退。
