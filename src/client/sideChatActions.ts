import type { Context } from '@deepseek-ai/cordis'
import { getPrefs, subscribePrefs } from './prefs.ts'

export interface SideChatActions {
  version: 1
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => 'ready' | 'busy' | 'disabled'
  open: (request: { sessionId: string; text?: string }) => Promise<{ ok: boolean; error?: string }>
  claimSelectionMenu: () => () => void
}
let current: SideChatActions | null = null
const listeners = new Set<() => void>()
export const getSideChatActions = (): SideChatActions | null => current
export const subscribeSideChatActions = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const notify = (): void => { for (const listener of listeners) listener() }

/** 由服务注入生命周期管理按钮和浮窗归属，启动顺序不影响接入。 */
export function attachSideChatActions(service: SideChatActions): () => void {
  current = service
  let releaseMenu: (() => void) | undefined
  const sync = (): void => {
    const prefs = getPrefs()
    if (prefs.nativeSelection && prefs.sideChatDomCompat) releaseMenu ??= service.claimSelectionMenu()
    else { releaseMenu?.(); releaseMenu = undefined }
  }
  sync()
  const unsubscribe = subscribePrefs(sync)
  notify()
  return () => {
    unsubscribe()
    releaseMenu?.()
    if (current === service) { current = null; notify() }
  }
}

export function bindSideChatActions(ctx: Context): () => Promise<void> {
  const binding = ctx.inject(['sideChatActions'], injected => {
    const service = injected.get('sideChatActions') as SideChatActions | undefined
    if (service?.version !== 1 || typeof service.open !== 'function' || typeof service.subscribe !== 'function'
      || typeof service.getSnapshot !== 'function' || typeof service.claimSelectionMenu !== 'function') return
    injected.effect(() => attachSideChatActions(service), 'dsh-prompt-history: side chat actions')
  })
  return () => binding.dispose()
}
