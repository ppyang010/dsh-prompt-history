import './register-source.mjs'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
import { addSideChatClientApi, createSideChatActions } from '../scripts/side-chat-client-api.mjs'

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'https://test.local' })
for (const name of ['window','document','Node','Element','HTMLElement','MutationObserver','localStorage','navigator']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { SideChatAction } = await import('../src/client/SideChatAction.tsx')
const { bindSideChatActions, getSideChatActions } = await import('../src/client/sideChatActions.ts')
const { setPref } = await import('../src/client/prefs.ts')
const source = readFileSync(new URL('./fixtures/side-chat-1.2.2-api.js.txt', import.meta.url), 'utf8')
const patched = addSideChatClientApi(source)
const settle = async fn => act(async () => { await fn?.(); await new Promise(resolve => setImmediate(resolve)) })

function provider(ctx, state, openSide) {
  const listeners = new Set()
  const update = patch => { Object.assign(state, patch); for (const listener of listeners) listener() }
  // 执行实际注入上游的安装代码，包括 ctx.provide；不手写一个替代服务。
  const install = new Function('openSide','uiState','subscribers','update','styles','CSS',
    patched.slice(patched.indexOf('function install(ctx)')) + '\nreturn install')(
    openSide, state, listeners, update, { insert() {} }, '')
  install(ctx)
  return update
}

test('补丁执行真实上游打开函数：传递会话/全文，复用已有侧聊，报告忙碌、禁用和 RPC 失败', async () => {
  const state = { enabled:true, busy:false, sides:new Map() }
  const calls = []; const tabs = []
  let failure = false
  const open = new Function('uiState','usesBetterSidebar','closeBetterSidebarPanel','appendSelection','patchSide',
    'persistSelections','update','openBetterSidebarTab','rpc','storedSelections','setSide',
    patched.slice(patched.indexOf('async function openSide'), patched.indexOf('function ParallelConversation')) + '\nreturn openSide')(
    state, () => true, () => {}, (items = [], text) => [...items,text],
    (id, patch) => state.sides.set(id, { ...state.sides.get(id), ...patch }), () => {}, patch => Object.assign(state, patch),
    id => tabs.push(id), async (method, args) => { calls.push([method,args]); if(failure) throw new Error('网络失败'); return { sessionId:'side-'+args.parentSessionId } },
    () => [], (id, side) => state.sides.set(id, side))
  const text = '标题\n\n列表第一项\n第二项\t表格'
  assert.equal((await open('会话-A', text)).ok, true)
  assert.equal(calls[0][1].parentSessionId, '会话-A')
  assert.equal(calls[0][1].anchorText, text)
  assert.equal((await open('会话-A', '追加引用')).ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(state.sides.get('会话-A').selections, [text,'追加引用'])
  assert.deepEqual(tabs, ['会话-A','会话-A'])
  state.enabled=false; assert.equal((await open('B', text)).ok, false)
  state.enabled=true; state.busy=true; assert.equal((await open('B', text)).ok, false)
  state.busy=false; failure=true
  assert.deepEqual(await open('B', text), { ok:false, error:'网络失败' })
  assert.equal(state.busy, false)
  assert.equal(state.sides.has('B'), false)
})

test('真实 Cordis 注入：PH 先加载、服务热卸载/重载、设置关闭恢复原浮窗', async () => {
  setPref('nativeSelection', true); setPref('sideChatDomCompat', true)
  const ctx = new Context()
  const ph = await ctx.plugin(bindSideChatActions)
  assert.equal(getSideChatActions(), null)
  const state = { enabled:true, busy:false }
  let sc = await ctx.plugin(child => provider(child, state, async () => ({ok:true})))
  await settle()
  assert.ok(getSideChatActions())
  assert.equal(state.externalSelectionMenu, true)
  setPref('sideChatDomCompat', false); assert.equal(state.externalSelectionMenu, false)
  setPref('sideChatDomCompat', true); assert.equal(state.externalSelectionMenu, true)
  setPref('nativeSelection', false); assert.equal(state.externalSelectionMenu, false)
  setPref('nativeSelection', true); assert.equal(state.externalSelectionMenu, true)
  await sc.dispose(); await settle()
  assert.equal(getSideChatActions(), null)
  assert.equal(state.externalSelectionMenu, false)
  sc = await ctx.plugin(child => provider(child, state, async () => ({ok:true})))
  await settle()
  assert.equal(state.externalSelectionMenu, true)
  await ph.dispose(); await settle()
  assert.equal(state.externalSelectionMenu, false)
  await sc.dispose()
})

test('PH 自有按钮无浮窗也可调用，错误保留选区、成功清理、重复点击只发一次', async () => {
  const ctx = new Context()
  const state = { enabled:true, busy:false }
  const requests=[]; let resolveOpen
  const sc = await ctx.plugin(child => provider(child,state,(sessionId, text) => {
    requests.push({sessionId,text}); return new Promise(resolve => { resolveOpen=resolve })
  }))
  const ph = await ctx.plugin(bindSideChatActions)
  const root = createRoot(document.querySelector('#root'))
  const text='标题\n\n列表第一项\n第二项\t表格'
  const calls=[]
  try {
    await settle(() => root.render(React.createElement(SideChatAction, {
      sessionId:'会话-A',readText:()=>text,clearSelection:()=>calls.push('clear'),dismiss:()=>calls.push('dismiss'),
    })))
    assert.equal(document.querySelector('button').textContent, '引用到侧聊')
    assert.equal(document.querySelector('.dsh-sc-selection'), null)
    await settle(() => { document.querySelector('button').click(); document.querySelector('button').click() })
    assert.deepEqual(requests,[{sessionId:'会话-A',text}])
    await settle(() => resolveOpen({ok:false,error:'网络失败'}))
    assert.deepEqual(calls,[])
    assert.equal(document.querySelector('[role=status]').textContent,'网络失败')
    await settle(() => document.querySelector('button').click())
    await settle(() => resolveOpen({ok:true}))
    assert.deepEqual(calls,['clear','dismiss'])
  } finally {
    await settle(() => root.unmount())
    await ph.dispose(); await sc.dispose()
  }
})

test('旧侧聊停用时仍显示入口，beta 接收全文，拒绝时保留选区', async () => {
  assert.equal(getSideChatActions(), null)
  const root = createRoot(document.querySelector('#root'))
  const text = '选文第一行\n\n第二行'
  const calls = []
  let accepted = false
  window.__dshBetterSidebarOpenSideChat = value => { calls.push(value); return accepted }
  try {
    await settle(() => root.render(React.createElement(SideChatAction, {
      sessionId: '会话-A', readText: () => text,
      clearSelection: () => calls.push('clear'), dismiss: () => calls.push('dismiss'),
    })))
    assert.equal(document.querySelector('button').textContent, '引用到侧聊')
    await settle(() => document.querySelector('button').click())
    assert.deepEqual(calls, [text])
    assert.match(document.querySelector('[role=status]').textContent, /无法打开侧边对话/)
    accepted = true
    await settle(() => document.querySelector('button').click())
    assert.deepEqual(calls, [text, text, 'clear', 'dismiss'])
    await settle(() => setPref('sideChatDomCompat', false))
    assert.equal(document.querySelector('button'), null)
  } finally {
    await settle(() => root.unmount())
    setPref('sideChatDomCompat', true)
    delete window.__dshBetterSidebarOpenSideChat
  }
})

test('选文优先进入 Sidenote，拒绝时不转投 beta 或清除选区', async () => {
  setPref('nativeSelection', true); setPref('sideChatDomCompat', true)
  const root = createRoot(document.querySelector('#root'))
  const calls = []
  let accepted = false
  window.__dshBetterSidebarOpenSideChat = () => { calls.push('beta'); return true }
  window.__dshSidenoteQuoteSelection = id => { calls.push(id); return accepted }
  try {
    await settle(() => root.render(React.createElement(SideChatAction, {
      sessionId: '主会话', readText: () => '选中文字',
      clearSelection: () => calls.push('clear'), dismiss: () => calls.push('dismiss'),
    })))
    await settle(() => document.querySelector('button').click())
    assert.deepEqual(calls, ['主会话'])
    assert.match(document.querySelector('[role=status]').textContent, /Sidenote/)
    accepted = true
    await settle(() => document.querySelector('button').click())
    assert.deepEqual(calls, ['主会话', '主会话', 'clear', 'dismiss'])
  } finally {
    await settle(() => root.unmount())
    delete window.__dshBetterSidebarOpenSideChat
    delete window.__dshSidenoteQuoteSelection
  }
})

test('请求返回前菜单卸载，不清除后来会话的选区', async () => {
  const ctx=new Context(); let resolveOpen
  const sc=await ctx.plugin(child=>provider(child,{enabled:true,busy:false},()=>new Promise(resolve=>{resolveOpen=resolve})))
  const ph=await ctx.plugin(bindSideChatActions)
  const root=createRoot(document.querySelector('#root')); const calls=[]
  await settle(()=>root.render(React.createElement(SideChatAction, {
    sessionId:'会话-A',readText:()=> '相同文字',clearSelection:()=>calls.push('clear'),dismiss:()=>calls.push('dismiss'),
  })))
  await settle(()=>document.querySelector('button').click())
  await settle(()=>root.unmount())
  await settle(()=>resolveOpen({ok:true}))
  assert.deepEqual(calls,[])
  await ph.dispose();await sc.dispose()
})

test('接口拒绝无效参数、异常可重试，多个菜单持有者全部释放后才恢复原浮窗', async () => {
  let claimed=false; let calls=0
  const api=createSideChatActions({ getState:()=>({enabled:true,busy:false}),subscribe:()=>()=>{},
    setMenuClaimed:value=>{claimed=value},openSide:async()=>{calls++;throw new Error('失败')} })
  assert.equal((await api.open({sessionId:'',text:'x'})).ok,false)
  assert.equal((await api.open({sessionId:'sidechat-A',text:'x'})).ok,false)
  assert.equal(calls,0)
  assert.deepEqual(await api.open({sessionId:'A',text:'x'}),{ok:false,error:'失败'})
  const a=api.claimSelectionMenu(),b=api.claimSelectionMenu()
  a();a();assert.equal(claimed,true)
  b();assert.equal(claimed,false)
  assert.throws(()=>addSideChatClientApi(patched),/不匹配/)
  assert.throws(()=>addSideChatClientApi('未知版本'),/不匹配/)
})
