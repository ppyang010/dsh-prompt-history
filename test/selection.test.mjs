import './register-source.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><p id="message">原始引用内容</p></body></html>', { url: 'https://test.local/' })
for (const name of ['window', 'document', 'localStorage', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'DOMRect', 'navigator', 'MutationObserver']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = clearTimeout
const prefs = await import('../src/client/prefs.ts')
const { useClipboard } = await import('../src/client/useClipboard.ts')
const { NativeSelectionMenu, bindNativeSelectionMenu, canQuote } = await import('../src/client/NativeSelectionMenu.tsx')
const { SlotCore } = await import('@deepseek-ai/dsh-client-ui-slots')
const waitForSelection = () => new Promise((resolve) => setTimeout(resolve, 180))

function selectMessage() {
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('#message'))
  range.getBoundingClientRect = () => new DOMRect(10, 50, 100, 20)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
  document.dispatchEvent(new window.Event('selectionchange'))
}

test('新用户默认原生菜单，保留输入功能，旧侧聊默认关闭', () => {
  assert.equal(prefs.getPrefs().nativeSelection, true)
  assert.equal(prefs.getPrefs().sideChat, false)
  assert.equal(prefs.getPrefs().promptCompletion, true)
  assert.equal(prefs.getPrefs().promptTemplates, true)
})

test('升级 v4 保留用户偏好与模板数据，切换模式保留待发引用', async () => {
  const original = { version: 4, data: { copyMode: 'auto', sideChat: true, quoteComment: true, quoteYield: false } }
  localStorage.setItem('dsh-prompt-history.prefs', JSON.stringify(original))
  const { addQuoteEntry, quoteEntries } = await import('../src/client/quoteMarks.tsx')
  const quote = addQuoteEntry('migration', '待发引用原文', null, { comment: '用户注释' })
  const keys = ['dsh-prompt-history.templates']
  for (const key of keys) localStorage.setItem(key, '用户原有数据')
  const upgraded = await import('../src/client/prefs.ts?upgrade')
  assert.equal(upgraded.getPrefs().nativeSelection, true)
  assert.equal(upgraded.getPrefs().copyMode, 'auto')
  assert.equal(upgraded.getPrefs().sideChat, true)
  assert.equal(upgraded.getPrefs().quoteComment, true)
  assert.equal(upgraded.getPrefs().quoteYield, false)
  for (const key of keys) assert.equal(localStorage.getItem(key), '用户原有数据')
  assert.equal(JSON.parse(localStorage.getItem('dsh-prompt-history.prefs')).version, 5)
  upgraded.setPref('sideChat', false)
  upgraded.setPref('nativeSelection', false)
  upgraded.setPref('nativeSelection', true)
  assert.deepEqual(quoteEntries('migration'), [quote])
  for (const key of keys) assert.equal(localStorage.getItem(key), '用户原有数据')
})

test('原生模式不出现全局浮层或自动复制，兼容模式可恢复且切换立即撤回', async () => {
  let copies = 0
  document.execCommand = () => { copies++; return true }
  const liveRef = { current: { draft: '', phase: 'idle', removed: false, inputActions: {} } }
  function Harness() { useClipboard({ liveRef, sessionId: 'test' }); return null }
  const root = createRoot(document.querySelector('#root'))
  await act(async () => root.render(React.createElement(Harness)))
  prefs.setPref('copyMode', 'auto')
  selectMessage()
  await waitForSelection()
  assert.equal(copies, 0)
  assert.equal(document.querySelector('.dsh-ph-toolbar'), null)
  prefs.setPref('nativeSelection', false)
  selectMessage()
  await waitForSelection()
  assert.equal(copies, 1)
  prefs.setPref('copyMode', 'toolbar')
  selectMessage()
  await waitForSelection()
  assert.ok(document.querySelector('.dsh-ph-toolbar'))
  const nativeSurface = document.createElement('div')
  nativeSurface.dataset.textInteractionSurface = ''
  nativeSurface.setAttribute('aria-hidden', 'false')
  document.body.appendChild(nativeSurface)
  selectMessage()
  await waitForSelection()
  assert.equal(document.querySelector('.dsh-ph-toolbar'), null)
  nativeSurface.remove()
  selectMessage()
  await waitForSelection()
  assert.ok(document.querySelector('.dsh-ph-toolbar'))
  prefs.setPref('nativeSelection', true)
  assert.equal(document.querySelector('.dsh-ph-toolbar'), null)
  // 切换发生在 debounce 到期前也不能残留复制操作。
  prefs.setPref('nativeSelection', false)
  prefs.setPref('copyMode', 'auto')
  selectMessage()
  prefs.setPref('nativeSelection', true)
  await waitForSelection()
  assert.equal(copies, 1)
  await act(async () => root.unmount())
})


test('官方 keyed 槽保留原注册，统一菜单声明扩展子槽，关闭后恢复官方动作', () => {
  const slots = new SlotCore()
  slots.register({ name: 'root', children: { 'conversation.chat.text-interaction': { kind: 'keyed', scope: 'session' } } }, () => null)
  const OfficialQuote = () => null
  slots.register({ name: 'conversation.chat.text-interaction', key: 'quote' }, OfficialQuote)
  const effects = []
  const ctx = {
    inject: () => ({ dispose: async () => {} }), // 本例不安装 Side Chat；其真实服务生命周期由独立集成测试覆盖。
    slots: {
      inject: (key, install) => install(),
      register: slots.register.bind(slots),
    },
    effect: (fn) => { const dispose = fn(); effects.push(dispose); return dispose },
  }
  prefs.setPref('nativeSelection', true)
  bindNativeSelectionMenu(ctx)
  assert.equal(slots.entriesOfSlot('conversation.chat.text-interaction')[0].component, NativeSelectionMenu)
  assert.equal(slots.entries('conversation.chat.text-interaction').length, 2)
  slots.register({ name: 'conversation.chat.selection-actions', id: 'side-chat', order: 30 }, () => null)
  prefs.setPref('nativeSelection', false)
  assert.equal(slots.entriesOfSlot('conversation.chat.text-interaction')[0].component, OfficialQuote)
  assert.equal(slots.entries('conversation.chat.selection-actions').length, 0)
  prefs.setPref('nativeSelection', true)
  assert.equal(slots.entriesOfSlot('conversation.chat.text-interaction')[0].component, NativeSelectionMenu)
  for (const dispose of effects.reverse()) dispose()
  assert.equal(slots.entriesOfSlot('conversation.chat.text-interaction')[0].component, OfficialQuote)
})

test('Sidenote 不依赖原生选区开关也能渲染并投递自有菜单', async () => {
  const effects = []
  prefs.setPref('nativeSelection', false)
  prefs.setPref('sideChatDomCompat', false)
  bindNativeSelectionMenu({ effect: (fn) => effects.push(fn()) })
  const calls = []
  const root = createRoot(document.querySelector('#root'))
  try {
    await act(async () => root.render(window.__dshPromptHistorySelectionMenu({
      sessionId: 'sidenote-menu', readText: () => '跨段引用',
      quoteSelection: () => { calls.push('sidenote'); return true },
      clearSelection: () => calls.push('clear'), dismiss: () => calls.push('dismiss'),
    })))
    const buttons = document.querySelectorAll('[data-ph-sidenote-menu] button')
    assert.equal(buttons.length, 3)
    assert.equal(buttons[2].textContent, '引用到侧聊')
    await act(async () => buttons[2].click())
    assert.deepEqual(calls, ['sidenote', 'clear', 'dismiss'])
  } finally {
    await act(async () => root.unmount())
    for (const dispose of effects.reverse()) dispose()
    prefs.setPref('nativeSelection', true)
  }
  assert.equal(window.__dshPromptHistorySelectionMenu, undefined)
})

test('引用批次确认只清理同会话未编辑的原条目', async () => {
  const { addQuoteEntry, capturePendingQuotes, editQuoteEntry, quoteEntries } = await import('../src/client/quoteMarks.tsx')
  const id = 'quote-batch-main'
  addQuoteEntry(id, '发送原文', null)
  const edit = addQuoteEntry(id, '等待时编辑', null)
  const batch = capturePendingQuotes(id)
  assert.match(batch.text, /发送原文/)
  assert.equal(quoteEntries(id).length, 2)
  editQuoteEntry(id, edit, '新版引用')
  addQuoteEntry(id, '发送时新加', null)
  addQuoteEntry('quote-batch-side', '旁路', null)
  batch.accept()
  assert.deepEqual(quoteEntries(id).map(entry => entry.text), ['新版引用', '发送时新加'])
  assert.deepEqual(quoteEntries('quote-batch-side').map(entry => entry.text), ['旁路'])
})

test('原生菜单使用局部选文创建 PH 笔记，不调用官方引用，复制失败可重试', async () => {
  prefs.setPref('quoteComment', false)
  const { quoteEntries } = await import('../src/client/quoteMarks.tsx')
  const calls = []
  let text = '当前会话选区'
  let failCopy = false
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (value) => { if (failCopy) throw new Error('denied'); calls.push(['copy', value]) },
  } })
  const props = {
    trigger: 'selection',
    readText: () => text,
    clearSelection: () => calls.push(['clear']),
    dismiss: () => calls.push(['dismiss']),
    useSession: (selector) => selector({ removed: false, subagent: null }),
    sessionId: 'native-note-session',
    inputActions: { insertQuote: () => { throw new Error('不得调用官方引用') } },
    renderSlot: (key, owner) => {
      assert.equal(key, 'conversation.chat.selection-actions')
      assert.equal(owner.readText, props.readText)
      return React.createElement('button', { 'data-side-chat': true }, '侧聊追问')
    },
  }
  const root = createRoot(document.querySelector('#root'))
  await act(async () => root.render(React.createElement(NativeSelectionMenu, props)))
  const buttons = document.querySelectorAll('#root button')
  assert.equal(buttons.length, 3)
  const down = new window.Event('pointerdown', { bubbles: true, cancelable: true })
  buttons[0].dispatchEvent(down)
  assert.equal(down.defaultPrevented, true)
  await act(async () => buttons[1].click())
  assert.deepEqual(calls, [['clear'], ['dismiss']])
  assert.equal(quoteEntries(props.sessionId).length, 1)
  assert.equal(quoteEntries(props.sessionId)[0].text, text)
  assert.equal(quoteEntries('another-session').length, 0)
  calls.length = 0
  failCopy = true
  await act(async () => buttons[0].click())
  assert.deepEqual(calls, [])
  assert.ok(document.querySelector('[role="status"]'))
  failCopy = false
  await act(async () => buttons[0].click())
  assert.deepEqual(calls, [['copy', text], ['clear'], ['dismiss']])
  calls.length = 0
  text = null
  await act(async () => buttons[0].click())
  assert.deepEqual(calls, [['dismiss']])
  await act(async () => root.unmount())
  assert.equal(canQuote({ removed: false, subagent: null, phase: 'submitting' }), false)
  assert.equal(canQuote({ removed: true, subagent: null }), false)
  assert.equal(canQuote({ removed: false, subagent: { address: { mode: 'continuable' }, parentAvailable: true } }), true)
  assert.equal(canQuote({ removed: false, subagent: { address: { mode: 'external' }, parentAvailable: true } }), false)
})
