import './register-source.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.local/' })
for (const name of ['window', 'document', 'localStorage']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
}

const ring = await import('../src/client/historyRing.ts')
const prefs = await import('../src/client/prefs.ts')

test('单会话上限默认 50，非法值被夹到 1–200', () => {
  assert.equal(prefs.getPrefs().sessionHistoryCap, 50)
  assert.equal(ring.clampSessionCap(undefined), 50)
  assert.equal(ring.clampSessionCap(0), 1)
  assert.equal(ring.clampSessionCap(3.9), 3)
  assert.equal(ring.clampSessionCap(500), 200)
})

test('按会话只存用户提示词，超上限丢掉最旧的，刷新后仍能读回', () => {
  const id = 'session-a'
  const entries = [
    { seq: 1, text: '第一句' },
    { seq: 2, text: '第二句' },
    { seq: 3, text: '第三句' },
  ]
  ring.saveSessionHistory(id, entries, 2)
  assert.deepEqual(ring.loadSessionHistory(id), [
    { seq: 2, text: '第二句' },
    { seq: 3, text: '第三句' },
  ])
})

test('折叠本会话历史时跳过连续重复，并写入带 seq 的条目', () => {
  const seen = new Set()
  const history = []
  const entries = []
  const appended = ring.foldHistory({
    messages: [
      { kind: 'user', seq: 1, text: '你好' },
      { kind: 'user', seq: 2, text: '你好' },
      { kind: 'user', seq: 3, text: '下一句' },
    ],
    seen,
    history,
    globalOn: false,
    entries,
  })
  assert.equal(appended, true)
  assert.deepEqual(history, ['你好', '下一句'])
  assert.deepEqual(entries, [
    { seq: 1, text: '你好' },
    { seq: 3, text: '下一句' },
  ])
})

test('设置里改条数会立刻夹紧并写回', () => {
  prefs.setPref('sessionHistoryCap', 999)
  assert.equal(prefs.getPrefs().sessionHistoryCap, 200)
  prefs.setPref('sessionHistoryCap', 30)
  assert.equal(prefs.getPrefs().sessionHistoryCap, 30)
  prefs.setPref('sessionHistoryCap', 50)
})

test('旧偏好没有 sessionHistoryCap 时升级为 50，其它项保留', async () => {
  localStorage.setItem('dsh-prompt-history.prefs', JSON.stringify({
    version: 5,
    data: { copyMode: 'auto', sideChat: true, quoteComment: true },
  }))
  const upgraded = await import('../src/client/prefs.ts?session-cap')
  assert.equal(upgraded.getPrefs().sessionHistoryCap, 50)
  assert.equal(upgraded.getPrefs().copyMode, 'auto')
  assert.equal(upgraded.getPrefs().sideChat, true)
})
