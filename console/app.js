import { Store } from './store.js'
import { mount } from './ui.js'
import { createSessionSource } from './source.js'

/** 把一个独立的监看屏挂到 root 上，返回 store 与卸载函数。 */
export function mountConsole(root, options = {}) {
  const store = new Store()
  const live = options.live ?? (options.sessions ? createSessionSource(options.sessions) : null)
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
    onTakeover: () => { if (live && typeof live.cancel === 'function') live.cancel() },
  })
  if (live && typeof live.start === 'function') live.start()
  return {
    store,
    dispose: () => {
      if (unsubscribe !== null) unsubscribe()
      if (live && typeof live.stop === 'function') live.stop()
      dispose()
    },
  }
}
