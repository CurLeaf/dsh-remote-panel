/**
 * 隧道帧协议 v0.1
 *
 *  - 控制帧：WS 文本帧，JSON `{ t: ... }`
 *  - 数据帧：WS 二进制帧，前 4 字节为大端通道号，其余为原始字节
 *
 * 为什么用「原始字节流」而不是解析 HTTP：
 *  DSH 的公网流量是 HTTP + SSE（/plugins/events）+ WebSocket（/api/remote.mux）三种混跑。
 *  在字节层转发，三种语义天然都成立，不需要为每一种单独写解析器——
 *  这正是 frp 的 tcp 代理能扛住它的原因，我们只是把它换成「主动出网 + 设备身份」。
 */

export const HEADER = 4
export const CTRL = {
  HELLO: 'hello',
  READY: 'ready',
  OPEN: 'open',
  CLOSE: 'close',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
}

/** 把通道号和负载打包成一个二进制帧。 */
export function encodeBinary(id, payload) {
  const head = Buffer.allocUnsafe(HEADER)
  head.writeUInt32BE(id >>> 0, 0)
  return Buffer.concat([head, payload])
}

/** 拆出通道号和负载；长度不足返回 null。 */
export function decodeBinary(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER) return null
  return { id: buf.readUInt32BE(0), payload: buf.subarray(HEADER) }
}

/** 恒定时间比较，避免令牌被按字节试探。 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
