import { SCENARIO } from './scenario.js'
import { deriveState } from './engine.js'

let seq = 0
const uid = (p) => `${p}-${++seq}`

export class Store {
  constructor() {
    this.scenario = SCENARIO
    this.events = SCENARIO.events
    this.duration = Math.max(...this.events.map((e) => e.t)) + 6
    this.listeners = new Set()

    this.ui = {
      t: 300,
      playing: false,
      speed: 20,
      view: 'now',
      detail: null,
      openStep: null,
      interventions: [],
      takeover: false,
      toast: null,
      highlight: null,
      sheet: null,
      drawer: null,
      acceptance: { status: 'pending', reason: '', excluded: new Set(), at: null },
      scroll: new Map(),
    }
    this.ui.openStepManual = false
    this.lastFrame = null
    this.raf = null
    this.live = false
    this.following = true
    this.overview = null
    this.currentSessionId = null
    this.approvals = []
    this.watching = []
    /** 用户刚点过「手机批准」，轮询回来的旧值不能盖掉这次改动。 */
    this.watchInFlight = 0
  }

  /** 接线真实会话：每次事件窗口变化都会推一份新的 (scenario, events)，外加会话总览。 */
  setLive(state) {
    if (!state) return
    if (state.overview) this.overview = state.overview
    if (typeof state.currentId === 'string') this.currentSessionId = state.currentId
    if (!state.scenario) {
      this.emit()
      return
    }
    this.live = true
    this.scenario = state.scenario
    this.events = state.events
    this.duration = Math.max(1, state.scenario.duration ?? 0)
    if (this.following) this.ui.t = this.duration
    this.emit()
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit() {
    const derived = this.derive()
    // 没有手动展开过时，展开的步骤跟着当前步走；拖过滑杆就交还自动跟随
    if (!this.ui.openStepManual) {
      this.ui.openStep = (derived.current ?? derived.steps[0])?.id ?? null
    }
    for (const fn of this.listeners) fn(derived, this.ui)
  }

  derive() {
    return deriveState(this.scenario, this.events, this.ui.t, this.ui.interventions, {
      takeover: this.ui.takeover,
    })
  }

  // ---------- 播放 ----------
  stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  start() {
    const loop = (ts) => {
      if (this.lastFrame == null) this.lastFrame = ts
      const dt = Math.min(0.25, (ts - this.lastFrame) / 1000)
      this.lastFrame = ts
      if (this.ui.playing && !this.ui.sheet) this.advance(dt * this.ui.speed)
      this.emit()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  advance(dt) {
    const next = Math.min(this.duration, this.ui.t + dt)
    if (next >= this.duration) this.ui.playing = false
    this.ui.t = next
  }

  seek(t) {
    this.ui.t = Math.max(0, Math.min(this.duration, t))
    this.ui.openStepManual = false
    if (this.live) {
      this.following = this.ui.t >= this.duration - 0.5
    } else if (this.ui.t < this.duration) {
      this.ui.playing = false
    }
  }

  togglePlay() {
    if (this.live) {
      this.following = true
      this.ui.t = this.duration
      this.ui.playing = false
      return
    }
    if (this.ui.t >= this.duration) this.ui.t = 0
    this.ui.playing = !this.ui.playing
  }

  // ---------- 导航 ----------
  go(view, anchor = null) {
    this.ui.view = view
    this.ui.detail = null
    this.ui.sheet = null
    if (anchor) this.highlight(anchor)
  }

  openDetail(kind, id) {
    this.ui.detail = { kind, id }
    this.ui.sheet = null
    this.ui.drawer = null
  }

  back() { this.ui.detail = null }

  toggleStep(id) {
    this.ui.openStepManual = true
    this.ui.openStep = this.ui.openStep === id ? null : id
  }

  highlight(anchor) {
    this.ui.highlight = anchor
    clearTimeout(this._hl)
    this._hl = setTimeout(() => { this.ui.highlight = null; this.emit() }, 2200)
  }

  openSheet(payload) { this.ui.sheet = payload }
  closeSheet() { this.ui.sheet = null }

  openDrawer(tab = 'term') { this.ui.drawer = tab }
  closeDrawer() { this.ui.drawer = null }
  setDrawerTab(tab) { this.ui.drawer = tab }

  toast(text, kind = 'info') {
    this.ui.toast = { text, kind, id: uid('toast') }
    const id = this.ui.toast.id
    clearTimeout(this._toast)
    this._toast = setTimeout(() => {
      if (this.ui.toast?.id === id) { this.ui.toast = null; this.emit() }
    }, 2400)
  }

  // ---------- 干预 ----------
  intervene({ tier, kind, target, sub = '', label }) {
    const item = { id: uid('iv'), tier, kind, target, sub, label, at: this.ui.t, undone: false }
    this.ui.interventions.push(item)
    if (kind === 'takeover') {
      this.ui.takeover = true
      this.ui.playing = false
    }
    if (kind === 'rerun-step') {
      const step = this.derive().steps.find((s) => s.id === target)
      if (step?.startT != null) {
        this.ui.openStep = step.id
        this.seek(step.startT)
        this.ui.playing = true
      }
    }
    this.ui.sheet = null
    this.toast(`${TIER_LABEL[tier]}：${label}`, tier)
  }

  releaseTakeover() {
    this.ui.takeover = false
    this.ui.playing = true
    this.toast('已释放控制权，agent 继续', 'constrain')
  }

  // ---------- 验收 ----------
  toggleExclude(path) {
    const set = this.ui.acceptance.excluded
    if (set.has(path)) set.delete(path); else set.add(path)
  }

  acceptedFiles(state) {
    const excluded = this.ui.acceptance.excluded
    return state.files.filter((f) => f.attempts.length && !f.reverted && !f.ignored && !excluded.has(f.path))
  }

  accept(state) {
    const files = this.acceptedFiles(state)
    this.ui.acceptance = { status: 'accepted', reason: '', excluded: this.ui.acceptance.excluded, at: this.ui.t }
    this.toast(`已接受 ${files.length} 个文件`, 'ok')
  }

  reject(reason) {
    this.ui.acceptance = { status: 'rejected', reason, excluded: this.ui.acceptance.excluded, at: this.ui.t }
    this.toast('已打回，理由已附给 agent', 'takeover')
  }

  resetAcceptance() {
    this.ui.acceptance = { status: 'pending', reason: '', excluded: new Set(), at: null }
  }

  // ---------- 滚动位置 ----------
  scrollKey() {
    const d = this.ui.detail
    return [this.ui.view, d ? `${d.kind}:${d.id}` : ''].join('/')
  }
}

const TIER_LABEL = { mark: '已标记', constrain: '已约束', takeover: '已接管' }
