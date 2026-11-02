#!/usr/bin/env node
/**
 * 重启后的验收脚本：一次跑完 M3/M4 的真实链路检查，逐项打印 PASS/FAIL。
 *
 *   node tools/verify-live.mjs
 *
 * 依赖：dsh web 已在 3080 跑、~/.dsh/remote-panel-token 与 remote-panel-app/login.html 存在、
 *       chrome-cdp（9223）在跑。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const API = 'http://127.0.0.1:3080/remote-panel/api'
const CDP = 'http://127.0.0.1:9223'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const token = readFileSync(join(HOME, 'remote-panel-token'), 'utf8').trim()
const login = readFileSync(join(HOME, 'remote-panel-app/login.html'), 'utf8')
const launch = /[?&]token=([A-Za-z0-9_.~-]+)/.exec(login)?.[1]
if (!launch) throw new Error('login.html 里没找到启动令牌')

const api = async (path, init = {}) => {
  const response = await fetch(API + path, {
    ...init,
    headers: { 'x-dsh-remote-panel': token, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

/* ---------- 1. 宿主路由 ---------- */
const pending = await api('/pending')
check('GET /pending 可用', pending.status === 200 && pending.body.ok === true, `HTTP ${pending.status}`)
const relay = await api('/relay')
check('GET /relay 可用', relay.status === 200 && relay.body.ok === true, `HTTP ${relay.status}`)

const mark = await api('/relay/mark', { method: 'POST', body: JSON.stringify({ sessionId: 'verify-session', text: '验收：标记一条' }) })
const markId = mark.body?.relay?.marks?.[0]?.id
check('POST /relay/mark 落库', mark.status === 200 && typeof markId === 'string', markId ?? JSON.stringify(mark.body).slice(0, 80))
const unmark = markId ? await api('/relay/unmark', { method: 'POST', body: JSON.stringify({ id: markId }) }) : null
check('POST /relay/unmark 清掉', unmark?.body?.relay?.marks?.length === 0)

const watch = await api('/watch', { method: 'POST', body: JSON.stringify({ sessionId: 'verify-session', on: true }) })
check('POST /watch 接管开关', watch.body?.watching?.includes('verify-session') === true)
await api('/watch', { method: 'POST', body: JSON.stringify({ sessionId: 'verify-session', on: false }) })

/* ---------- 2. 手机页面 ---------- */
const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pendingCalls = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pendingCalls.has(message.id)) {
    const entry = pendingCalls.get(message.id)
    pendingCalls.delete(message.id)
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const next = ++id
    pendingCalls.set(next, { resolve, reject })
    ws.send(JSON.stringify({ id: next, method, params }))
  })
const trySend = (method, params = {}) => send(method, params).catch((e) => ({ __err: String(e).slice(0, 80) }))
const evaluate = async (expression) => {
  const result = await trySend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result.exceptionDetails ? { __err: String(result.exceptionDetails.exception?.description).slice(0, 200) } : result.result?.value
}

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
await trySend('Page.enable')
await trySend('Runtime.enable')
await trySend('Browser.grantPermissions', { origin: 'http://127.0.0.1:3080', permissions: ['notifications'] })
await trySend('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await trySend('Page.navigate', { url: `http://127.0.0.1:3080/?token=${launch}` })
await sleep(9500)

let opened = false
for (let attempt = 0; attempt < 4 && !opened; attempt += 1) {
  await evaluate(
    `(() => { if (!document.documentElement.classList.contains('dsh-drawer-open')) [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('侧边栏'))?.click(); return true })()`,
  )
  await sleep(1100)
  await evaluate(`document.querySelector('.hHd-Xa_panelRow[aria-label="监看"]')?.click()`)
  for (let wait = 0; wait < 16 && !opened; wait += 1) {
    opened = await evaluate(`document.querySelectorAll('[data-act="nav"]').length >= 3`)
    if (!opened) await sleep(250)
  }
}
check('手机壳里能打开监看', opened)
await evaluate(`(() => { if (document.documentElement.classList.contains('dsh-drawer-open')) document.querySelector('.dsh-mobile-scrim')?.click(); return true })()`)
await sleep(400)

const ui = await evaluate(`(() => {
  const text = (document.querySelector('.pc-host')?.innerText || '').replace(/\\s+/g, ' ')
  return {
    watchRow: text.includes('手机批准'),
    relayRow: text.includes('断点接力'),
    notifyRow: text.includes('完成/待批通知'),
    chips: [...document.querySelectorAll('[data-act="say"]')].map((b) => b.textContent.trim()),
  }
})()`)
check('「手机批准」开关在', ui?.watchRow === true)
check('「断点接力 / 通知」在', ui?.relayRow === true && ui?.notifyRow === true)
check('短语 chips 在', Array.isArray(ui?.chips) && ui.chips.length >= 3, (ui?.chips ?? []).join(' / '))

await evaluate(`document.querySelector('[data-act="mark"]')?.click()`)
await sleep(1500)
const markToast = await evaluate(`(document.querySelector('.toast') || {}).textContent || ''`)
check('点「标记待处理」真的写进宿主', String(markToast).includes('已标记'), String(markToast))
const apiCalls = await evaluate(`performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/remote-panel/api/'))`)
check('页面确实在轮询 /pending', (apiCalls ?? []).some((url) => url.includes('/pending')))

await evaluate(`document.querySelector('[data-act="notify"]')?.click()`)
await sleep(800)
const notifyState = await evaluate(`({ permission: typeof Notification === 'undefined' ? 'none' : Notification.permission })`)
check('通知权限已拿到', notifyState?.permission === 'granted', notifyState?.permission)

await evaluate(`document.querySelector('[data-act="nav"][data-view="sessions"]')?.click()`)
await sleep(1200)
const sessions = await evaluate(`[...document.querySelectorAll('[data-act="session"]')].slice(0, 5).map(r => (r.querySelector('.row-sub') || {}).textContent)`)
check('会话总览有列表', Array.isArray(sessions) && sessions.length > 0, (sessions ?? []).slice(0, 2).join(' | '))

await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
ws.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length === 0 ? 0 : 1)
