/**
 * tunnel agent 配置：只读环境变量、只做启动期校验。
 *
 * 这里刻意只有 agent 这一半——中继（VPS 侧）的配置在 dsh-tunnel 仓库里，
 * 两边不共享配置文件，避免「改一边以为另一边也跟着变」。
 *
 * 任何一项不合法都在启动时直接失败并说清是哪一项，不留运行期兜底。
 */

const missing = []

function readStr(name, def) {
  const v = process.env[name]
  if (v === undefined || v === '') return def
  return v
}

function readRequired(name) {
  const v = process.env[name]
  if (v === undefined || v === '') { missing.push(name); return '' }
  return v
}

function readNum(name, def, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`配置 ${name} 不是数字：${JSON.stringify(raw)}`)
  if (n < min || n > max) throw new Error(`配置 ${name}=${n} 超出范围 [${min}, ${max}]`)
  return n
}

function readBool(name, def) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return def
  if (raw === '1' || raw.toLowerCase() === 'true') return true
  if (raw === '0' || raw.toLowerCase() === 'false') return false
  throw new Error(`配置 ${name} 只接受 1/0/true/false：${JSON.stringify(raw)}`)
}

/**
 * 读取并校验 agent 配置。
 * @returns {object} 全部字段都有确定值，调用方不再做二次判空。
 */
export function agentConfig() {
  const cfg = {
    relayUrl: readRequired('RELAY_URL'),
    targetHost: readStr('TARGET_HOST', '127.0.0.1'),
    targetPort: readNum('TARGET_PORT', 3080, { min: 1, max: 65535 }),
    gateKey: readStr('GATE_KEY', ''),
    localTlsPort: readNum('LOCAL_TLS_PORT', 18100, { min: 1, max: 65535 }),
    hostnames: readStr('TUNNEL_HOSTNAMES', '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x !== ''),
    certSync: readBool('CERT_SYNC', false),
    certSyncHost: readStr('CERT_SYNC_HOST', '').toLowerCase(),
    certSyncIntervalMs: readNum('CERT_SYNC_INTERVAL', 12 * 3600 * 1000, { min: 60000, max: 7 * 86400000 }),
    maxChannels: readNum('AGENT_MAX_CHANNELS', 256, { min: 1, max: 100000 }),
    pendingCap: readNum('PENDING_CAP', 256 * 1024, { min: 4096, max: 64 * 1024 * 1024 }),
    backoffMinMs: readNum('BACKOFF_MIN_MS', 1000, { min: 100, max: 60000 }),
    backoffMaxMs: readNum('BACKOFF_MAX_MS', 30000, { min: 1000, max: 600000 }),
    dbg: readBool('DBG', false),
  }
  if (missing.length > 0) throw new Error(`缺少必填配置：${missing.join(', ')}`)

  try {
    const u = new URL(cfg.relayUrl)
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') {
      throw new Error(`RELAY_URL 协议必须是 ws/wss：${cfg.relayUrl}`)
    }
  } catch (e) {
    if (e instanceof TypeError) throw new Error(`RELAY_URL 不是合法 URL：${cfg.relayUrl}`)
    throw e
  }

  if (cfg.certSync && cfg.certSyncHost === '') {
    cfg.certSyncHost = cfg.hostnames[0] || ''
    if (cfg.certSyncHost === '') throw new Error('CERT_SYNC=1 时必须提供 CERT_SYNC_HOST 或 TUNNEL_HOSTNAMES')
  }
  if (cfg.backoffMinMs > cfg.backoffMaxMs) throw new Error('BACKOFF_MIN_MS 不能大于 BACKOFF_MAX_MS')
  return cfg
}
