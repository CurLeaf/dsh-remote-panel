/**
 * 会话总览 + 待处理收件箱。
 *
 * 纯函数：输入是 `sessions.list.getSnapshot().byId`（会话行）与
 * `uiSession.sessionStatus.getSnapshot()`（id → { running, pendingInteraction, completionUnread }），
 * 输出一份可直接渲染、已排序的列表。不碰 DOM、不读时钟以外的环境。
 */

/** 超过这么久没有新动作就算「卡住」。 */
export const STALE_MS = 3 * 60 * 1000

/** 优先级的顺序：先要你动手的，再是完成未读，再是卡住，再是运行中。 */
const LEVEL_RANK = { pending: 0, done: 1, stale: 2, running: 3, idle: 4 }

/** 从协议里的 pendingInteraction 里尽量抠出一句人话；抠不出就给兜底文案。 */
export function pendingLabel(interaction) {
  if (interaction === null || typeof interaction !== 'object') return null
  const candidates = [
    interaction.title,
    interaction.label,
    interaction.summary,
    interaction.kind,
    interaction.request?.title,
    interaction.request?.toolName,
    interaction.request?.name,
    interaction.toolName,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim().slice(0, 60)
  }
  return '等你处理'
}

/**
 * @param {object} input
 * @param {Array<object>} input.rows 会话行（至少含 id / title / updatedAt）
 * @param {Map<string, object>|object} input.status id → 状态
 * @param {number} [input.now] 当前时间
 * @param {string} [input.currentId] 监看正在跟随的会话
 */
export function buildOverview({ rows, status, now = Date.now(), currentId = null } = {}) {
  const map = status instanceof Map ? status : new Map(Object.entries(status ?? {}))
  const list = []
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== 'string') continue
    const state = map.get(row.id) ?? {}
    const pending = state.pendingInteraction ?? null
    const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : null
    const ageMs = updatedAt === null ? null : Math.max(0, now - updatedAt)
    const running = state.running === true || row.running === true
    const completionUnread = state.completionUnread === true
    const stale = running && ageMs !== null && ageMs > STALE_MS
    const level = pending !== null ? 'pending' : completionUnread ? 'done' : stale ? 'stale' : running ? 'running' : 'idle'
    list.push({
      id: row.id,
      title: typeof row.title === 'string' && row.title !== '' ? row.title : row.displayTitle ?? '未命名会话',
      cwd: typeof row.cwd === 'string' ? row.cwd : '',
      updatedAt,
      ageMs,
      running,
      completionUnread,
      stale,
      level,
      pending: pendingLabel(pending),
      current: row.id === currentId,
    })
  }
  list.sort((a, b) => {
    const rank = LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    if (rank !== 0) return rank
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
  const inbox = list.filter((item) => item.level === 'pending' || item.level === 'done' || item.level === 'stale')
  const counts = {
    pending: list.filter((item) => item.level === 'pending').length,
    done: list.filter((item) => item.level === 'done').length,
    stale: list.filter((item) => item.level === 'stale').length,
    running: list.filter((item) => item.level === 'running').length,
    total: list.length,
  }
  return { sessions: list, inbox, counts }
}
