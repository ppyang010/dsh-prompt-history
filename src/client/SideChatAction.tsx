import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getSideChatActions, subscribeSideChatActions } from './sideChatActions.ts'
import { getPrefs, subscribePrefs } from './prefs.ts'

const emptySubscribe = (): (() => void) => () => {}
const unavailable = (): 'disabled' => 'disabled'

type BetaBridge = (text: string) => boolean

function sidenoteBridge(): ((sessionId: string) => boolean) | undefined {
  const bridge = (window as Window & { __dshSidenoteQuoteSelection?: unknown }).__dshSidenoteQuoteSelection
  return typeof bridge === 'function' ? bridge as (sessionId: string) => boolean : undefined
}

function betaBridge(): BetaBridge | undefined {
  const bridge = (window as Window & { __dshBetterSidebarOpenSideChat?: unknown }).__dshBetterSidebarOpenSideChat
  return typeof bridge === 'function' ? bridge as BetaBridge : undefined
}

/** 优先使用 Sidenote 的待发引用，其次使用 beta 草稿或旧侧聊。 */
export function SideChatAction({ sessionId, readText, clearSelection, dismiss, quoteSelection }: {
  sessionId: string; readText: () => string | null; clearSelection: () => void; dismiss: () => void
  quoteSelection?: () => boolean
}): JSX.Element | null {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs)
  const service = useSyncExternalStore(subscribeSideChatActions, getSideChatActions)
  const state = useSyncExternalStore(service?.subscribe ?? emptySubscribe, service?.getSnapshot ?? unavailable)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const [error, setError] = useState('')
  const hasBridge = quoteSelection !== undefined || sidenoteBridge() !== undefined || betaBridge() !== undefined
  if ((quoteSelection === undefined && (!prefs.nativeSelection || !prefs.sideChatDomCompat)) || !sessionId || sessionId.startsWith('sidechat-')
    || (!hasBridge && (service === null || state === 'disabled'))) return null
  return <>
    <button type="button" className="dsh-ph-native-action" disabled={pending || (!hasBridge && state === 'busy')}
      onPointerDown={event => event.preventDefault()}
      onClick={() => {
        if (inFlight.current) return
        const text = readText()
        if (text === null || text.trim() === '') return
        const quoteInSidenote = quoteSelection ?? sidenoteBridge()
        if (quoteInSidenote !== undefined) {
          setError('')
          try {
            if (!quoteInSidenote(sessionId)) { setError('Sidenote 无法引用当前选区，请重新选中文字后重试'); return }
            if (live.current && readText() === text) { clearSelection(); dismiss() }
          } catch {
            setError('无法引用到 Sidenote，请重试')
          }
          return
        }
        const openBeta = betaBridge()
        if (openBeta !== undefined) {
          setError('')
          try {
            if (!openBeta(text)) { setError('无法打开侧边对话(beta)，请确认右侧栏已启用该工具'); return }
            if (live.current && readText() === text) { clearSelection(); dismiss() }
          } catch {
            setError('侧聊打开失败，请重试')
          }
          return
        }
        if (service === null) { setError('侧聊暂不可用，请重试'); return }
        inFlight.current = true
        setPending(true); setError('')
        void service.open({ sessionId, text }).then(result => {
          if (!result.ok) { setError(result.error || '侧聊打开失败，请重试'); return }
          // 打开期间切换插件、会话或选区后，不清除后来的选择。
          if (live.current && getSideChatActions() === service && readText() === text) { clearSelection(); dismiss() }
        }).catch(reason => {
          setError(reason instanceof Error ? reason.message : String(reason))
        }).finally(() => { inFlight.current = false; setPending(false) })
      }}>{pending ? '正在引用…' : '引用到侧聊'}</button>
    {error && <span role="status">{error}</span>}
  </>
}
