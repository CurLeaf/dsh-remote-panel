import { normalizeSession } from './live.js'
import { buildOverview } from './overview.js'

/**
 * 把 DSH 的当前会话接成监看数据源。
 * - 选「主视图正在看的会话」（retainedBy.mainView > 0）；
 * - retain 后订阅 eventSource 的连续事件窗口；
 * - 每次变更合成一帧，rAF 合并后推给 store。
 */
export function createSessionSource(sessions, uiSession = null) {
  const listeners = new Set()
  let state = null
  let listUnsub = null
  let statusUnsub = null
  let eventUnsub = null
  let reference = null
  let currentId = null
  // 打开监看面板时对话会卸载，mainView 的引用随即归零；
  // 记住最后一次看到的会话，面板期间继续用它。
  let lastId = null
  let manualId = null
  let frame = 0
  let stopped = true

  const overviewNow = () => {
    let rows = []
    let status = null
    try {
      const list = sessions.list.getSnapshot()
      rows = list && list.byId ? Object.values(list.byId) : []
      status = uiSession?.sessionStatus?.getSnapshot?.() ?? null
    } catch {
      /* 列表还没就绪：给一份空的总览 */
    }
    return buildOverview({ rows, status, currentId })
  }
  const publish = () => {
    if (state === null) {
      const overview = overviewNow()
      for (const fn of listeners) fn({ scenario: null, events: [], overview, currentId })
      return
    }
    for (const fn of listeners) fn({ ...state, overview: overviewNow(), currentId })
  }
  const schedule = () => {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      publish()
    })
  }
  const pick = () => {
    if (manualId !== null) return manualId
    try {
      const list = sessions.list.getSnapshot()
      const rows = list && list.byId ? Object.values(list.byId) : []
      const found = rows.find((row) => (row.retainedBy?.mainView ?? 0) > 0)?.id ?? null
      if (found !== null) lastId = found
      return found ?? lastId
    } catch {
      return null
    }
  }
  const detach = () => {
    if (eventUnsub !== null) {
      try { eventUnsub() } catch { /* 订阅已失效 */ }
      eventUnsub = null
    }
    if (reference !== null) {
      try { reference.release() } catch { /* 已释放 */ }
      reference = null
    }
    state = null
  }
  const attach = (id) => {
    detach()
    currentId = id
    if (id === null) return
    const ref = sessions.retain(id, { source: 'remoteConsole' })
    reference = ref
    Promise.resolve(ref.ready)
      .then((binding) => {
        if (stopped || currentId !== id) return
        const eventSource = binding.eventSource
        const recompute = () => {
          try {
            const window = eventSource.getSnapshot()
            const entries = (window?.entries ?? [])
              .filter((entry) => entry.type === 'event')
              .map((entry) => entry.event)
            const summary = sessions.list.getSnapshot()?.byId?.[id] ?? {}
            state = normalizeSession({ id, cwd: summary.cwd, title: summary.displayTitle }, entries)
            schedule()
          } catch (error) {
            console.warn('[remote-panel] live normalize failed', error)
          }
        }
        eventUnsub = eventSource.subscribe(recompute)
        recompute()
      })
      .catch((error) => console.warn('[remote-panel] live session failed', error))
  }
  const sync = () => {
    const id = pick()
    if (id !== currentId) attach(id)
  }

  return {
    subscribe(fn) {
      listeners.add(fn)
      if (state !== null) fn(state)
      return () => listeners.delete(fn)
    },
    start() {
      if (!stopped) return
      stopped = false
      listUnsub = sessions.list.subscribe(() => {
        sync()
        schedule()
      })
      if (uiSession?.sessionStatus?.subscribe) {
        statusUnsub = uiSession.sessionStatus.subscribe(() => schedule())
      }
      sync()
    },
    /** 手动切换监看目标（会话切换器）。 */
    select(id) {
      const next = typeof id === 'string' && id !== '' ? id : null
      if (next === manualId) return
      manualId = next
      lastId = next ?? lastId
      sync()
      publish()
    },
    /** 往当前会话补一句话（继续 / 先停下 / 换个方案…）；返回是否发出。 */
    send(text) {
      const body = typeof text === 'string' ? text.trim() : ''
      if (body === '') return false
      try {
        const session = reference?.binding?.session
        if (session && typeof session.prompt === 'function') {
          Promise.resolve(session.prompt([{ type: 'text', text: body }], 'queue')).catch((error) => {
            console.warn('[remote-panel] prompt failed', error)
          })
          return true
        }
      } catch { /* 会话已释放 */ }
      return false
    },
    /** 接管：真的取消当前 turn；返回是否是有效调用。 */
    cancel() {
      try {
        const session = reference?.binding?.session
        if (session && typeof session.cancel === 'function') {
          Promise.resolve(session.cancel()).catch(() => {})
          return true
        }
      } catch { /* 会话已释放 */ }
      return false
    },
    stop() {
      stopped = true
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      if (listUnsub !== null) {
        try { listUnsub() } catch { /* 已失效 */ }
        listUnsub = null
      }
      if (statusUnsub !== null) {
        try { statusUnsub() } catch { /* 已失效 */ }
        statusUnsub = null
      }
      detach()
      currentId = null
      listeners.clear()
    },
  }
}
