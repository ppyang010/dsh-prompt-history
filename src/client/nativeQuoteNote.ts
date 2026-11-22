import { captureQuoteContext } from './quoteContext.ts'
import { addQuoteEntry, selectionAnchor } from './quoteMarks.tsx'
import { flashQuoteRow, showQuoteComposer } from './feedback.ts'
import { getPrefs } from './prefs.ts'

/** 先捕获出处，再撤回原生菜单；引用正文始终使用宿主验证过的局部选文。 */
export function prepareNativeQuoteNote(sessionId: string, text: string): () => Promise<void> {
  const selection = document.getSelection()
  const matches = selection !== null && selection.rangeCount > 0 && selection.toString() === text
  const context = matches ? captureQuoteContext() : null
  const anchor = matches ? selectionAnchor() : null
  const range = matches ? selection.getRangeAt(0) : null
  const rect = range?.getBoundingClientRect?.()
    ?? new DOMRect(window.innerWidth / 2 - 180, window.innerHeight / 2, 0, 0)
  const needsComment = getPrefs().quoteComment
  return async () => {
    const result = needsComment ? await showQuoteComposer(rect, text, false) : { comment: '', perItem: false }
    if (result === null) return
    addQuoteEntry(sessionId, text, anchor, {
      fence: context?.fence ?? null,
      comment: result.comment,
      perItem: result.perItem,
    })
    flashQuoteRow(context?.row ?? null)
  }
}
