import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixSideChatAutoReopen } from '../scripts/side-chat-close-fix.mjs'
const source = readFileSync(new URL('./fixtures/side-chat-1.2.2-reopen.js.txt', import.meta.url), 'utf8')

// 执行上游真实组件的 effect；只替换 DSH 服务和无关布局依赖。
function harness(code) {
  const opened = []
  const effects = []
  const state = { enabled:true, busy:false, dialog:null, error:'', sideRatio:50,
    sides:new Map([['A', {sideId:'side-A'}], ['B', {sideId:'side-B'}]]) }
  const noop = () => {}
  const bindings = {
    React:{ useRef:value => ({ current:value }), useState:value => [value, noop],
      useEffect:fn => effects.push(fn), useLayoutEffect:fn => effects.push(fn), useCallback:fn => fn, Fragment:'fragment' },
    h:(type,props,...children) => ({type,props,children}),
    useSideState:() => state, usesBetterSidebar:() => true,
    useBetterSidebarPanelOpen:() => false, useBetterSidebarAutoHide:noop,
    useBetterSidebarToggleCluster:() => null, findSideOwner:() => undefined,
    openBetterSidebarTab:id => opened.push(id), update:noop,
    sessionsService:{ retain:() => ({ready:Promise.resolve(),release:noop}) },
    conversationKits:new Map(), NativeConversationRoot:noop, CloseDialog:noop,
    IconAction:noop, SideChatIcon:noop,
  }
  const component = new Function(...Object.keys(bindings), `${code}\nreturn {ParallelConversation, HeaderAction}`)(...Object.values(bindings))
  function mount(id) {
    effects.length=0
    component.ParallelConversation({ sessionId:id, renderFactorySlot:noop, SessionProvider:noop })
    const cleanups=effects.map(effect => effect())
    return () => cleanups.forEach(cleanup => { if (typeof cleanup==='function') cleanup() })
  }
  return {opened,mount,clickOpen:id => component.HeaderAction({sessionId:id}).props.onClick()}
}

test('复现上游：手动关掉侧聊后切换 A→B→A 又自动展开', () => {
  const app=harness(source)
  let unmount=app.mount('A')
  app.opened.length=0 // 用户关闭 Sidebar 后，保留会话的侧聊关联
  unmount();unmount=app.mount('B');unmount();unmount=app.mount('A');unmount()
  assert.deepEqual(app.opened,['B','A'])
})

test('修复后：切换及重新挂载不展开，主动点击仍可打开对应侧聊', () => {
  const app=harness(fixSideChatAutoReopen(source))
  let unmount=app.mount('A');unmount();unmount=app.mount('B');unmount();unmount=app.mount('A');unmount()
  assert.deepEqual(app.opened,[])
  app.clickOpen('A')
  assert.deepEqual(app.opened,['A'])
})

test('上游实现变化或重复打补丁必须拒绝，避免误改未知版本', () => {
  assert.throws(() => fixSideChatAutoReopen('未知版本'),/不一致/)
  assert.throws(() => fixSideChatAutoReopen(fixSideChatAutoReopen(source)),/不一致/)
})
