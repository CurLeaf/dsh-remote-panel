/**
 * 手机端审批桥。
 *
 * DSH 的审批是一个 **waterfall**（`approval/request`，答案只能是
 * `allowed-once | rejected | cancelled | unavailable`）：谁接了就必须给出结果，
 * 不接就 `next()` 让桌面 UI 照旧答。
 *
 * 所以这里的原则是「**接管才拦**」：
 *   - 默认不接管任何会话，`intercept()` 直接 `next()`，桌面行为完全不变；
 *   - 手机在监看里打开某个会话的「手机批准」后，这个会话的请求才由手机作答；
 *   - 手机一直不答 → 超时回 `unavailable`（fail closed），不把 turn 挂死；
 *   - 请求被取消（signal abort）→ 回 `cancelled`。
 *
 * 纯状态机：不碰 HTTP、不碰 cordis，方便单测。
 */

export const APPROVAL_OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable']

/** 手机多久不作答就放弃（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 120_000

/**
 * @param {{ now?: () => number, timeoutMs?: number }} [options]
 */
export function createApprovalBridge({ now = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  /** 手机接管审批的会话集合。 */
  const watched = new Set()
  /** id → { id, sessionId, toolName, callId, reason, at, settle, timer } */
  const pending = new Map()
  let seq = 0

  const publicView = (entry) => ({
    id: entry.id,
    sessionId: entry.sessionId,
    toolName: entry.toolName,
    callId: entry.callId ?? null,
    reason: entry.reason ?? '',
    at: entry.at,
    ageMs: Math.max(0, now() - entry.at),
  })

  /**
   * waterfall 监听器本体：接管了就等手机，不接管就原样交给下一个回答者。
   * @param {{ agent?: { session?: { id?: string } }, toolName?: string, callId?: string, reason?: string, signal?: AbortSignal }} request
   * @param {() => Promise<unknown>} next
   */
  function intercept(request, next) {
    const sessionId = request?.agent?.session?.id
    if (typeof sessionId !== 'string' || !watched.has(sessionId)) return next()

    const id = `ap-${++seq}`
    return new Promise((resolve) => {
      const settle = (outcome) => {
        const entry = pending.get(id)
        if (entry === undefined) return
        pending.delete(id)
        if (entry.timer !== null) clearTimeout(entry.timer)
        resolve(APPROVAL_OUTCOMES.includes(outcome) ? outcome : 'unavailable')
      }
      const entry = {
        id,
        sessionId,
        toolName: request.toolName ?? '未知工具',
        ...(request.callId === undefined ? {} : { callId: request.callId }),
        reason: request.reason ?? '',
        at: now(),
        timer: null,
        settle,
      }
      entry.timer = setTimeout(() => settle('unavailable'), timeoutMs)
      entry.timer.unref?.()
      pending.set(id, entry)
      request.signal?.addEventListener?.('abort', () => settle('cancelled'), { once: true })
    })
  }

  /** 手机要看的待批列表。 */
  function list() {
    return [...pending.values()].map(publicView)
  }

  /**
   * 手机作答。
   * @param {string} id
   * @param {'allowed-once'|'rejected'} decision
   * @returns {boolean} 是否真的答上了（过期 / 重复点返回 false）
   */
  function decide(id, decision) {
    const entry = pending.get(id)
    if (entry === undefined) return false
    if (decision !== 'allowed-once' && decision !== 'rejected') return false
    entry.settle(decision)
    return true
  }

  /** 打开/关闭某会话的「手机批准」。 */
  function setWatch(sessionId, on) {
    if (typeof sessionId !== 'string' || sessionId === '') return false
    if (on) watched.add(sessionId)
    else watched.delete(sessionId)
    return true
  }

  function watchedIds() {
    return [...watched]
  }

  function size() {
    return pending.size
  }

  /** 关闭时把没答的请求都放成 unavailable，别让 turn 悬着。 */
  function close() {
    for (const entry of [...pending.values()]) entry.settle('unavailable')
    watched.clear()
  }

  return { intercept, list, decide, setWatch, watchedIds, size, close }
}
