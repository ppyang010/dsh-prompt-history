/**
 * The composer's prompt history: the append-only list built from the session's
 * own user messages, a per-session localStorage list (so ↑/↓ survives a
 * reload when the chat window only shows the latest turns), the cross-session
 * ring when that setting is on, and the per-session resets.
 *
 * The refs themselves stay with the composer (the key handlers and the
 * completion ghost read them at event time); this hook owns the effects that
 * fill and reset them.
 *
 * @module dsh-prompt-history/client/useHistory
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { PromptMessage } from './nodes.ts'
import type { BrowseState, SearchState } from './browse.ts'
import { RESET_BROWSE } from './browse.ts'
import {
  foldHistory,
  loadRing,
  loadSessionHistory,
  saveRing,
  saveSessionHistory,
  type SessionHistoryEntry,
} from './historyRing.ts'
import { hideSearchOverlay } from './feedback.ts'
import { getPrefs, subscribePrefs } from './prefs.ts'

/** What the composer hands the hook. */
export interface HistoryInput {
  /** Durable session identity: switching it resets the transient state. */
  readonly sessionId: string | undefined
  /** User messages to fold in (the session's own log). */
  readonly messages: readonly PromptMessage[]
  /** The history list (oldest → newest); the composer owns the ref. */
  readonly historyRef: { current: string[] }
  /** User-node seqs already folded (append-once dedup). */
  readonly seenRef: { current: Set<number> }
  /** Browse position, reset on a session switch. */
  readonly browseRef: { current: BrowseState }
  /** Reverse-search session, cleared on a session switch. */
  readonly searchRef: { current: SearchState | null }
}

/**
 * Keep the history list fed and session-scoped.
 * @param input - session identity, the message batch, and the owned refs.
 */
export function useHistory(input: HistoryInput): void {
  const { sessionId, messages, historyRef, seenRef, browseRef, searchRef } = input
  const id = sessionId ?? ''
  const entriesRef = useRef<SessionHistoryEntry[]>([])
  const sessionCap = useSyncExternalStore(subscribePrefs, () => getPrefs().sessionHistoryCap)

  // Seed the ring once on mount when the option is on.
  useEffect(() => {
    if (getPrefs().globalHistory && historyRef.current.length === 0) {
      historyRef.current = loadRing()
    }
  }, [historyRef])

  // Session switch: with global history the ring persists (only the transient
  // browse/search state resets); otherwise restore this session's stored
  // prompts so a short chat window does not wipe ↑/↓.
  useEffect(() => {
    seenRef.current = new Set()
    browseRef.current = RESET_BROWSE
    searchRef.current = null
    hideSearchOverlay()
    if (getPrefs().globalHistory) {
      entriesRef.current = []
      return
    }
    const stored = loadSessionHistory(id)
    entriesRef.current = stored
    historyRef.current = stored.map((row) => row.text)
    for (const row of stored) seenRef.current.add(row.seq)
  }, [id, historyRef, seenRef, browseRef, searchRef])

  // Fold newly arrived user messages into the history (the window slides; the
  // append-only list survives it). With global history, dedup against the whole
  // ring and persist it after every append. Otherwise persist this session's
  // user prompts locally (capped), without loading older transcript turns.
  useEffect(() => {
    const globalOn = getPrefs().globalHistory
    const appended = foldHistory({
      messages,
      seen: seenRef.current,
      history: historyRef.current,
      globalOn,
      ...(globalOn ? {} : { entries: entriesRef.current }),
    })
    if (globalOn) {
      if (appended) saveRing(historyRef.current)
      return
    }
    if (appended) {
      entriesRef.current.sort((a, b) => a.seq - b.seq)
      historyRef.current = entriesRef.current.map((row) => row.text)
    }
    const overCap = entriesRef.current.length > sessionCap
    if (appended || overCap) {
      if (overCap) {
        entriesRef.current = entriesRef.current.slice(-sessionCap)
        historyRef.current = historyRef.current.slice(-sessionCap)
      }
      saveSessionHistory(id, entriesRef.current, sessionCap)
    }
  }, [messages, historyRef, seenRef, id, sessionCap])
}
