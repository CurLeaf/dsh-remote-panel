/**
 * 边缘层：TLS 握手之后的那一层。
 *
 * 以前这里是「解析第一行 HTTP → 过门禁 → 剩下的字节原样灌给 DSH」。
 * 那样做只有一个毛病：一条浏览器连接 = 一条上游连接，浏览器对同源只开 6 条，
 * 于是 4MB 的插件大礼包会把会话列表这种小请求堵在队列里十几秒。
 *
 * 现在改成真正的反向代理：
 *   - TLS 按 ALPN 分流：h2 进 http2 server，其余进 http server（WebSocket 走这里）
 *   - 上游连接池复用，不再「一条浏览器连接换一条上游连接」
 *   - 顺手补上缓存语义：内容寻址的静态资源给 immutable，genui 运行时给 ETag，
 *     重复进入只花几百字节而不是 2.6MB
 *
 * 门禁、PWA 资源、?k= 换 Cookie 这些行为逐个保留，语义与改造前一致。
 */
import http from 'node:http'
import http2 from 'node:http2'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { createArchiveIndex, filterSessionList } from './archive.mjs'

/** 逐跳头：不能跨代理转发。 */
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

/** 内容寻址的静态资源：文件名里带 8 位以上 hash，改内容必改名，可以永久缓存。 */
const HASHED_ASSET = /^\/assets\/[^/]*-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs|woff2?|ttf|png|jpe?g|svg|webp|ico)$/

/** 这个文件 6MB、且上游给的是 no-cache；由边缘持有内容并回 304。 */
const SMART_CACHE_PATH = '/dsh-genui/runtime.js'
/** 会话列表：DSH 一次返回全部可见会话，边缘把已归档的剔掉再发。 */
const SESSION_LIST_PATH = '/api/session/list'
/** 请求体上限：只用来转发 RPC 参数，超了就不碰。 */
const BODY_CAP = 256 * 1024
/** 上游内容的复用窗口：超过就重新取一次，防止插件升级后一直发旧字节。 */
const SMART_CACHE_TTL = 10 * 60 * 1000

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
<rect width="192" height="192" rx="42" fill="#151517"/>
<path d="M56 96l26 26 54-54" fill="none" stroke="#4ade80" stroke-width="14"
 stroke-linecap="round" stroke-linejoin="round"/></svg>`

const ASSET_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets')
const assetCache = new Map()
/** 图标可以永久缓存；APK 与版本清单必须每次读盘，否则换包后不重启不生效。 */
const VOLATILE_ASSETS = new Set(['app.apk', 'version.json'])

function readAsset(name) {
  if (!VOLATILE_ASSETS.has(name) && assetCache.has(name)) return assetCache.get(name)
  try {
    const b = fs.readFileSync(path.join(ASSET_DIR, name))
    if (!VOLATILE_ASSETS.has(name)) assetCache.set(name, b)
    return b
  } catch { return null }
}

// 最小 Service Worker：只为让浏览器认定「可安装」。
// 刻意不缓存任何内容——介入 DSH 的请求只会带来诡异问题。
const SW_JS = `self.addEventListener('install', function(e){ e.skipWaiting() });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()) });
self.addEventListener('fetch', function(){ });   // 不调 respondWith = 直连网络
`

function manifestFor(host) {
  return JSON.stringify({
    name: `DSH · ${host}`,
    short_name: 'DSH',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#151517',
    theme_color: '#151517',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  })
}

function portalHtml(host, { wrong = false, consoleUrl = '' } = {}) {
  const consoleLink = consoleUrl === ''
    ? ''
    : `<p class="hint"><a href="${consoleUrl}">设备控制台</a></p>`
  const tip = wrong
    ? '<p class="err">口令不对，再试一次。</p>'
    : '<p class="hint">这台设备还没有通过门禁。</p>'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#151517">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon-192.png">
<title>DSH · ${host}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
background:#151517;color:#e8e8ea;font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;padding:24px}
main{width:100%;max-width:360px}
h1{font-size:19px;font-weight:600;margin:0 0 6px}
.host{color:#8b8b90;font-size:13px;margin:0 0 22px}
input{width:100%;padding:14px 16px;border-radius:12px;border:1px solid #333338;background:#1e1e21;
color:#e8e8ea;font-size:17px;outline:none}
input:focus{border-color:#4ade80}
button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;background:#4ade80;
color:#0c1a12;font-size:16px;font-weight:600}
.hint{color:#8b8b90;font-size:13px;margin:18px 0 0}
.err{color:#f87171;font-size:14px;margin:0 0 14px}
a{color:#4ade80}
</style></head><body><main>
<h1>DeepSeek Harness</h1>
<p class="host">${host}</p>
${tip}
<form method="get" action="/">
  <input name="k" type="password" inputmode="text" autocomplete="off"
   placeholder="输入访问口令" autofocus>
  <button type="submit">进入</button>
</form>
${consoleLink}
</main></body></html>`
}

/** 把上游响应头里不能跨代理的部分摘掉。 */
function cleanHeaders(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

/** 上游没给缓存策略时，按 URL 形状补一条；给了就尊重上游。 */
function cachePolicyFor(pathname) {
  if (HASHED_ASSET.test(pathname)) return 'public, max-age=31536000, immutable'
  return null
}

function parseTarget(target) {
  const qi = target.indexOf('?')
  const pathname = qi === -1 ? target : target.slice(0, qi)
  const search = qi === -1 ? '' : target.slice(qi)
  return { pathname, search, params: new URLSearchParams(qi === -1 ? '' : target.slice(qi + 1)) }
}

/**
 * @param {object} opts
 * @param {string} opts.targetHost 上游地址
 * @param {number} opts.targetPort 上游端口
 * @param {string} opts.gateKey 门禁口令，空串表示不设门禁
 * @param {() => string} opts.getDshToken 取当前 DSH 会话 token（用于免密跳转）
 * @param {(...a: any[]) => void} opts.log 日志
 * @param {boolean} opts.dbg 调试开关
 */
export function createEdge(opts) {
  const { targetHost, targetPort, gateKey, getDshToken, log, dbg } = opts
  const consoleUrl = (process.env.CONSOLE_URL || '').trim()

  // 上游就是本机回环：实测 100 条请求 keep-alive 71~108ms、每次新建 90~94ms，池化没有收益。
  // 而池化会撞上 DSH 的 5s keepalive 关闭竞态（复用一条正要被对端关掉的 socket → 请求挂住），
  // 所以这里明确不用连接池。
  const agent = false

  const stats = { h1: 0, h2: 0, proxied: 0, smart304: 0, smartBody: 0, sessionKept: 0, sessionRemoved: 0 }

  const archiveIndex = createArchiveIndex({ onError: (message) => log(message) })

  // ---------------------------------------------------------------- 门禁判定
  /**
   * 纯函数式判定：给出请求该由边缘自己回、还是转给 DSH。
   * @returns {{kind:'respond',status:number,headers:object,body:Buffer|string}|{kind:'proxy'}}
   */
  function decide(ctx) {
    const { pathname, params, headers, host, method } = ctx
    if (gateKey === '') return { kind: 'proxy' }
    const cookie = headers.cookie || ''

    // PWA 资源：不需要口令
    if (pathname === '/manifest.webmanifest') {
      const body = manifestFor(host)
      return {
        kind: 'respond', status: 200, body,
        headers: { 'content-type': 'application/manifest+json', 'cache-control': 'max-age=86400' },
      }
    }
    // 版本清单：App 启动时查它决定要不要提示更新。公开无害（只有版本号）。
    if (pathname === '/version.json') {
      const buf = readAsset('version.json')
      if (buf === null) return { kind: 'respond', status: 404, body: 'no version manifest\n', headers: { 'content-type': 'text/plain; charset=utf-8' } }
      return { kind: 'respond', status: 200, body: buf, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
    }
    if (pathname === '/sw.js') {
      return {
        kind: 'respond', status: 200, body: SW_JS,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-cache',
          'service-worker-allowed': '/',
        },
      }
    }
    if (pathname === '/icon-192.png' || pathname === '/icon-512.png') {
      const buf = readAsset(pathname.slice(1))
      if (buf === null) return { kind: 'respond', status: 404, body: 'not found\n', headers: { 'content-type': 'text/plain' } }
      return { kind: 'respond', status: 200, body: buf, headers: { 'content-type': 'image/png', 'cache-control': 'max-age=86400' } }
    }
    if (pathname === '/icon.svg') {
      return { kind: 'respond', status: 200, body: ICON_SVG, headers: { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400' } }
    }

    // 下载 Android 壳。两种放行方式：
    //   1) 已过门禁（浏览器里点）
    //   2) 带 ?k=<口令>（App 内的 DownloadManager 不带 WebView 的 Cookie，只能走这个）
    if (pathname === '/app.apk' && (params.get('k') === gateKey || cookie.includes(`dsh_gate=${gateKey}`))) {
      const buf = readAsset('app.apk')
      if (buf === null) return { kind: 'respond', status: 404, body: 'app not built\n', headers: { 'content-type': 'text/plain' } }
      return {
        kind: 'respond', status: 200, body: buf,
        headers: {
          'content-type': 'application/vnd.android.package-archive',
          'content-disposition': 'attachment; filename="dsh-pocket.apk"',
          'cache-control': 'no-store',
        },
      }
    }

    if (params.get('k') === gateKey) {
      // 合并前两跳：种门禁 Cookie 的同时直接跳去换 DSH 会话，
      // 避免「先跳 / 再跳 ?token=」多一次 TCP+TLS 握手（每跳约 200ms）。
      const explicit = params.get('token')
      const token = explicit || getDshToken()
      const loc = token !== '' ? `/?token=${encodeURIComponent(token)}` : '/'
      return {
        kind: 'respond', status: 303,
        body: '',
        headers: {
          'set-cookie': `dsh_gate=${gateKey}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`,
          location: loc,
        },
      }
    }

    if (!cookie.includes(`dsh_gate=${gateKey}`)) {
      const wantsHtml = /text\/html/.test(headers.accept || '')
      if (wantsHtml) {
        const body = portalHtml(host, { wrong: params.has('k'), consoleUrl })
        return {
          kind: 'respond', status: 401, body,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        }
      }
      return {
        kind: 'respond', status: 401, body: 'dsh-tunnel: access key required\n',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }
    }

    const hasDshCookie = /(^|;\s*)dsh-auth-/.test(cookie)
    const token = getDshToken()
    if (token !== '' && !hasDshCookie && pathname === '/' && !params.has('token')) {
      return {
        kind: 'respond', status: 303, body: '',
        headers: { location: `/?token=${encodeURIComponent(token)}` },
      }
    }
    return { kind: 'proxy' }
  }

  // ---------------------------------------------------------------- smart cache
  /**
   * 给 6MB 的 genui 运行时做条件请求：
   * 浏览器第一次拿到 ETag，之后每次进入只发一个 304 的往返（约 150 字节）。
   */
  const smart = { etag: '', body: null, at: 0, enc: new Map(), loading: null, lastTry: 0 }

  function fetchSmart() {
    if (smart.loading !== null) return smart.loading
    smart.lastTry = Date.now()
    smart.loading = new Promise((resolve) => {
      const req = http.request({
        host: targetHost, port: targetPort, path: SMART_CACHE_PATH, method: 'GET',
        headers: { host: opts.hostHeader || 'localhost', 'accept-encoding': 'identity' },
        agent,
      }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null) }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          smart.body = body
          smart.etag = `"${createHash('sha1').update(body).digest('base64url')}"`
          smart.at = Date.now()
          // 顺手把两种压缩结果算好，热路径上不再让事件循环干重活
          smart.enc = new Map([
            ['gzip', zlib.gzipSync(body, { level: 6 })],
            ['br', zlib.brotliCompressSync(body, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
              },
            })],
          ])
          resolve({ body })
        })
      })
      req.on('error', () => resolve(null))
      req.end()
    }).finally(() => { smart.loading = null })
    return smart.loading
  }

  function encodeFor(encoding) {
    if (encoding === 'identity') return smart.body
    const hit = smart.enc.get(encoding)
    return hit !== undefined ? hit : smart.body
  }

  function pickEncoding(acceptEncoding) {
    const ae = String(acceptEncoding || '')
    if (/\bbr\b/.test(ae)) return 'br'
    if (/\bgzip\b/.test(ae)) return 'gzip'
    return 'identity'
  }

  /**
   * 给 6MB 的 genui 运行时做条件请求。
   * 冷的时候**不**在这里等：直接放行给上游（上游会按 accept-encoding 压好），
   * 同时在后台把内容抓下来。等下一次进入时，这里就只剩一个 304 的往返。
   * @returns {Promise<{status:number,headers:object,body:Buffer}|null>} null 表示交给上游
   */
  async function serveSmart(ctx) {
    const fresh = smart.body !== null && Date.now() - smart.at < SMART_CACHE_TTL
    if (!fresh) {
      // 失败也别每次请求都去抓一遍
      if (Date.now() - smart.lastTry > 30_000) fetchSmart()
      return null
    }
    const inm = String(ctx.headers['if-none-match'] || '')
    if (inm !== '' && inm.split(',').some((t) => t.trim() === smart.etag)) {
      stats.smart304 += 1
      return {
        status: 304, body: Buffer.alloc(0),
        headers: { etag: smart.etag, 'cache-control': 'no-cache', vary: 'accept-encoding' },
      }
    }
    stats.smartBody += 1
    const encoding = pickEncoding(ctx.headers['accept-encoding'])
    const headers = {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      etag: smart.etag,
      vary: 'accept-encoding',
    }
    if (encoding !== 'identity') headers['content-encoding'] = encoding
    return { status: 200, headers, body: encodeFor(encoding) }
  }

  // ---------------------------------------------------------------- 会话列表裁剪
  /** 收集请求体（小 RPC 参数）；超过上限就只留头部，由调用方判空。 */
  function collectBody(stream) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      stream.on('data', (c) => { size += c.length; if (size <= BODY_CAP) chunks.push(c) })
      stream.on('end', () => resolve(size <= BODY_CAP ? Buffer.concat(chunks) : null))
      stream.on('error', reject)
    })
  }

  function compressBuffer(buf, encoding) {
    if (encoding === 'br') {
      return zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      })
    }
    if (encoding === 'gzip') return zlib.gzipSync(buf, { level: 6 })
    return buf
  }

  /**
   * 代理 `session/list` 并在返回前剔除已归档会话。
   * 上游要 identity：要么我们读到 JSON 才能过滤，要么原样转发。
   * @returns {Promise<{status:number,headers:object,body:Buffer|null}>} body 为 null 表示请求体过大，走原样代理
   */
  async function serveSessionList(ctx, reqBody) {
    if (reqBody === null) return { status: 0, headers: {}, body: null }
    const upRes = await new Promise((resolve, reject) => {
      const up = http.request({
        host: targetHost, port: targetPort, method: ctx.method, path: ctx.target,
        headers: { ...upstreamHeaders(ctx), 'accept-encoding': 'identity' }, agent,
      }, resolve)
      up.on('error', reject)
      up.end(reqBody)
    })
    const chunks = []
    let total = 0
    for await (const chunk of upRes) {
      chunks.push(chunk)
      total += chunk.length
      if (total > 32 * 1024 * 1024) { upRes.destroy(); break }
    }
    let payload = Buffer.concat(chunks)
    const filtered = filterSessionList(payload, archiveIndex.ids())
    if (filtered !== null) {
      payload = filtered.body
      stats.sessionKept = filtered.kept
      stats.sessionRemoved = filtered.removed
      if (dbg && filtered.removed > 0) {
        log(`会话列表裁剪 保留 ${filtered.kept} 条 / 剔除归档 ${filtered.removed} 条`)
      }
    }
    const encoding = pickEncoding(ctx.headers['accept-encoding'])
    const body = compressBuffer(payload, encoding)
    const headers = cleanHeaders(upRes.headers)
    delete headers['content-encoding']
    headers['content-type'] = headers['content-type'] || 'application/json; charset=utf-8'
    headers['content-length'] = String(body.length)
    headers.vary = 'accept-encoding'
    if (encoding !== 'identity') headers['content-encoding'] = encoding
    return { status: upRes.statusCode || 502, headers, body }
  }

  // ---------------------------------------------------------------- 反向代理
  function upstreamHeaders(ctx) {
    const headers = {}
    for (const [k, v] of Object.entries(ctx.headers)) {
      const lk = k.toLowerCase()
      if (lk.startsWith(':')) continue
      if (HOP_BY_HOP.has(lk)) continue
      headers[lk] = v
    }
    // 转发原始 authority：DSH 的签名 Cookie 绑定 authority，改一个字符就 401
    headers.host = ctx.authority
    return headers
  }

  /** 慢请求留痕：定位「到底慢在边缘→上游，还是边缘→浏览器」。 */
  const SLOW_MS = 1500
  function noteSlow(ctx, startedAt, upstreamAt, bytes) {
    const total = Date.now() - startedAt
    if (total < SLOW_MS) return
    const upstream = upstreamAt === 0 ? -1 : upstreamAt - startedAt
    log(`慢请求 ${ctx.method} ${ctx.pathname} 上游首字节 ${upstream}ms · 全程 ${total}ms · ${(bytes / 1024).toFixed(0)}KB`)
  }

  function proxyHttp1(req, res, ctx) {
    stats.proxied += 1
    const startedAt = Date.now()
    let upstreamAt = 0
    let bytes = 0
    res.on('finish', () => noteSlow(ctx, startedAt, upstreamAt, bytes))
    const up = http.request({
      host: targetHost, port: targetPort, method: req.method, path: ctx.target,
      headers: upstreamHeaders(ctx), agent,
    }, (upRes) => {
      upstreamAt = Date.now()
      if (!alive1(res)) { upRes.destroy(); return }
      const headers = cleanHeaders(upRes.headers)
      const policy = cachePolicyFor(ctx.pathname)
      if (policy !== null && headers['cache-control'] === undefined) headers['cache-control'] = policy
      try {
        res.writeHead(upRes.statusCode || 502, headers)
      } catch {
        upRes.destroy()
        return
      }
      upRes.on('data', (c) => { bytes += c.length })
      upRes.pipe(res)
      upRes.on('error', () => res.destroy())
    })
    up.on('error', () => {
      if (!alive1(res)) { res.destroy(); return }
      try {
        res.writeHead(502, { 'content-type': 'text/plain' })
        res.end('upstream error\n')
      } catch {
        res.destroy()
      }
    })
    req.pipe(up)
    req.on('aborted', () => up.destroy())
    res.on('close', () => { if (!res.writableFinished) up.destroy() })
  }

  function proxyStream(stream, headers, ctx) {
    stats.proxied += 1
    const startedAt = Date.now()
    let upstreamAt = 0
    let bytes = 0
    stream.on('close', () => noteSlow(ctx, startedAt, upstreamAt, bytes))
    const up = http.request({
      host: targetHost, port: targetPort, method: headers[':method'] || 'GET', path: ctx.target,
      headers: upstreamHeaders(ctx), agent,
    }, (upRes) => {
      upstreamAt = Date.now()
      // 客户端在上游响应到达前就取消了：直接丢弃，别再去 respond
      if (stream.destroyed || stream.closed) { upRes.destroy(); return }
      const out = cleanHeaders(upRes.headers)
      const policy = cachePolicyFor(ctx.pathname)
      if (policy !== null && out['cache-control'] === undefined) out['cache-control'] = policy
      try {
        stream.respond({ ':status': upRes.statusCode || 502, ...out })
      } catch {
        upRes.destroy()
        return
      }
      upRes.on('data', (c) => { bytes += c.length })
      upRes.pipe(stream)
      upRes.on('error', () => stream.destroy())
    })
    up.on('error', () => {
      if (stream.destroyed || stream.closed || stream.headersSent) { stream.destroy(); return }
      try {
        stream.respond({ ':status': 502, 'content-type': 'text/plain' })
        stream.end('upstream error\n')
      } catch {
        stream.destroy()
      }
    })
    stream.on('error', () => up.destroy())
    stream.on('close', () => { if (!stream.writableEnded) up.destroy() })
    // h2 的请求体就是 stream 本身：无条件接上管道，GET 会在流结束时自动收尾
    stream.pipe(up)
  }

  /** WebSocket 等升级请求：原样把首包转给上游，之后裸管道。 */
  function upgrade(req, socket, head) {
    const upstream = net.connect({ host: targetHost, port: targetPort }, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      }
      upstream.write(lines.join('\r\n') + '\r\n\r\n')
      if (head !== undefined && head.length > 0) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.setNoDelay(true)
    const done = () => { socket.destroy(); upstream.destroy() }
    socket.on('error', done)
    upstream.on('error', done)
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
  }

  // ---------------------------------------------------------------- 两个 server
  /** 客户端可能在任意时刻取消：写之前确认目标还在，避免抛 ERR_STREAM_* 把进程带走。 */
  function alive1(res) { return !res.destroyed && !res.writableEnded && !res.headersSent }

  function sendHttp1(res, d, headOnly = false) {
    if (!alive1(res)) return false
    const body = Buffer.isBuffer(d.body) ? d.body : Buffer.from(d.body)
    const headers = { ...d.headers }
    if (headers['content-length'] === undefined && d.status !== 304) headers['content-length'] = body.length
    try {
      res.writeHead(d.status, headers)
      if (headOnly || d.status === 304 || body.length === 0) res.end()
      else res.end(body)
    } catch {
      res.destroy()
      return false
    }
    return true
  }

  function sendStream(stream, d) {
    if (stream.destroyed || stream.closed || stream.headersSent) return false
    const body = Buffer.isBuffer(d.body) ? d.body : Buffer.from(d.body)
    const headers = { ...d.headers }
    if (d.status !== 304) headers['content-length'] = body.length
    try {
      stream.respond({ ':status': d.status, ...headers })
      stream.end(d.status === 304 || body.length === 0 ? undefined : body)
    } catch {
      stream.destroy()
      return false
    }
    return true
  }

  function ctxFromH1(req) {
    const { pathname, search, params } = parseTarget(req.url || '/')
    return {
      method: req.method || 'GET',
      target: req.url || '/',
      pathname, search, params,
      headers: req.headers,
      authority: req.headers.host || 'dsh',
      host: (req.headers.host || 'dsh').split(':')[0],
    }
  }

  function ctxFromH2(headers) {
    const raw = headers[':path'] || '/'
    const { pathname, search, params } = parseTarget(raw)
    const flat = {}
    for (const [k, v] of Object.entries(headers)) {
      if (k.startsWith(':')) continue
      flat[k] = Array.isArray(v) ? v.join(', ') : String(v)
    }
    return {
      method: headers[':method'] || 'GET',
      target: raw,
      pathname, search, params,
      headers: flat,
      authority: String(headers[':authority'] || flat.host || 'dsh'),
      host: String(headers[':authority'] || flat.host || 'dsh').split(':')[0],
    }
  }

  const h1 = http.createServer((req, res) => {
    try { handleHttp1(req, res) } catch (e) {
      // 单个请求出问题只毁这一条连接，不能带走整个守护进程
      try { res.destroy() } catch { /* 已断 */ }
      if (dbg) log('h1 处理异常', e.message)
    }
  })

  function handleHttp1(req, res) {
    const ctx = ctxFromH1(req)
    stats.h1 += 1
    const d = decide(ctx)
    if (d.kind === 'respond') { sendHttp1(res, d, req.method === 'HEAD'); return }
    if (ctx.pathname === SESSION_LIST_PATH && ctx.method === 'POST') {
      collectBody(req)
        .then((body) => (body === null
          ? { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: Buffer.from('request too large\n') }
          : serveSessionList(ctx, body)))
        .then((r) => sendHttp1(res, r))
        .catch(() => { if (alive1(res)) { try { res.writeHead(502); res.end() } catch { res.destroy() } } })
      return
    }
    if (ctx.pathname === SMART_CACHE_PATH && (ctx.method === 'GET' || ctx.method === 'HEAD')) {
      serveSmart(ctx).then((r) => {
        if (r === null) { proxyHttp1(req, res, ctx); return }
        sendHttp1(res, r, req.method === 'HEAD')
      }).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
      return
    }
    proxyHttp1(req, res, ctx)
  }

  h1.on('upgrade', (req, socket, head) => upgrade(req, socket, head))
  h1.on('clientError', (_err, socket) => { try { socket.destroy() } catch { /* 已断 */ } })

  const h2 = http2.createServer({ settings: { maxConcurrentStreams: 256 } })
  h2.on('stream', (stream, headers) => {
    stream.on('error', () => { try { stream.destroy() } catch { /* 已断 */ } })
    try { handleStream(stream, headers) } catch (e) {
      try { stream.destroy() } catch { /* 已断 */ }
      if (dbg) log('h2 流异常', e.message)
    }
  })

  function handleStream(stream, headers) {
    const ctx = ctxFromH2(headers)
    stats.h2 += 1
    const d = decide(ctx)
    if (d.kind === 'respond') { sendStream(stream, d); return }

    if (ctx.pathname === SESSION_LIST_PATH && ctx.method === 'POST') {
      collectBody(stream)
        .then((body) => (body === null
          ? { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: Buffer.from('request too large\n') }
          : serveSessionList(ctx, body)))
        .then((r) => sendStream(stream, r))
        .catch(() => { try { stream.destroy() } catch { /* 已断 */ } })
      return
    }

    if (ctx.pathname === SMART_CACHE_PATH && (ctx.method === 'GET' || ctx.method === 'HEAD')) {
      serveSmart(ctx).then((r) => {
        if (r === null) { proxyStream(stream, headers, ctx); return }
        sendStream(stream, r)
      }).catch(() => {
        if (!stream.headersSent) stream.respond({ ':status': 500 })
        stream.end()
      })
      return
    }
    proxyStream(stream, headers, ctx)
  }

  h2.on('sessionError', () => {})
  h2.on('error', (e) => log('h2 出错', e.message))

  /**
   * TLS 握手完成后由 agent 调用：按协商结果把 socket 交给对应 server。
   * @param {import('node:tls').TLSSocket} socket
   */
  function handleSocket(socket) {
    socket.setNoDelay(true)
    socket.on('error', () => { try { socket.destroy() } catch { /* 已断 */ } })
    if (socket.alpnProtocol === 'h2') { h2.emit('connection', socket); return }
    h1.emit('connection', socket)
  }

  function close() {
    if (agent !== false) agent.destroy()
    try { h1.close() } catch { /* 已关 */ }
    try { h2.close() } catch { /* 已关 */ }
  }

  /** 启动预热：把 genui 运行时先抓进内存，避免第一个访客吃到「无 ETag」的冷响应。 */
  function warm() { return fetchSmart() }

  return {
    handleSocket, close, stats, warm,
    // 边缘只认 HTTP/2 与 HTTP/1.1；WebSocket 浏览器固定走 1.1
    alpnProtocols: ['h2', 'http/1.1'],
  }
}
