/**
 * The cross-session history ring: the localStorage-backed prompt list used when
 * "cross-session history memory" is on, plus the folding rule that turns
 * newly-arrived conversation messages into history entries.
 *
 * Pure apart from the storage reads/writes, so the composer keeps only the thin
 * effects that call it.
 *
 * @module dsh-prompt-history/client/historyRing
 */
import type { PromptMessage } from './nodes.ts'

/** Storage key for the persisted ring. */
export const RING_KEY = 'dsh-prompt-history.global'
/** Maximum entries kept (oldest dropped). */
export const RING_CAP = 200
/** localStorage prefix for per-session prompt lists. */
export const SESSION_STORE_PREFIX = 'dsh-prompt-history.session.'
/** Default cap for one session's stored prompts. */
export const SESSION_CAP_DEFAULT = 50
/** Inclusive bounds for the per-session cap setting. */
export const SESSION_CAP_MIN = 1
export const SESSION_CAP_MAX = 200

/** One stored per-session prompt (seq is for reload dedup). */
export interface SessionHistoryEntry {
  readonly seq: number
  readonly text: string
}

/** Storage key for one session's prompt list. */
export function sessionStoreKey(sessionId: string): string {
  return `${SESSION_STORE_PREFIX}${encodeURIComponent(sessionId)}`
}

/**
 * Clamp a stored per-session cap to the supported range.
 * @param value - raw setting.
 * @param fallback - used when value is not a finite integer.
 */
export function clampSessionCap(value: unknown, fallback = SESSION_CAP_DEFAULT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const cap = Math.trunc(value)
  if (cap < SESSION_CAP_MIN) return SESSION_CAP_MIN
  if (cap > SESSION_CAP_MAX) return SESSION_CAP_MAX
  return cap
}

/**
 * Read one session's persisted prompts.
 * @param sessionId - durable session id.
 * @returns oldest-first entries (empty when missing or unreadable).
 */
export function loadSessionHistory(sessionId: string): SessionHistoryEntry[] {
  if (sessionId === '') return []
  try {
    const raw = localStorage.getItem(sessionStoreKey(sessionId))
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : []
    const out: SessionHistoryEntry[] = []
    for (const row of rows) {
      if (typeof row === 'string' && row !== '') {
        out.push({ seq: out.length, text: row })
        continue
      }
      if (row === null || typeof row !== 'object') continue
      const rec = row as { seq?: unknown; text?: unknown }
      if (typeof rec.text !== 'string' || rec.text === '') continue
      const seq = typeof rec.seq === 'number' && Number.isFinite(rec.seq) ? rec.seq : out.length
      out.push({ seq, text: rec.text })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Persist one session's prompts, capped.
 * @param sessionId - durable session id.
 * @param entries - oldest-first entries.
 * @param cap - maximum entries to keep.
 */
export function saveSessionHistory(
  sessionId: string,
  entries: readonly SessionHistoryEntry[],
  cap: number,
): void {
  if (sessionId === '') return
  try {
    const kept = entries.slice(-clampSessionCap(cap))
    localStorage.setItem(sessionStoreKey(sessionId), JSON.stringify({ entries: kept }))
  } catch { /* storage unavailable */ }
}

/**
 * Read the persisted ring.
 * @returns the stored prompts, oldest first (empty when unreadable).
 */
export function loadRing(): string[] {
  try {
    const raw = localStorage.getItem(RING_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

/**
 * Persist the ring, capped.
 * @param history - the full ring, oldest first.
 */
export function saveRing(history: readonly string[]): void {
  try {
    localStorage.setItem(RING_KEY, JSON.stringify(history.slice(-RING_CAP)))
  } catch { /* storage unavailable */ }
}

/**
 * Fold newly-arrived user messages into the history list.
 *
 * The history is the session's own message log, so every submit becomes
 * recallable as its node lands. Dedup is consecutive duplicates for the
 * per-session list, and "already anywhere in the ring" when the cross-session
 * ring is on (that list outlives the session, so a prompt may come back).
 *
 * @param params - the message batch, the seen-seq set, the list, and the mode.
 * @returns whether anything was appended.
 */
export function foldHistory(params: {
  readonly messages: readonly PromptMessage[]
  readonly seen: Set<number>
  readonly history: string[]
  readonly globalOn: boolean
  readonly entries?: SessionHistoryEntry[]
}): boolean {
  const { messages, seen, history, globalOn, entries } = params
  let appended = false
  for (const message of messages) {
    if (seen.has(message.seq)) continue
    seen.add(message.seq)
    if (message.text === null) continue
    if (globalOn ? !history.includes(message.text) : history[history.length - 1] !== message.text) {
      history.push(message.text)
      entries?.push({ seq: message.seq, text: message.text })
      appended = true
    }
  }
  return appended
}
