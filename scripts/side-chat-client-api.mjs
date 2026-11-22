/** 注入 Side Chat 的客户端服务；不依赖 DOM 或宿主 RPC 的实现细节。 */
export function createSideChatActions({ openSide, getState, subscribe, setMenuClaimed }) {
  let claims = 0
  return {
    version: 1,
    subscribe,
    getSnapshot: () => !getState().enabled ? 'disabled' : getState().busy ? 'busy' : 'ready',
    async open({ sessionId, text = '' }) {
      if (typeof sessionId !== 'string' || sessionId.trim() === '' || sessionId.startsWith('sidechat-') || typeof text !== 'string') {
        return { ok: false, error: '侧聊请求缺少有效会话或文本' }
      }
      try { return await openSide(sessionId, text) }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
    },
    claimSelectionMenu() {
      claims++
      if (claims === 1) setMenuClaimed(true)
      let released = false
      return () => {
        if (released) return
        released = true
        claims--
        if (claims === 0) setMenuClaimed(false)
      }
    },
  }
}

export function addSideChatClientApi(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Side Chat 客户端接口补丁不匹配，停止构建：' + before.slice(0, 70))
    source = source.replace(before, () => after)
  }
  replace('async function openSide(parentId, anchorText = \'\') {\n  if (!uiState.enabled || uiState.busy) return',
    'async function openSide(parentId, anchorText = \'\') {\n  if (!uiState.enabled) return { ok: false, error: \'侧聊功能已关闭\' }\n  if (uiState.busy) return { ok: false, error: \'侧聊正在处理，请稍后重试\' }')
  replace('    openBetterSidebarTab(parentId)\n    return\n', '    openBetterSidebarTab(parentId)\n    return { ok: true }\n')
  replace('    openBetterSidebarTab(parentId)\n  } catch (error) {\n    update({ busy: false, error: error instanceof Error ? error.message : String(error), errorParentId: parentId })\n  }\n}',
    '    openBetterSidebarTab(parentId)\n    return { ok: true }\n  } catch (error) {\n    update({ busy: false, error: error instanceof Error ? error.message : String(error), errorParentId: parentId })\n    return { ok: false, error: uiState.error }\n  }\n}')
  replace('const selectionButton = selection === null ? null : h(SelectionActions, {',
    'const selectionButton = state.externalSelectionMenu || selection === null ? null : h(SelectionActions, {')
  replace("    styles.insert(CSS)\n", `    styles.insert(CSS)
    const createActions = ${createSideChatActions.toString()}
    ctx.provide('sideChatActions', createActions({
      openSide,
      getState: () => uiState,
      subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener) },
      setMenuClaimed: externalSelectionMenu => update({ externalSelectionMenu }),
    }))
`)
  return source
}
