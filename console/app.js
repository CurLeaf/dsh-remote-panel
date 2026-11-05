import { Store } from './store.js'

/** 系统通知：PWA / Android 壳里都可用；没授权就安静跳过。 */
function notify(title, body) {
  // 安卓壳：走前台服务里的通知通道（页面被挂起也能弹）
  try {
    const bridge = globalThis.DSHPocket
    if (bridge && typeof bridge.notify === 'function') {
      bridge.notify(title, body ?? '')
      return true
    }
  } catch { /* 桥挂了就走 Web 通知 */ }
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    new Notification(title, { body: body ?? '', tag: 'dsh-remote-panel' })
    return true
  } catch {
    return false
  }
}
import { mount } from './ui.js'
import { createSessionSource } from './source.js'

/** 把一个独立的监看屏挂到 root 上，返回 store 与卸载函数。 */
export function mountConsole(root, options = {}) {
  const store = new Store()
  const live = options.live ?? (options.sessions ? createSessionSource(options.sessions, options.uiSession ?? null) : null)
  if (live !== null && options.sessions) {
    // 接真实会话时先清空演示数据：等第一条真实快照到来再渲染
    store.live = true
    store.scenario = { task: { title: '', branch: '', workdir: '', intent: '' }, steps: [], duration: 0 }
    store.events = []
    store.duration = 0
    store.ui.t = 0
    store.ui.playing = false
  }
  const unsubscribe = live && typeof live.subscribe === 'function' ? live.subscribe((state) => store.setLive(state)) : null
  const dispose = mount(root, store, {
    ...options,
    onTakeover: () => (live && typeof live.cancel === 'function' ? live.cancel() : false),
    onSelectSession: (id) => { if (live && typeof live.select === 'function') live.select(id) },
    onSend: (text) => (live && typeof live.send === 'function' ? live.send(text) : false),
    onApprove: (id, decision) => options.approvals?.decide?.(id, decision),
    onWatch: (sessionId, on) => options.approvals?.watch?.(sessionId, on),
    onMark: (sessionId, text) => options.approvals?.relay?.mark?.({ sessionId, text }),
    onSeen: (payload) => options.approvals?.relay?.seen?.(payload),
  })
  if (live && typeof live.start === 'function') live.start()
  // 待批列表：走宿主路由（/pending），3 秒一轮；只有打开监看时才轮询
  let approvalsTimer = 0
  if (options.approvals && typeof options.approvals.list === 'function') {
    const pull = () => {
      Promise.resolve()
        .then(() => options.approvals.list())
        .then((body) => {
          const next = Array.isArray(body?.entries) ? body.entries : []
          const before = store.approvals.length
          store.approvals = next
          // 新增待批 + 页面在后台 → 弹系统通知（PWA / APK 同一条路）
          if (next.length > before && typeof document !== 'undefined' && document.hidden === true) {
            notify(`有 ${next.length} 个任务等你批准`, next.map((p) => p.toolName).slice(0, 3).join('、'))
          }
          // 用户刚点了「手机批准」且请求还在飞：别用上一轮的旧值把它盖回去，
          // 否则表现就是「点了没反应」（3 秒后被轮询重置）。
          if (store.watchInFlight === 0) {
            store.watching = Array.isArray(body?.watching) ? body.watching : []
          }
          store.emit()
        })
        .catch(() => { /* 宿主还没重启 / 路由不存在：静默 */ })
    }
    pull()
    approvalsTimer = setInterval(pull, 3000)
  }
  return {
    store,
    dispose: () => {
      if (approvalsTimer !== 0) clearInterval(approvalsTimer)
      if (unsubscribe !== null) unsubscribe()
      if (live && typeof live.stop === 'function') live.stop()
      dispose()
    },
  }
}
