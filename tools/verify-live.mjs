#!/usr/bin/env node
/**
 * 重启后的真机验收：手机三屏 + 第三屏（宿主右栏面板）逐项打印 PASS/FAIL。
 *
 *   node tools/verify-live.mjs
 *
 * 依赖：dsh web 已在 3080 跑、~/.dsh/remote-panel-token 与 remote-panel-app/login.html 存在、
 *       chrome-cdp 在跑（默认 9223，可用 DSH_CDP 指到别的端点）。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const API = 'http://127.0.0.1:3080/remote-panel/api'
// 验收用的无头 Chrome（`--remote-debugging-port=9223`）。装了 ego lite 的话可以指它：
//   DSH_CDP=http://127.0.0.1:44725 npm run verify:live
const CDP = process.env.DSH_CDP ?? 'http://127.0.0.1:9223'

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
// 本地令牌是「一次性换 cookie」的：浏览器里已经登录过就会 401。
// 这种情况下直接指到已经登录的地址（门禁 Cookie 在同一个浏览器 profile 里）：
//   DSH_APP_URL=https://home.example.com/ npm run verify:live
const APP_URL = process.env.DSH_APP_URL ?? `http://127.0.0.1:3080/?token=${launch}`

const api = async (path, init = {}) => {
  const response = await fetch(API + path, {
    ...init,
    headers: { 'x-dsh-remote-panel': token, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

/* ---------- 1. 宿主路由 ---------- */
const status = await api('/status')
check('GET /status 可用', status.status === 200 && status.body.ok === true, `HTTP ${status.status}`)
check('版本号带出来了', typeof status.body.version === 'string' && status.body.version.length > 0, status.body.version)

// 监看控制台下线后，手机批准与断点接力的路由必须一起消失（不是留着不用的死接口）
const removed = await Promise.all(['/pending', '/relay', '/watch'].map((path) => api(path)))
check(
	'手机批准 / 断点接力路由已下线',
	removed.every((item) => item.status === 404),
	removed.map((item) => item.status).join(' / '),
)

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
const evaluate = async (expression, timeoutMs = 8000) => {
  const call = trySend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), timeoutMs))
  const result = await Promise.race([call, timeout])
  if (result?.__timeout) return undefined
  return result.exceptionDetails ? { __err: String(result.exceptionDetails.exception?.description).slice(0, 200) } : result.result?.value
}

// 和 installPager 同一套判定：手指从 from 划到 to，抬手后等弹簧停稳
const swipe = async (from, to) => {
  await evaluate(`(() => {
    const mk = (x, y, target) => new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 2, radiusY: 2, force: 1 })
    const target = document.body
    const fire = (type, x, y) => {
      const t = mk(x, y, target)
      document.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
      }))
    }
    const step = ${from} < ${to} ? 20 : -20
    fire('touchstart', ${from}, 430)
    for (let x = ${from} + step; step > 0 ? x <= ${to} : x >= ${to}; x += step) fire('touchmove', x, 430)
    fire('touchend', ${to}, 430)
    return true
  })()`)
  await sleep(1200)
}

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
await trySend('Page.enable')
await trySend('Runtime.enable')
await trySend('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await trySend('Page.navigate', { url: APP_URL })
// 重启后第一屏可能还在重打客户端包：等到应用外壳出现再继续（最多 25 秒）
for (let wait = 0; wait < 50; wait += 1) {
  const ready = await evaluate(`!!document.querySelector('[data-rp-frame]')`, 3000)
  if (ready === true) break
  await sleep(500)
}
await sleep(1200)

const shell = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || '').trim())
  return {
    pager: document.documentElement.classList.contains('dsh-pager'),
    page: document.documentElement.dataset.dshPage ?? null,
    pages: document.querySelectorAll('[data-rp-page]').length,
    panelsMarked: document.querySelector('[data-rightbar-col]')?.getAttribute('data-rp-page') ?? null,
    legacyConsole: document.querySelectorAll('.pc-host, .dsh-page-console').length,
    hasConsoleEntry: rows.includes('监看'),
  }
})()`)
check('手机壳进入三屏模式', shell?.pager === true && shell?.page === '1', `page=${shell?.page}`)
check('右栏被标成第三页', shell?.panelsMarked === 'panels')
check('旧监看控制台已移除', shell?.legacyConsole === 0 && shell?.hasConsoleEntry === false)

// 左滑 → 第三页；没开面板时是落地页
await swipe(340, 60)
const landed = await evaluate(`(() => {
  const page = document.documentElement.dataset.dshPage
  const layer = document.querySelector('.dsh-page-panels')
  const rows = [...document.querySelectorAll('.dsh-panels-row')]
  return {
    page,
    visible: layer ? getComputedStyle(layer).visibility : null,
    rows: rows.length,
    first: (rows[0]?.innerText || '').split('\\n')[0] ?? '',
  }
})()`)
check('左滑停在第三页', landed?.page === '2', `page=${landed?.page}`)
check('第三页是面板落地页', landed?.visible === 'visible' && landed?.rows >= 3, `${landed?.rows} 个入口：${landed?.first}`)

// 点第一个入口 → 宿主右栏面板铺满第三页
await evaluate(`(() => { document.querySelector('.dsh-panels-row')?.click(); return true })()`)
await sleep(1600)
const opened = await evaluate(`(() => {
  const panel = [...document.querySelectorAll('[data-sidebar-right-open]')].find((n) => n.getAttribute('data-sidebar-right-open') !== 'false' && n.getClientRects().length > 0)
  const layer = document.querySelector('.dsh-page-panels')
  const rect = panel?.getBoundingClientRect()
  return {
    open: Boolean(panel),
    fullscreen: panel?.getAttribute('data-sidebar-right-panel') ?? null,
    x: rect ? Math.round(rect.x) : null,
    width: rect ? Math.round(rect.width) : null,
    launcher: layer ? getComputedStyle(layer).visibility : null,
  }
})()`)
check(
	'面板开在第三页整屏',
	opened?.open === true && opened?.x === 0 && opened?.width === 390,
	`x=${opened?.x} w=${opened?.width} ${opened?.fullscreen ?? ''}`,
)
check('面板打开时落地页让位', opened?.launcher === 'hidden')

// 收起 → 回落地页（不是回对话）
await evaluate(`(() => {
  const close = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.title || '') === '收起右侧边栏')
  close?.click()
  return Boolean(close)
})()`)
await sleep(1500)
const closed = await evaluate(`(() => {
  const layer = document.querySelector('.dsh-page-panels')
  return { page: document.documentElement.dataset.dshPage, launcher: layer ? getComputedStyle(layer).visibility : null }
})()`)
check('收起后回第三页落地页', closed?.page === '2' && closed?.launcher === 'visible', `page=${closed?.page}`)

// 回到对话页，再用会话顶栏的展开按钮开面板：应当自动滑到第三页
await swipe(60, 340)
const backToChat = await evaluate(`document.documentElement.dataset.dshPage`)
check('右滑回对话', backToChat === '1', `page=${backToChat}`)
await evaluate(`(() => {
  const open = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.title || '') === '打开右侧边栏')
  open?.click()
  return Boolean(open)
})()`)
await sleep(1800)
const snapped = await evaluate(`(() => {
  const panel = [...document.querySelectorAll('[data-sidebar-right-open]')].find((n) => n.getAttribute('data-sidebar-right-open') !== 'false' && n.getClientRects().length > 0)
  const rect = panel?.getBoundingClientRect()
  return { page: document.documentElement.dataset.dshPage, open: Boolean(panel), x: rect ? Math.round(rect.x) : null }
})()`)
check('从对话开面板自动翻到第三页', snapped?.page === '2' && snapped?.open === true, `page=${snapped?.page} x=${snapped?.x}`)

await fetch(`${CDP}/json/close/${target.id}`).catch(() => {})
ws.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length === 0 ? 0 : 1)
