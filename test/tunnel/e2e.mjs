/**
 * 端到端回归测试：直接打真实入口，验证穿过隧道后 HTTP / SSE / WebSocket 三种语义都成立。
 *
 *   node test/e2e.mjs                       # 用默认地址
 *   BASE=https://home.<域> GATE=<口令> node test/e2e.mjs
 *
 * 覆盖：
 *   1. 无口令 → 401（门禁生效）
 *   2. 带口令 → 200，且拿到 DSH 页面
 *   3. SSE 流式接口能持续吐字节（验证没有被缓冲住）
 *   4. WebSocket 能升级并收到首帧（验证 mux 通道）
 *   5. 20 条并发全部 200（验证多通道不串流）
 *
 * 退出码非 0 表示有用例失败。
 */
import http from 'node:http'
import zlib from 'node:zlib'
import https from 'node:https'
import http2 from 'node:http2'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'

const BASE = process.env.BASE || 'https://home.43-155-239-141.sslip.io'
const GATE = process.env.GATE || process.env.GATE_KEY || ''
const TIMEOUT = Number(process.env.TIMEOUT || 40000)  // 链路上 1.27MB 的 br 包要几秒，15s 太紧

if (GATE === '') {
  console.error('必须提供 GATE（门禁口令），例如 GATE=xxxx node test/e2e.mjs')
  process.exit(2)
}

const u = new URL(BASE)
const isHttps = u.protocol === 'https:'
const mod = isHttps ? https : http
const host = u.hostname
const port = Number(u.port || (isHttps ? 443 : 80))

let pass = 0
let fail = 0
const results = []
function ok(name, extra = '') { pass += 1; results.push(['PASS', name, extra]) }
function bad(name, why) { fail += 1; results.push(['FAIL', name, why]) }

/** 发一个请求，返回 { status, headers, body } */
function request(path, { cookie, method = 'GET', stream = false, body, headers: extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = mod.request({
      host, port, path, method,
      servername: host,
      rejectUnauthorized: false,
      headers: {
        host,
        ...(cookie ? { cookie } : {}),
        'user-agent': 'dsh-tunnel-e2e',
        'accept-encoding': 'br, gzip',
        ...extraHeaders,
      },
      timeout: TIMEOUT,
    }, (res) => {
      if (stream) { resolve({ status: res.statusCode, headers: res.headers, res }); return }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let buf = Buffer.concat(chunks)
        const enc = String(res.headers['content-encoding'] || '').toLowerCase()
        try {
          if (enc === 'gzip') buf = zlib.gunzipSync(buf)
          else if (enc === 'br') buf = zlib.brotliDecompressSync(buf)
          else if (enc === 'deflate') buf = zlib.inflateSync(buf)
        } catch { /* 留着原始字节，交给断言去报 */ }
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8'), raw: buf })
      })
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.end(body)
  })
}

/** 跟随重定向并累积 Cookie（入口会先 303 到 ?token= 换 DSH 会话） */
async function follow(path, cookie, hops = 0) {
  const r = await request(path, { cookie })
  const sc = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0])
  const merged = [cookie, ...sc].filter(Boolean).join('; ')
  const loc = r.headers.location
  if (loc && r.status >= 300 && r.status < 400 && hops < 5) {
    const next = new URL(loc, BASE)
    return follow(next.pathname + next.search, merged, hops + 1)
  }
  return { ...r, cookie: merged }
}

async function main() {
  // 1) 门禁
  try {
    const r = await request('/')
    if (r.status === 401) ok('门禁：无口令被拒', '401')
    else bad('门禁：无口令被拒', `期望 401，实得 ${r.status}`)
  } catch (e) { bad('门禁：无口令被拒', e.message) }

  // 2) 口令换 Cookie
  let cookie = ''
  try {
    const r = await request(`/?k=${encodeURIComponent(GATE)}`)
    const setCookie = r.headers['set-cookie'] || []
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
    if (r.status === 303 && cookie.includes('dsh_gate=')) ok('口令换 Cookie', '303')
    else bad('口令换 Cookie', `期望 303+Set-Cookie，实得 ${r.status} / ${cookie || '无 cookie'}`)
  } catch (e) { bad('口令换 Cookie', e.message) }

  // 3) 跟随重定向打开首页，拿到 DSH 会话 Cookie
  try {
    const r = await follow('/', cookie)
    cookie = r.cookie || cookie
    if (r.status === 200 && /DeepSeek Harness/i.test(r.body)) ok('首页', `200 / ${r.body.length} 字节`)
    else bad('首页', `期望 200+页面，实得 ${r.status} / ${String(r.body).slice(0, 60)}`)
  } catch (e) { bad('首页', e.message) }

  // 4) SSE：必须能持续吐字节而不是被缓冲
  try {
    const r = await request('/plugins/events', { cookie, stream: true })
    const ctype = String(r.headers['content-type'] || '')
    if (!/text\/event-stream/.test(ctype)) {
      bad('SSE', `content-type=${ctype || '(空)'} status=${r.status}`)
      r.res.destroy()
    } else {
      const got = await new Promise((resolve) => {
        let bytes = 0
        const timer = setTimeout(() => { r.res.destroy(); resolve(bytes) }, 3000)
        r.res.on('data', (c) => {
          bytes += c.length
          if (bytes > 0) { clearTimeout(timer); r.res.destroy(); resolve(bytes) }
        })
        r.res.on('error', () => { clearTimeout(timer); resolve(bytes) })
      })
      if (got > 0) ok('SSE 流式', `收到 ${got} 字节`)
      else bad('SSE 流式', '3 秒内没有收到任何字节（可能被缓冲）')
    }
  } catch (e) { bad('SSE 流式', e.message) }

  // 5) WebSocket 升级
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/remote.mux`, {
        headers: { host, cookie, origin: BASE },
        rejectUnauthorized: false,
        handshakeTimeout: TIMEOUT,
      })
      const timer = setTimeout(() => { try { ws.terminate() } catch { /* noop */ } ; reject(new Error('10s 内既没连上也没报错')) }, TIMEOUT)
      ws.on('open', () => { clearTimeout(timer); ok('WebSocket 升级', 'open'); try { ws.close() } catch { /* noop */ } ; resolve() })
      ws.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  } catch (e) { bad('WebSocket 升级', e.message) }

  // 5b) HTTP/2 协商：边缘必须把 h2 摆到 ALPN 上
  try {
    const r = await new Promise((resolve, reject) => {
      const client = http2.connect(BASE, { servername: host, rejectUnauthorized: false })
      client.on('error', reject)
      const req = client.request({ ':path': '/', ':method': 'GET', ':authority': host, cookie, accept: 'text/html' })
      let status = 0
      let bytes = 0
      req.on('response', (h) => { status = h[':status'] })
      req.on('data', (c) => { bytes += c.length })
      req.on('end', () => { client.close(); resolve({ status, bytes }) })
      req.on('error', (e) => { client.close(); reject(e) })
      req.end()
    })
    if (r.status === 200 && r.bytes > 1000) ok('HTTP/2 协商', `200 / ${r.bytes} 字节`)
    else bad('HTTP/2 协商', `status=${r.status} bytes=${r.bytes}（没协商上 h2 就是退回 1.1 了）`)
  } catch (e) { bad('HTTP/2 协商', e.message) }

  // 5c) 内容寻址静态资源必须可永久缓存
  try {
    const r = await request('/assets/index-BXV-oxvX.js', { cookie })
    const cc = String(r.headers['cache-control'] || '')
    if (r.status === 200 && /immutable/.test(cc)) ok('静态资源 immutable', cc)
    else bad('静态资源 immutable', `status=${r.status} cache-control=${cc || '(空)'}`)
  } catch (e) { bad('静态资源 immutable', e.message) }

  // 5d) 6MB 的 genui 运行时：第二次必须走 304
  try {
    // 先热一次：agent 重启后第一个请求走的是「放行给上游 + 后台预热」的冷路径，
    // 那一次本来就不带 ETag（这是设计，不是 bug）
    await request('/dsh-genui/runtime.js', { cookie })
    const first = await request('/dsh-genui/runtime.js', { cookie })
    const etag = String(first.headers.etag || '')
    if (etag === '') { bad('genui 条件请求', '响应没有 ETag') } else {
      const second = await request('/dsh-genui/runtime.js', { cookie, headers: { 'if-none-match': etag } })
      if (second.status === 304) ok('genui 条件请求', `304 / etag ${etag.slice(0, 14)}…`)
      else bad('genui 条件请求', `期望 304，实得 ${second.status}`)
    }
  } catch (e) { bad('genui 条件请求', e.message) }

  // 5e) 会话列表：已归档的必须被边缘剔掉
  try {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'e2e', method: 'session/list', payload: { args: { _request: {} } } })
    const r = await request('/api/session/list', {
      cookie, method: 'POST', headers: { 'content-type': 'application/json' }, body,
    })
    if (r.status !== 200) { bad('会话列表裁剪', `status=${r.status}`) } else {
      const doc = JSON.parse(r.body)
      const items = doc?.result?.value?.items
      if (!Array.isArray(items) || items.length === 0) { bad('会话列表裁剪', '结构不对或空列表') } else {
        let archived = new Set()
        try {
          const ws = JSON.parse(readFileSync(join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'workspace.json'), 'utf8'))
          archived = new Set(ws?.global?.archivedSessionIds ?? [])
        } catch { /* 没有归档文件就不校验这一条 */ }
        const leaked = items.filter((i) => archived.has(i.sessionId))
        if (leaked.length > 0) bad('会话列表裁剪', `仍有 ${leaked.length} 条归档会话漏出`)
        else ok('会话列表裁剪', `${items.length} 条 / ${(Buffer.byteLength(r.raw ?? r.body) / 1024).toFixed(0)}KB`)
      }
    }
  } catch (e) { bad('会话列表裁剪', e.message) }

  // 6) 并发
  try {
    const N = 20
    const all = await Promise.all(Array.from({ length: N }, () => request('/', { cookie }).catch((e) => ({ status: 'ERR:' + e.message }))))
    const good = all.filter((r) => r.status === 200).length
    if (good === N) ok('并发 20 条', `${good}/${N}`)
    else bad('并发 20 条', `${good}/${N} 成功，失败样本：${JSON.stringify(all.filter((r) => r.status !== 200).slice(0, 3).map((r) => r.status))}`)
  } catch (e) { bad('并发 20 条', e.message) }

  for (const [s, name, extra] of results) console.log(`  ${s === 'PASS' ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
  console.log(`\n  ${pass} 通过 / ${fail} 失败`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('测试崩溃：', e); process.exit(3) })
