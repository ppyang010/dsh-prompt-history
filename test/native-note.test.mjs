import './register-source.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><body><pre><code class="language-js">const n = 1</code></pre></body>', { url: 'https://test.local' })
for (const name of ['window', 'document', 'localStorage', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'DOMRect', 'navigator']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
}
const { prepareNativeQuoteNote } = await import('../src/client/nativeQuoteNote.ts')
const { quoteEntries } = await import('../src/client/quoteMarks.tsx')
const { setPref } = await import('../src/client/prefs.ts')

test('笔记保存代码类型与出处快照，清选区后仍可创建', async () => {
  setPref('quoteComment', false)
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('code'))
  document.getSelection().addRange(range)
  const apply = prepareNativeQuoteNote('code-session', 'const n = 1')
  document.getSelection().removeAllRanges()
  await apply()
  const note = quoteEntries('code-session')[0]
  assert.equal(note.text, 'const n = 1')
  assert.equal(note.fence, '```js')
  assert.ok(note.anchor)
})

test('评论取消不创建笔记，提交保留评论与逐条回应且绑定原会话', async () => {
  setPref('quoteComment', true)
  const cancelled = prepareNativeQuoteNote('cancel-session', '局部原文')()
  const cancelPanel = document.querySelector('textarea').parentElement
  cancelPanel.querySelector('button:not([data-primary])').click()
  await cancelled
  assert.equal(quoteEntries('cancel-session').length, 0)
  const committed = prepareNativeQuoteNote('comment-session', '另一段局部原文')()
  const input = document.querySelector('textarea')
  input.value = '这点需要说明'
  const panel = input.parentElement
  panel.querySelector('input[type=checkbox]').checked = true
  panel.querySelector('button[data-primary]').click()
  await committed
  const note = quoteEntries('comment-session')[0]
  assert.equal(note.text, '另一段局部原文')
  assert.equal(note.comment, '这点需要说明')
  assert.equal(note.perItem, true)
  assert.equal(note.anchor, null)
  assert.equal(quoteEntries('cancel-session').length, 0)
})
