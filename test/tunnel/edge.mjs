/**
 * 边缘层回归测试：在 127.0.0.1:18443 起一个边缘，上游是真实的 DSH（127.0.0.1:3080）。
 *
 *   DSH_COOKIE='dsh-auth-...=v1...' node test/edge.mjs
 *
 * 覆盖：
 *   1. h2 / h1 都能拿到上游响应（ALPN 分流正确）
 *   2. /assets/* 带上 immutable
 *   3. /dsh-genui/runtime.js 第一次 200 + ETag，第二次带 If-None-Match 回 304
 *   4. WebSocket 升级能穿过去（DSH 的 mux 通道）
 *   5. 门禁：无 Cookie → 401 页面；?k= → 303 + Set-Cookie
 */
import tls from 'node:tls'
import http from 'node:http'
import http2 from 'node:http2'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'
import { createEdge } from '../../lib/tunnel/edge.mjs'

const PORT = Number(process.env.EDGE_PORT || 18443)
const GATE = process.env.GATE || 'test-gate-key'
const COOKIE = process.env.DSH_COOKIE || ''
const HOST = process.env.HOST_HEADER || 'home.43-155-239-141.sslip.io'
const CERT = process.env.CERT || path.join(os.homedir(), '.config/dsh-tunnel/cert/le-chain.crt')
const KEY = process.env.KEY || path.join(os.homedir(), '.config/dsh-tunnel/cert/le.key')

let pass = 0
let fail = 0
function ok(name, extra = '') { pass += 1; console.log(`PASS ${name}${extra ? '  ' + extra : ''}`) }
function bad(name, why) { fail += 1; console.log(`FAIL ${name}  ${why}`) }

const edge = createEdge({
  targetHost: '127.0.0.1', targetPort: 3080, gateKey: GATE,
  getDshToken: () => '', log: (...a) => console.log('[edge]', ...a), dbg: false,
})

const tlsServer = tls.createServer({
  cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY),
  ALPNProtocols: ['h2', 'http/1.1'],
}, (socket) => edge.handleSocket(socket))

await new Promise((r) => tlsServer.listen(PORT, '127.0.0.1', r))
// 生产环境 agent 启动后会自动预热，测试也照做，否则首个请求走的是冷路径（不返回 ETag）
await edge.warm()
console.log(`edge listening on ${PORT}`)

// ---------------------------------------------------------------- h2 客户端
function h2request(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://127.0.0.1:${PORT}`, { rejectUnauthorized: false, servername: HOST })
    client.on('error', reject)
    const req = client.request({ ':path': pathname, ':method': 'GET', ':authority': HOST, ...headers })
    let status = 0
    let hdrs = {}
    const chunks = []
    req.on('response', (h) => { status = h[':status']; hdrs = h })
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { client.close(); resolve({ status, headers: hdrs, body: Buffer.concat(chunks) }) })
    req.on('error', (e) => { client.close(); reject(e) })
    req.end()
  })
}

function h1request(pathname, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: pathname, method,
      createConnection: () => tls.connect({
        host: '127.0.0.1', port: PORT, servername: HOST, rejectUnauthorized: false,
        ALPNProtocols: ['http/1.1'],
      }),
      headers: { host: HOST, ...headers },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

const gateCookie = `dsh_gate=${GATE}`
const authHeader = { cookie: [gateCookie, COOKIE].filter(Boolean).join('; ') }

// 1. ALPN 分流
try {
  const r = await h2request('/', authHeader)
  if (r.status === 200 && r.body.length > 1000) ok('h2 代理到 DSH', `${r.status} ${r.body.length}B`)
  else bad('h2 代理到 DSH', `status=${r.status} len=${r.body.length}`)
} catch (e) { bad('h2 代理到 DSH', e.message) }

try {
  const r = await h1request('/', { headers: authHeader })
  if (r.status === 200) ok('h1 代理到 DSH', `${r.status}`)
  else bad('h1 代理到 DSH', `status=${r.status}`)
} catch (e) { bad('h1 代理到 DSH', e.message) }

// 2. 静态资源 immutable
try {
  const r = await h2request('/assets/index-BXV-oxvX.js', authHeader)
  const cc = r.headers['cache-control'] || ''
  if (r.status === 200 && /immutable/.test(cc)) ok('/assets/* 带 immutable', cc)
  else bad('/assets/* 带 immutable', `status=${r.status} cc=${cc}`)
} catch (e) { bad('/assets/* 带 immutable', e.message) }

// 3. genui 运行时 ETag / 304
try {
  const first = await h2request('/dsh-genui/runtime.js', { ...authHeader, 'accept-encoding': 'gzip' })
  const etag = first.headers.etag
  if (!etag) { bad('genui ETag', 'no etag') }
  else {
    const second = await h2request('/dsh-genui/runtime.js', { ...authHeader, 'accept-encoding': 'gzip', 'if-none-match': etag })
    if (second.status === 304 && second.body.length === 0) ok('genui 条件请求 304', `etag=${etag.slice(0, 16)}… 首包=${(first.body.length / 1024).toFixed(0)}KB`)
    else bad('genui 条件请求 304', `status=${second.status} body=${second.body.length}`)
  }
  const br = await h2request('/dsh-genui/runtime.js', { ...authHeader, 'accept-encoding': 'br' })
  const enc = br.headers['content-encoding']
  if (br.status === 200 && enc === 'br') ok('genui 走 brotli', `wire=${(br.body.length / 1024).toFixed(0)}KB`)
  else bad('genui 走 brotli', `status=${br.status} enc=${enc}`)
} catch (e) { bad('genui 条件请求', e.message) }

// 4. WebSocket 穿越
try {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${PORT}/api/remote.mux`, {
      rejectUnauthorized: false,
      headers: { host: HOST, ...authHeader },
    })
    const t = setTimeout(() => reject(new Error('timeout')), 6000)
    ws.on('open', () => { clearTimeout(t); ws.close(); resolve() })
    ws.on('unexpected-response', (_q, res) => { clearTimeout(t); reject(new Error(`http ${res.statusCode}`)) })
    ws.on('error', (e) => { clearTimeout(t); reject(e) })
  })
  ok('WebSocket 升级穿越')
} catch (e) { bad('WebSocket 升级穿越', e.message) }

// 4b. SSE 不被缓冲（流式接口必须边到边转发）
try {
  await new Promise((resolve, reject) => {
    const client = http2.connect(`https://127.0.0.1:${PORT}`, { rejectUnauthorized: false, servername: HOST })
    const req = client.request({ ':path': '/plugins/events', ':method': 'GET', ':authority': HOST, ...authHeader })
    const t = setTimeout(() => { client.close(); reject(new Error('3s 内没有收到任何字节（被缓冲了）')) }, 3000)
    let got = 0
    req.on('data', (c) => {
      got += c.length
      if (got > 16) { clearTimeout(t); client.close(); resolve() }
    })
    req.on('response', () => {})
    req.on('error', (e) => { clearTimeout(t); reject(e) })
    req.end()
  })
  ok('SSE 流式转发')
} catch (e) { bad('SSE 流式转发', e.message) }

// 4c. 客户端中途取消流：边缘必须活着（曾经会因为 respond 抛 ERR_HTTP2_INVALID_STREAM 把进程带走）
try {
  await new Promise((resolve) => {
    const client = http2.connect(`https://127.0.0.1:${PORT}`, { rejectUnauthorized: false, servername: HOST })
    const req = client.request({ ':path': '/plugins/events', ':method': 'GET', ':authority': HOST, ...authHeader })
    req.on('error', () => {})
    setTimeout(() => {
      req.close(http2.constants.NGHTTP2_CANCEL)
      client.close()
      resolve()
    }, 300)
    req.end()
  })
  // 给边缘一点时间处理取消事件
  await new Promise((r) => setTimeout(r, 500))
  const after = await h1request('/', { headers: authHeader })
  if (after.status === 200) ok('客户端取消流后边缘仍存活')
  else bad('客户端取消流后边缘仍存活', `status=${after.status}`)
} catch (e) { bad('客户端取消流后边缘仍存活', e.message) }

// 5. 门禁
try {
  const r = await h2request('/', { 'accept': 'text/html' })
  if (r.status === 401 && /访问口令/.test(r.body.toString())) ok('门禁拦未授权')
  else bad('门禁拦未授权', `status=${r.status}`)
} catch (e) { bad('门禁拦未授权', e.message) }

try {
  const r = await h2request(`/?k=${GATE}`, { 'accept': 'text/html' })
  const sc = String(r.headers['set-cookie'] || '')
  if (r.status === 303 && sc.includes('dsh_gate=')) ok('?k= 种 Cookie 并跳转', `location=${r.headers.location}`)
  else bad('?k= 种 Cookie 并跳转', `status=${r.status} sc=${sc.slice(0, 40)}`)
} catch (e) { bad('?k= 种 Cookie 并跳转', e.message) }

try {
  const r = await h2request('/manifest.webmanifest', {})
  if (r.status === 200 && /application\/manifest/.test(String(r.headers['content-type']))) ok('manifest 免门禁')
  else bad('manifest 免门禁', `status=${r.status}`)
} catch (e) { bad('manifest 免门禁', e.message) }

console.log(`\n统计: ${JSON.stringify(edge.stats)}`)
edge.close()
tlsServer.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
