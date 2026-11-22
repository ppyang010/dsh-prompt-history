import { useEffect, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { getPrefs, subscribePrefs } from './prefs.ts'
import { NS } from './locales.ts'
import { T } from './i18n.ts'
import { prepareNativeQuoteNote } from './nativeQuoteNote.ts'
import { SideChatAction } from './SideChatAction.tsx'
import { bindSideChatActions } from './sideChatActions.ts'

/** 从官方 ui-chat 与 message-quotes 的发布实现核对的局部选区契约。 */
export interface TextInteractionProps {
  trigger: string
  readText: () => string | null
  clearSelection: () => void
  dismiss: () => void
}

// 当前开发依赖 rc.2 早于该宿主插槽；只补充已核对的两个槽声明。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.chat.text-interaction': { kind: 'keyed'; scope: 'session'; owner: TextInteractionProps }
    'conversation.chat.selection-actions': { kind: 'list'; scope: 'session'; owner: TextInteractionProps }
  }
}

interface WritableSession {
  removed: boolean
  phase?: string
  subagent: null | { address: { mode: string }; parentAvailable: boolean }
}

/** 保留官方会话可写性检查，并沿用本插件发送准入期间暂停引用的规则。 */
export function canQuote(session: WritableSession): boolean {
  return !session.removed && session.phase !== 'adjudicating' && session.phase !== 'submitting' && (session.subagent === null
    || (session.subagent.address.mode === 'continuable' && session.subagent.parentAvailable === true))
}

/** 由宿主定位与撤回菜单；本组件不访问 document 全局选区。 */
export function NativeSelectionMenu(props: PropsRuntime<'conversation.chat.text-interaction'> & PropsRenderSlots<'conversation.chat.selection-actions'>): JSX.Element | null {
  const { readText, dismiss, clearSelection, useSession, sessionId, renderSlot } = props
  const enabled = useSession((session: unknown) => canQuote(session as WritableSession))
  useEffect(() => { if (!enabled) dismiss() }, [enabled, dismiss])
  if (!enabled) return null
  return <SelectionActions sessionId={sessionId} readText={readText} clearSelection={clearSelection} dismiss={dismiss}>
    {renderSlot('conversation.chat.selection-actions', { trigger: props.trigger, readText, dismiss, clearSelection })}
  </SelectionActions>
}

export function SelectionActions({ sessionId, readText, clearSelection, dismiss, children, quoteSelection }: Pick<TextInteractionProps, 'readText' | 'clearSelection' | 'dismiss'> & { sessionId: string; children?: ReactNode; quoteSelection?: () => boolean }): JSX.Element {
  const [copyFailed, setCopyFailed] = useState(false)
  const [copying, setCopying] = useState(false)
  const keepSelection = (event: React.PointerEvent): void => { event.preventDefault() }
  return <div className="dsh-ph-native-menu" role="group" aria-label={T('selection.native')}>
    <button type="button" className="dsh-ph-native-action" disabled={copying}
      onPointerDown={keepSelection}
      onClick={() => {
        const text = readText()
        if (text === null) { dismiss(); return }
        setCopyFailed(false)
        setCopying(true)
        // 复制有效选区快照；拒绝权限时保留菜单与选区，允许重试。
        void Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => {
          // 复制期间新选区不能被旧异步任务清除。
          if (readText() === text) { clearSelection(); dismiss() }
        }, () => { setCopyFailed(true) }).finally(() => { setCopying(false) })
      }}>{T('toolbar.copy')}</button>
    <button type="button" className="dsh-ph-native-action" onPointerDown={keepSelection}
      onClick={() => {
        const text = readText()
        if (text === null) { dismiss(); return }
        if (typeof sessionId !== 'string' || text.trim() === '') return
        const addNote = prepareNativeQuoteNote(sessionId, text)
        clearSelection()
        dismiss()
        void addNote()
      }}>{T('toolbar.quote')}</button>
    <SideChatAction sessionId={sessionId} readText={readText} clearSelection={clearSelection} dismiss={dismiss} {...(quoteSelection ? { quoteSelection } : {})} />
    {children}
    {copyFailed && <span role="status">{T('selection.copyFailed')}</span>}
  </div>
}

/** 同 key 的低数值优先级替代渲染；保留官方 admission 与原 renderer 作为回退。 */
export function bindNativeSelectionMenu(ctx: Context): void {
  let dispose: (() => void) | undefined
  const sync = (): void => {
    if (!getPrefs().nativeSelection) { dispose?.(); dispose = undefined; return }
    if (dispose !== undefined) return
    dispose = ctx.slots.inject('conversation.chat.text-interaction', () => {
      const releaseSlot = ctx.slots.register({
        name: 'conversation.chat.text-interaction', key: 'quote', priority: -10, locale: NS, registrant: 'dsh-prompt-history',
        children: { 'conversation.chat.selection-actions': { kind: 'list', scope: 'session' } },
      }, NativeSelectionMenu)
      // 只有宿主确实提供原生菜单槽时才接管入口；旧宿主保留 Side Chat 浮窗。
      const releaseService = bindSideChatActions(ctx)
      return () => { void releaseService(); releaseSlot() }
    })
  }
  sync()
  ctx.effect(() => {
    const bridgeWindow = window as Window & { __dshPromptHistorySelectionMenu?: typeof render }
    function render(props: Parameters<typeof SelectionActions>[0]): JSX.Element {
      return <div data-ph-sidenote-menu=""><SelectionActions {...props} /></div>
    }
    bridgeWindow.__dshPromptHistorySelectionMenu = render
    return () => { if (bridgeWindow.__dshPromptHistorySelectionMenu === render) delete bridgeWindow.__dshPromptHistorySelectionMenu }
  }, 'dsh-prompt-history: sidenote selection menu')
  ctx.effect(() => subscribePrefs(sync), 'dsh-prompt-history: native selection preference')
  ctx.effect(() => () => {
    dispose?.(); dispose = undefined
  }, 'dsh-prompt-history: native selection cleanup')
}
