/**
 * 隧道 Host 代理（家里那台）。
 *
 *  只做出网连接，不监听任何公网端口。
 *
 *  v0.2：首次运行没有设备令牌时，走「配对码」流程——本机打印 6 位码，
 *  在服务端执行 `ctl approve <码>` 批准后，令牌经 TLS 下发并落盘（600），
 *  服务端只保留 sha256 哈希。吊销即拒绝握手，无需改动任何一台机器的配置。
 */
import net from 'node:net'
import { createEdge } from './edge.mjs'
import tls from 'node:tls'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import { execFile } from 'node:child_process'
import http from 'node:http'
import { WebSocket } from 'ws'
import { CTRL, decodeBinary, encodeBinary } from './protocol.mjs'
import { agentConfig } from './config.mjs'

let cfg
try {
  cfg = agentConfig()
} catch (e) {
  console.error('[agent] 配置错误：' + e.message)
  process.exit(2)
}

const RELAY_URL = cfg.relayUrl
const CA_FILE = process.env.CA_FILE || ''
const DEVICE_FILE = process.env.DEVICE_FILE
  || path.join(os.homedir(), '.config/dsh-tunnel/device.json')
const TARGET_HOST = cfg.targetHost
const TARGET_PORT = cfg.targetPort
const GATE_KEY = cfg.gateKey
/** 本机对外的域名（SNI 路由用），中继按它把连接分给本设备 */
const TUNNEL_HOSTNAMES = cfg.hostnames
const LOCAL_TLS_PORT = cfg.localTlsPort
/** 从首尔中继拉 Let's Encrypt 证书 */
const CERT_SYNC = cfg.certSync
const CERT_SYNC_HOST = cfg.certSyncHost
const CERT_SYNC_INTERVAL = cfg.certSyncIntervalMs
const AGENT_MAX_CHANNELS = cfg.maxChannels
const CONSOLE_URL = (process.env.CONSOLE_URL || '').trim()
const DBG = cfg.dbg
let tlsServer = null
/** SNI 双证书：IP/无 SNI → 内部 CA 证书（手机已信任）；域名 → Let's Encrypt */
const LE_CERT = process.env.LE_CERT || path.join(os.homedir(), '.config/dsh-tunnel/cert/le-chain.crt')
const LE_KEY = process.env.LE_KEY || path.join(os.homedir(), '.config/dsh-tunnel/cert/le.key')
let leCtx = null
const BACKOFF_MIN = cfg.backoffMinMs
const BACKOFF_MAX = cfg.backoffMaxMs

const log = (...args) => console.log(new Date().toISOString(), '[agent]', ...args)

// TLS 之后的 HTTP 终结层：ALPN 分流、反向代理、缓存语义、门禁都在这里
const edge = createEdge({
  targetHost: TARGET_HOST,
  targetPort: TARGET_PORT,
  gateKey: GATE_KEY,
  getDshToken: () => dshToken,
  log,
  dbg: DBG,
})
const channels = new Map()
const channelState = new Map()
/** 跨两条 WS 没有顺序保证：open 还没到时先缓冲数据帧，open 后回放 */
const pendingData = new Map()
const PENDING_CAP = cfg.pendingCap

/**
 * 数据 lane 的队列水位（单位字节）。
 *
 * 所有通道共用一条 WebSocket，按 FIFO 发送，所以"某个通道能先堆多少"就等于
 * "其他通道最多要排多久"。原实现是 4MB 才暂停、1MB 才恢复：一条 15~20fps 的
 * 截图流可以合法占住 4MB 队头，交互请求（会话列表、SSE）只能跟在后面——
 * 按实测 lane 吞吐折算就是十几到几十秒的加载延迟。
 */
const DATA_HIGH_WATER = Number(process.env.AGENT_DATA_HIGH_WATER) || 256 * 1024
const DATA_LOW_WATER = Number(process.env.AGENT_DATA_LOW_WATER) || 64 * 1024
/** 通道被暂停超过这么久还没排空，视为僵尸通道直接回收（原来只 pause 不回收）。 */
const THROTTLE_MAX_MS = Number(process.env.AGENT_THROTTLE_MAX_MS) || 15000
let backoff = BACKOFF_MIN
let stopping = false
let tokenTimer = null
let dshToken = ''
let lastDevice = null

/** 从本机 dsh-web 的 journal 里读出当前会话 token，经控制通道上报中继。 */
function refreshDshToken() {
  execFile('journalctl', ['--user', '-u', 'dsh-web', '-o', 'cat', '--no-pager'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) return
    const m = [...stdout.matchAll(/[?&]token=([A-Za-z0-9_-]{16,})/g)]
    if (m.length === 0) return
    const token = m[m.length - 1][1]
    dshToken = token
    const ctl = lanes.control
    if (ctl !== null && ctl.readyState === WebSocket.OPEN) {
      try { ctl.send(JSON.stringify({ t: 'dsh-token', token })) } catch { /* 已断 */ }
      log('已上报 DSH 会话 token（长度', token.length, '）')
    }
  })
}


function relayBase() {
  const u = new URL(RELAY_URL)
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`
}

/** 从中继拉证书并热加载；失败时保留旧证书继续服务。 */
async function syncCert(device) {
  if (!CERT_SYNC || CERT_SYNC_HOST === '' || device.deviceId === '') return
  const q = new URLSearchParams({ device: device.deviceId, token: device.token, domain: CERT_SYNC_HOST })
  const url = `${relayBase()}/cert?${q}`
  return new Promise((resolve) => {
    const opts = url.startsWith('https:') ? { ca: CA_FILE !== '' ? fs.readFileSync(CA_FILE) : undefined } : {}
    if (process.env.REJECT_UNAUTHORIZED === 'false') opts.rejectUnauthorized = false
    const mod = url.startsWith('https:') ? https : http
    mod.get(url, opts, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode !== 200) { log('取证书失败', res.statusCode, body.slice(0, 80)); return resolve(false) }
        try {
          const { cert, key } = JSON.parse(body)
          if (!cert || !key) return resolve(false)
          // 写到独立的 LE 文件，**不覆盖** IP 那张内部 CA 证书
          fs.writeFileSync(LE_CERT, cert)
          fs.writeFileSync(LE_KEY, key, { mode: 0o600 })
          leCtx = tls.createSecureContext({ cert, key })
          log('已加载 Let\'s Encrypt 证书（域名访问用它，IP 访问仍用内部 CA）')
          resolve(true)
        } catch (e) { log('证书解析失败', e.message); resolve(false) }
      })
    }).on('error', (e) => { log('取证书出错', e.message); resolve(false) })
  })
}

function startLocalTls() {
  const read = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }

  // Let's Encrypt 是唯一权威证书；内部 CA 那张只作可选兜底（没有也能正常起）
  const leCert = read(LE_CERT)
  const leKey = read(LE_KEY)
  if (leCert !== null && leKey !== null) {
    try { leCtx = tls.createSecureContext({ cert: leCert, key: leKey }) } catch (e) { log('LE 证书加载失败', e.message); leCtx = null }
  }
  let baseCert = leCert
  let baseKey = leKey
  if (baseCert === null) {
    baseCert = read(TLS_CERT)
    baseKey = read(TLS_KEY)
    if (baseCert !== null) log('LE 证书缺失，暂用内部 CA 证书兜底')
  }
  if (baseCert === null || baseKey === null) {
    log('没有任何可用证书，TLS 入口未启动（等中继下发后再重启）')
    return
  }

  const defaultCtx = tls.createSecureContext({ cert: baseCert, key: baseKey })
  tlsServer = tls.createServer({
    cert: baseCert,
    key: baseKey,
    // 把 h2 摆到前面：浏览器一看有 h2 就不会再去开 6 条连接
    ALPNProtocols: edge.alpnProtocols,
    SNICallback: (name, cb) => {
      if (leCtx !== null && CERT_SYNC_HOST !== '' && String(name).toLowerCase() === CERT_SYNC_HOST) {
        cb(null, leCtx)
        return
      }
      cb(null, defaultCtx)
    },
  }, (socket) => edge.handleSocket(socket))
  tlsServer.listen(LOCAL_TLS_PORT, '127.0.0.1', () => {
    log(`本地 TLS 入口 127.0.0.1:${LOCAL_TLS_PORT}（门禁${GATE_KEY === '' ? '关闭' : '开启'}，ALPN ${edge.alpnProtocols.join('+')}）`)
    // 预热边缘缓存：首个访客也能直接拿到 ETag，不用先吃一次冷响应。
    // DSH 还没起来时按 10s 退避重试，最多 20 次（约 3 分钟）。
    let warmTries = 0
    const warmUp = () => {
      edge.warm().then((r) => {
        if (r !== null) { log('边缘预热完成'); return }
        warmTries += 1
        if (warmTries >= 20) { log('边缘预热放弃（上游始终未就绪）'); return }
        setTimeout(warmUp, 10000)
      })
    }
    setTimeout(warmUp, 3000)
  })
}

// ---------------------------------------------------------------- 配对流程
function relayHttpBase(wsUrl) {
  const u = new URL(wsUrl)
  const proto = u.protocol === 'wss:' ? 'https:' : 'http:'
  return `${proto}//${u.host}`
}

function httpJson(base, pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, base)
    const mod = url.protocol === 'https:' ? https : http
    const opts = { rejectUnauthorized: true }
    if (url.protocol === 'https:' && CA_FILE !== '') opts.ca = fs.readFileSync(CA_FILE)
    if (process.env.REJECT_UNAUTHORIZED === 'false') opts.rejectUnauthorized = false
    mod.get(url, opts, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function ensureDevice() {
  try {
    const saved = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'))
    if (saved.deviceId && saved.token) {
      log(`使用已保存的设备 ${saved.deviceId}`)
      return saved
    }
  } catch { /* 还没有配对 */ }

  const base = relayHttpBase(RELAY_URL)
  const name = encodeURIComponent(os.hostname())
  log('未配对，向中继申请配对码…')
  const created = await httpJson(base, `/pair/new?name=${name}`)
  log('='.repeat(56))
  log(`  配对码： ${created.code}`)
  log('  在服务端执行： node src/ctl.mjs approve ' + created.code)
  log(`  有效期 ${Math.round((created.expiresAt - Date.now()) / 60000)} 分钟`)
  log('='.repeat(56))

  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const r = await httpJson(base, `/pair/poll?pairId=${encodeURIComponent(created.pairId)}`)
    if (r.pending) continue
    if (r.deviceId && r.token) {
      fs.mkdirSync(path.dirname(DEVICE_FILE), { recursive: true })
      fs.writeFileSync(DEVICE_FILE, JSON.stringify(r, null, 2), { mode: 0o600 })
      log(`配对完成，设备 ${r.deviceId}，令牌已保存到 ${DEVICE_FILE}`)
      return r
    }
    throw new Error('配对失败：响应字段 ' + Object.keys(r).join(','))
  }
}

// ---------------------------------------------------------------- 隧道主体
// 双通道：control 只走 open/close，data 只走字节流。
// 单通道时，页面加载的几十 MB 大帧会把新连接的 open 帧堵在队列后面，
// 实测把「新建连接」从 100ms 拖到 6s。分道后控制帧永远排在空队列上。
let generation = 0
let lanes = { control: null, data: null }

function dialLane(lane, device, gen) {
  const url = new URL(RELAY_URL)
  if (device.deviceId && device.token) {
    url.searchParams.set('device', device.deviceId)
    url.searchParams.set('token', device.token)
  } else {
    url.searchParams.set('token', BOOTSTRAP_TOKEN)
  }
  url.searchParams.set('lane', lane)
  const opts = {}
  if (CA_FILE !== '') opts.ca = fs.readFileSync(CA_FILE)
  if (process.env.REJECT_UNAUTHORIZED === 'false') opts.rejectUnauthorized = false
  const ws = new WebSocket(url, opts)

  ws.on('open', () => log(`lane ${lane} 已连接`))
  ws.on('error', (err) => log(`lane ${lane} 错误: ${err.message}`))
  ws.on('close', (code, reason) => {
    log(`lane ${lane} 关闭 code=${code} reason=${reason?.toString() || ''}`)
    if (gen !== generation) return
    // 关键：先让同代另一条 lane 的 close 失效，再排一次重连。
    // 否则两条 lane 各排一次 → 一次断开触发两次重连 → 互相顶号的重连风暴。
    generation += 1
    teardown()
    if (stopping) return
    if (code === 4001) {
      log('令牌被拒绝（可能已吊销），删除本机令牌后重新配对')
      try { fs.unlinkSync(DEVICE_FILE) } catch { /* 忽略 */ }
    }
    if (code === 4003) {
      log('设备已被服务端吊销，停止重连')
      return
    }
    backoff = Math.min(BACKOFF_MAX, backoff * 2)
    log(`${backoff}ms 后重连`)
    setTimeout(() => main(), backoff)
  })
  return ws
}

function teardown() {
  // 先清所有通道的背压看门狗，再销毁 socket——否则定时器会带着已关闭的 fd 空转
  for (const st of channelState.values()) {
    if (st !== null && st.timer !== null) {
      clearInterval(st.timer)
      st.timer = null
    }
  }
  for (const [id, sock] of channels) { sock.destroy(); channels.delete(id); channelState.delete(id) }
  // 关键：中继重启后通道号会从 1 重新开始。若不清空乱序缓冲，
  // 上一代会话残留的字节会被灌进新通道，TLS 流被打乱（"unexpected message"）。
  pendingData.clear()
  for (const k of ['control', 'data']) {
    const w = lanes[k]
    lanes[k] = null
    if (w !== null) { try { w.close() } catch { /* 已断 */ } }
  }
}

function onControlMessage(ws, data) {
  let msg
  try { msg = JSON.parse(data.toString()) } catch { return }
  if (msg.t === CTRL.OPEN) openChannel(msg.id)
  else if (msg.t === CTRL.CLOSE) closeChannel(msg.id)
}

function connect(device) {
  const gen = ++generation
  backoff = BACKOFF_MIN
  lanes.control = dialLane('control', device, gen)
  lanes.data = dialLane('data', device, gen)
  const ctl = lanes.control
  const dat = lanes.data
  ctl.on('open', () => {
    if (TUNNEL_HOSTNAMES.length > 0) {
      try {
        ctl.send(JSON.stringify({ t: 'hello', hostnames: TUNNEL_HOSTNAMES }))
        log('已向中继登记主机名', TUNNEL_HOSTNAMES.join(','))
      } catch { /* 已断 */ }
    }
    refreshDshToken()
    if (CERT_SYNC && lastDevice !== null) syncCert(lastDevice)
    if (tokenTimer !== null) clearInterval(tokenTimer)
    tokenTimer = setInterval(refreshDshToken, 5 * 60 * 1000)
  })

  ctl.on('message', (data, isBinary) => { if (!isBinary) onControlMessage(ctl, data) })
  dat.on('message', (data, isBinary) => {
    if (!isBinary) return
    const frame = decodeBinary(data)
    if (frame === null) return
    const sock = channels.get(frame.id)
    if (DBG) log('收到数据', frame.id, frame.payload.length)
    if (sock === undefined) {
      const list = pendingData.get(frame.id) || []
      if (list.reduce((n, b) => n + b.length, 0) < PENDING_CAP) {
        list.push(frame.payload)
        pendingData.set(frame.id, list)
      }
      return
    }
    const ch = channelState.get(frame.id)
    if (sock.write(frame.payload) === false && ch !== undefined && !ch.waitingDrain) {
      ch.waitingDrain = true
      sock.once('drain', () => { ch.waitingDrain = false })
    }
  })
}

function openChannel(id) {
  if (channels.size >= AGENT_MAX_CHANNELS) {
    log('通道数已达上限，拒绝新通道', channels.size)
    if (lanes.control !== null && lanes.control.readyState === WebSocket.OPEN) {
      try { lanes.control.send(JSON.stringify({ t: CTRL.CLOSE, id })) } catch { /* 已断 */ }
    }
    return
  }
  const sock = net.connect({ host: '127.0.0.1', port: LOCAL_TLS_PORT }, () => {
    log(`通道 ${id} → 本地 TLS 入口已建立`)
  })
  sock.setNoDelay(true)
  const st = { waitingDrain: false, throttled: false, timer: null, pausedAt: 0 }
  channels.set(id, sock)
  channelState.set(id, st)
  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    // 关键：必须在销毁前清掉背压定时器。原来定时器没人持有句柄，
    // 通道关闭后它仍在每 20ms 跑一次并持有 sock/st，属于实打实的泄漏。
    if (st.timer !== null) {
      clearInterval(st.timer)
      st.timer = null
    }
    channels.delete(id)
    channelState.delete(id)
    pendingData.delete(id)
    sock.destroy()
    const cws = lanes.control
    if (cws !== null && cws.readyState === WebSocket.OPEN) {
      try { cws.send(JSON.stringify({ t: CTRL.CLOSE, id })) } catch { /* 已断 */ }
    }
  }

  const resumeChannel = () => {
    if (st.timer !== null) {
      clearInterval(st.timer)
      st.timer = null
    }
    st.throttled = false
    st.pausedAt = 0
    if (!cleaned) sock.resume()
  }

  /** 暂停一个通道并起一个"水位 + 超时"看门狗；恢复或超时回收都要清掉定时器。 */
  const holdChannel = () => {
    if (st.throttled || cleaned) return
    st.throttled = true
    st.pausedAt = Date.now()
    sock.pause()
    st.timer = setInterval(() => {
      if (cleaned) return
      const dws = lanes.data
      const laneOpen = dws !== null && dws.readyState === WebSocket.OPEN
      if (laneOpen && dws.bufferedAmount < DATA_LOW_WATER) {
        resumeChannel()
        return
      }
      if (Date.now() - st.pausedAt > THROTTLE_MAX_MS) {
        log(`通道 ${id} 背压超时 ${THROTTLE_MAX_MS}ms（lane ${laneOpen ? '正常' : '断开'}，`
          + `积压 ${laneOpen ? dws.bufferedAmount + 'B' : 'n/a'}）→ 回收`)
        cleanup()
      }
    }, 20)
    if (typeof st.timer.unref === 'function') st.timer.unref()
  }

  const early = pendingData.get(id)
  if (early !== undefined) {
    pendingData.delete(id)
    for (const chunk of early) sock.write(chunk)
  }

  sock.on('data', (chunk) => {
    if (cleaned) return
    const dws = lanes.data
    if (dws === null || dws.readyState !== WebSocket.OPEN) {
      // lane 断了就别继续读，等它恢复；继续读只会把数据堆在本进程里再丢掉
      holdChannel()
      return
    }
    if (dws.bufferedAmount > DATA_HIGH_WATER) holdChannel()
    dws.send(encodeBinary(id, chunk))
  })

  sock.on('close', cleanup)
  sock.on('error', (err) => { log(`通道 ${id} 目标错误: ${err.message}`); cleanup() })
}

function closeChannel(id) {
  const sock = channels.get(id)
  if (sock === undefined) return
  channels.delete(id)
  channelState.delete(id)
  sock.destroy()
}

async function main() {
  log(`目标 ${TARGET_HOST}:${TARGET_PORT}，中继 ${RELAY_URL}`)
  let device = { deviceId: '', token: '' }
  try {
    device = await ensureDevice()
  } catch (err) {
    log('配对流程失败：', err.message)
    setTimeout(() => main(), 15000)
    return
  }
  lastDevice = device
  if (CERT_SYNC) {
    const ok = await syncCert(device)
    log(ok ? '证书已同步' : '证书同步未成功（沿用现有证书）')
    setInterval(() => { syncCert(device) }, CERT_SYNC_INTERVAL)
  }
  connect(device)
}

process.on('SIGINT', () => { stopping = true; process.exit(0) })
process.on('SIGTERM', () => { stopping = true; process.exit(0) })

startLocalTls()
main()
