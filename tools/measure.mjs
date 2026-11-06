/**
 * 手机首屏体检：用真机 UA + 真实公网路径量一次「进入 DSH」到底传了多少字节、多久出首屏。
 *
 * 依赖一个可用的 CDP 端点（用环境变量 CDP 指定）。
 *
 *   KEY=<门禁口令> TOKEN=<dsh token> node tools/measure.mjs
 *   URL=http://127.0.0.1:3080/ TOKEN=xxx node tools/measure.mjs     # 量本机回环做对照
 *
 * 输出两组：冷启动（清缓存）与热启动（沿用缓存），各自给出字节数、请求数、FCP/DCL/load 与最大十项。
 */
const CDP = process.env.CDP || ''
const URL_BASE = process.env.URL || 'https://home.43-155-239-141.sslip.io/'
const KEY = process.env.KEY || ''
const TOKEN = process.env.TOKEN || ''
const WAIT_MS = Number(process.env.WAIT_MS || 45000)

if (TOKEN === '') {
  console.error('必须提供 TOKEN（DSH 会话 token，可在 journalctl -u dsh-web 里看到）')
  process.exit(2)
}
if (CDP === '') {
  console.error('必须提供 CDP（浏览器调试端点，例如 CDP=http://127.0.0.1:9222）')
  process.exit(2)
}

const HOST = new URL(URL_BASE).hostname

async function newTarget() {
  const res = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })
  if (!res.ok) throw new Error(`新建 target 失败 ${res.status}（chrome-cdp start 了吗？）`)
  return res.json()
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (p !== undefined) {
        pending.delete(msg.id)
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
      }
      return
    }
    events.push(msg)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send, events }
}

async function run({ label, cold }) {
  const target = await newTarget()
  const { ws, send, events } = connect(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  await send('Page.enable')
  await send('Network.enable')
  await send('Runtime.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: cold })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
  })
  if (KEY !== '') {
    await send('Network.setCookie', { name: 'dsh_gate', value: KEY, domain: HOST, path: '/', secure: true, httpOnly: true })
  }

  const t0 = Date.now()
  const sep = URL_BASE.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: `${URL_BASE}${sep}token=${encodeURIComponent(TOKEN)}` })
  await new Promise((r) => setTimeout(r, WAIT_MS))

  const reqs = new Map()
  for (const e of events) {
    if (e.method === 'Network.requestWillBeSent') {
      reqs.set(e.params.requestId, { url: e.params.request.url, ts: e.params.timestamp })
    } else if (e.method === 'Network.responseReceived') {
      const r = reqs.get(e.params.requestId)
      if (r !== undefined) {
        r.status = e.params.response.status
        r.proto = e.params.response.protocol
        r.mime = e.params.response.mimeType
      }
    } else if (e.method === 'Network.loadingFinished') {
      const r = reqs.get(e.params.requestId)
      if (r !== undefined) { r.bytes = e.params.encodedDataLength; r.end = e.params.timestamp }
    }
  }
  const rows = [...reqs.values()]
  const total = rows.reduce((s, r) => s + (r.bytes || 0), 0) / 1048576
  const perf = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      fcp: Math.round((performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')||{}).startTime||0),
      dcl: Math.round((performance.getEntriesByType('navigation')[0]||{}).domContentLoadedEventEnd||0),
      load: Math.round((performance.getEntriesByType('navigation')[0]||{}).loadEventEnd||0),
      proto: (performance.getEntriesByType('resource')[0]||{}).nextHopProtocol || '',
      text: (document.body ? document.body.innerText : '').slice(0, 120),
    })`,
    returnByValue: true,
  })

  console.log(`\n=== ${label}（${cold ? '清缓存' : '沿用缓存'}）`)
  console.log(`请求 ${rows.length} 个 · 传输 ${total.toFixed(2)} MiB · 墙钟 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  const p = JSON.parse(perf.result.value)
  const why = html => /探索未至之境|DeepSeek Harness/.test(html) ? '已渲染' : '未渲染'
  console.log(`FCP ${p.fcp}ms · DCL ${p.dcl}ms · load ${p.load}ms · ${why(p.text)}`)
  rows.sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
  for (const r of rows.slice(0, 10)) {
    const kb = ((r.bytes || 0) / 1024).toFixed(0).padStart(6)
    const ms = r.end !== undefined ? ((r.end - r.ts) * 1000).toFixed(0).padStart(6) : '     -'
    console.log(`  ${String(r.status).padEnd(4)} ${kb}KB ${ms}ms ${String(r.proto || '').padEnd(8)} ${r.url.slice(0, 84)}`)
  }

  await fetch(`${CDP}/json/close/${target.id}`)
  ws.close()
  return { total, rows: rows.length, ...p }
}

const cold = await run({ label: '冷启动', cold: true })
const warm = await run({ label: '热启动', cold: false })

console.log('\n--- 汇总')
console.log(`冷启动 ${cold.total.toFixed(2)} MiB / FCP ${cold.fcp}ms · 热启动 ${warm.total.toFixed(2)} MiB / FCP ${warm.fcp}ms`)
process.exit(0)
