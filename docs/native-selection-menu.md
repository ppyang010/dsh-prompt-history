# 原生选文菜单契约与验证

## 核对依据

本次只读核对 `/Applications/DSH NEXT.app/Contents/Resources/app.asar`，使用 Python `struct` 读取 ASAR header 和文件偏移，未修改应用目录。

- 官方 `@deepseek-ai/dsh-message-quotes/lib/client.js`：`QuoteSelectionAction` 使用 `readText / clearSelection / dismiss / inputActions.insertQuote / useSession`；引用成功才清除选区并收起菜单。官方 `quote` interaction 在有效选区、可写会话下执行 `request.open()`。
- 官方 `@deepseek-ai/dsh-client-ui-chat/lib/client.js`：`conversation.chat.text-interaction` 是 `kind: keyed`、`scope: session`；宿主通过 `entryKey: active.id` 渲染菜单。宿主负责局部有效选区、定位和生命周期。
- 官方 `@deepseek-ai/dsh-client-ui-conversation/lib/client.js`：interaction registry 在首个处理器调用 `open()` 后立即返回其 id。多个插件独立注册不同交互不能自动合并按钮。
- ASAR 内没有 ui-conversation 的 `.d.ts` 文件。仓库固定的 rc.2 开发依赖也没有新选文槽类型，因此源码补充最小 SlotMap 声明，不声称通过官方新版完整类型编译。rc.2 的 `SlotCore` 类型及实际运行测试确认 `list` 子槽和同 key 不同 priority 的 shadow 契约。

## 实现与协作边界

Prompt History 为统一菜单宿主，以 `key: quote / priority: -10` 注册原生菜单，保留官方 `quote` 默认条目和 admission。新菜单复制和引用的正文均使用 `readText()` 返回的当前局部文本。引用调用本插件的 `addQuoteEntry`，生成待发笔记，不调用原生 `insertQuote`。开启引用评论时，取消不添加笔记，确认后保存评论和逐条回应设置。为保留代码类型及出处，仅在 document 选区与局部正文完全一致时捕获现有引用元数据；正文及目标会话始终由原生插槽提供。复制权限失败可以重试。没有另建全局悬浮定位或第二个原生引用按钮。

子槽 `conversation.chat.selection-actions` 为 `list / session`，传递 `trigger / readText / clearSelection / dismiss`；子项的 `sessionId / useSession` 来自框架标准上下文，保留给正式协议扩展。当前独立 Side Chat 使用未修改的上游 1.2.2；其入口由 Prompt History 的 DOM 兼容组件接管，不要求 Side Chat 注册子槽，具体边界见 `side-chat-public-api-check.md`。

`nativeSelection` 默认开启。关闭时销毁本插件菜单注册及子槽，恢复官方渲染器，同时允许旧全局工具栏与自动复制；旧工具栏的让位设置识别可见的原生菜单。缺少原生槽的旧宿主可手动关闭该设置。此版本需要官方 message-quotes 为原生菜单提供准入。

偏好存储升级为 v5，仅修改偏好键；保留用户复制模式、引用评论偏好、已有旧侧聊开关。新用户旧侧聊默认关闭。引用笔记与历史展示组件、模板库、输入历史和补全入口保持原实现。关闭旧侧聊只撤回 UI 注册，不删除线程或宿主会话；没有把旧线程自动迁移至 dsh-side-chat。

## 验证范围

本地执行 `npm install --ignore-scripts --no-audit --no-fund` 安装构建依赖，显式运行 `npm run typecheck`、`npm run test:unit` 与 `npm run build`。原开发依赖 React 18 与 react-dom / 类型 19 冲突，已对齐为 18；提交 npm 锁文件供复现。组件测试使用 Node 24 的 `registerHooks` 加载 TS/TSX 源码与 jsdom，不启动 DSH Web 或桌面。

测试覆盖默认值、v4→v5 偏好迁移、待发引用/模板保留、兼容模式恢复、浮层让位、延迟任务取消、真实 SlotCore 的同 key shadow / 子槽回收 / 恢复、局部 readText、笔记创建与会话隔离、代码类型/出处快照、评论取消/提交、复制失败和点击成功路径。

未执行需要启动 DSH 服务的原 E2E。最终由主代理通过 DSH 插件管理器将 desktop 的 Prompt History 与 Side Chat 切换为本地 link，安装结果均为 application: applied；再次查询，两款插件均 enabled: true、fiberPhase: active。曾存在的插件市场临时 Prompt History 入口通过重新加载插件市场清除，最终只保留标准入口。

Side Chat 的完整回归与新增选文行为测试通过；新增测试覆盖成功后清理、打开失败保留选区、失效选区、8000 字符上限、侧聊递归入口限制和异步期间新选区保护。

现有 desktop URL 对外部浏览器返回 Browser access is disabled，未绕过该限制。实际桌面三按钮同菜单、UI 几何、会话切换与点击侧聊仍待用户刷新客户端后确认，不能把合成组件测试写成实机验收。此次没有启动替代 DSH 服务、没有提交或推送代码。原安装包与配置备份位于 ~/.dsh/repair-backups/native-selection-menu-20261113/。
