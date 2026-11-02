import { fmtSec, fmtClock, shortPath, shortCmd, slug, patchOf, attemptDiff, STATUS_TEXT } from './engine.js'
import { compact } from './diff.js'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const baseName = (p) => String(p).split('/').pop()
const dirName = (p) => String(p).split('/').slice(0, -1).join('/') || '.'
const icon = (name) => ICONS[name] ?? ''

const S = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`

const ICONS = {
  wave: S('<path d="M2.6 12h3.1l1.7-4.1 2.9 8.2 1.9-4.8 1.3 2.7h8"/>'),
  gauge: S('<path d="M4.7 17.8a8.5 8.5 0 1 1 14.6 0"/><path d="M12 17.8l3.7-5.4"/><circle cx="12" cy="17.8" r="1.15" fill="currentColor" stroke="none"/>'),
  doc: S('<path d="M7 3.5h6.6L18 8v12.5H7z"/><path d="M13.4 3.6V8H18"/><path d="M9.4 12.4h5.4M9.4 15.8h3.8"/>'),
  check: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6 5.4-5.6"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/></svg>',
  hand: S('<path d="M9 11.2V5.6a1.5 1.5 0 0 1 3 0v5.6m0-1V4.7a1.5 1.5 0 0 1 3 0v6.9m0-2.1V6.7a1.5 1.5 0 0 1 3 0v6.8a5.6 5.6 0 0 1-5.6 5.6h-.8a5.2 5.2 0 0 1-4.1-2l-1.9-2.5a1.5 1.5 0 0 1 2.3-1.9L9 14"/>'),
  more: S('<circle cx="5.4" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.75" fill="currentColor" stroke="none"/>'),
  chevron: S('<path d="M9.5 4.5L17 12l-7.5 7.5"/>'),
  back: S('<path d="M14.5 4.5L7 12l7.5 7.5"/>'),
  warn: S('<path d="M12 3.6l9.2 16.4H2.8z"/><path d="M12 9.6v4.2M12 17.2v.2"/>'),
  terminal: S('<rect x="3" y="4.8" width="18" height="14.4" rx="2.6"/><path d="M7 10.2l3 2-3 2M13 14.4h4"/>'),
  image: S('<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 16.6l4.4-4 3.4 2.8 3-2.4 4.2 3.6"/>'),
  undo: S('<path d="M4 9.5h9.4a5.2 5.2 0 1 1 0 10.4H9.2"/><path d="M7.8 5.3L4 9.5l3.8 4.2"/>'),
  eyeOff: S('<path d="M3.5 12s3.2-5.4 8.5-5.4S20.5 12 20.5 12s-3.2 5.4-8.5 5.4S3.5 12 3.5 12z"/><path d="M4.5 4.5l15 15"/>'),
  flag: S('<path d="M6 21V4h11.2l-2.6 4 2.6 4H6"/>'),
  stop: S('<circle cx="12" cy="12" r="8.6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>'),
  no: S('<circle cx="12" cy="12" r="8.6"/><path d="M6.4 6.4l11.2 11.2"/>'),
  skip: S('<path d="M6 5.4l7.4 6.6L6 18.6z"/><path d="M17 5v14"/>'),
  rerun: S('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V10h-5.4"/>'),
  bookmark: S('<path d="M7 3.5h10v17l-5-3.6-5 3.6z"/>'),
}

// 每个对象可执行的动作：三档
const ACTIONS = {
  file: () => [
    { tier: 'mark', kind: 'mark-file', label: '稍后回看', hint: '只记录，不改变执行', icon: 'bookmark' },
    { tier: 'constrain', kind: 'revert-file', label: '回滚此文件', hint: '撤销改动，恢复原样', icon: 'undo' },
    { tier: 'constrain', kind: 'ignore-file', label: '忽略此文件', hint: '后续不再改它', icon: 'eyeOff' },
    { tier: 'constrain', kind: 'sensitive-file', label: '标记为敏感', hint: '改动将进入验收必看', icon: 'flag' },
    { tier: 'takeover', kind: 'takeover', label: '接管', hint: '停掉 agent，我来处理', icon: 'hand' },
  ],
  command: (c) => [
    { tier: 'mark', kind: 'mark-cmd', label: '记录这条命令', hint: '写进本次会话', icon: 'bookmark' },
    ...(c.status === 'running' ? [{ tier: 'constrain', kind: 'kill-cmd', label: '终止本次', hint: '向 worker 发 SIGINT', icon: 'stop' }] : []),
    { tier: 'constrain', kind: 'block-cmd', label: '禁止再跑', hint: `后续拒绝执行「${c.cmd}」`, icon: 'no' },
    { tier: 'takeover', kind: 'takeover', label: '接管', hint: '停掉 agent，我来处理', icon: 'hand' },
  ],
  step: () => [
    { tier: 'mark', kind: 'mark-step', label: '标记此步', hint: '只记录', icon: 'bookmark' },
    { tier: 'constrain', kind: 'skip-step', label: '跳过此步', hint: '后续不再执行它', icon: 'skip' },
    { tier: 'constrain', kind: 'rerun-step', label: '重跑此步', hint: '让 agent 重来一次', icon: 'rerun' },
    { tier: 'takeover', kind: 'takeover', label: '接管', hint: '停掉 agent，我来处理', icon: 'hand' },
  ],
}

const TIER_TITLE = { mark: '标记', constrain: '约束', takeover: '接管' }

const local = {
  diffMode: 'current',
  previewSide: 'after',
  sig: '',
  key: '',
  flatSig: '',
  toastId: '',
  suppressClick: false,
}

export function mount(root, store, options = {}) {
  root.classList.add('pc')
  const syncTheme = () => {
    root.classList.toggle('pc-dark', document.body?.hasAttribute('data-ds-dark-theme') === true)
  }
  syncTheme()
  const themeObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(syncTheme)
  themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  root.innerHTML = `
    <div class="app">
      <header class="navbar" id="navbar"></header>
      <main class="screen" id="screen"></main>
      <div class="action-bar" id="actionBar"></div>
      <nav class="tabbar" id="tabbar"></nav>
      <div class="flat-layer" id="flatLayer"></div>
      <div class="toast-layer" id="toastLayer"></div>
    </div>`

  const els = {
    nav: root.querySelector('#navbar'),
    screen: root.querySelector('#screen'),
    tabbar: root.querySelector('#tabbar'),
    bar: root.querySelector('#actionBar'),
    flat: root.querySelector('#flatLayer'),
    toast: root.querySelector('#toastLayer'),
    app: root.querySelector('.app'),
  }

  const paintTheme = () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = dark ? '#000000' : '#f2f2f7'
  }
  paintTheme()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintTheme)

  els.screen.addEventListener('scroll', () => {
    els.app.dataset.scrolled = els.screen.scrollTop > 34 ? '1' : '0'
  }, { passive: true })

  // 长按
  let pressTimer = null
  let pressEl = null
  let startX = 0
  let startY = 0
  els.screen.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-long]')
    if (!el) return
    startX = e.clientX
    startY = e.clientY
    clearTimeout(pressTimer)
    pressTimer = setTimeout(() => {
      pressEl = el
      local.suppressClick = true
      openSheetFor(el.dataset.long, el.dataset.id)
    }, 430)
  })
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null }
  els.screen.addEventListener('pointermove', (e) => {
    if (!pressTimer) return
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancelPress()
  })
  els.screen.addEventListener('pointerup', cancelPress)
  els.screen.addEventListener('pointercancel', cancelPress)
  els.screen.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-long]')) e.preventDefault()
  })

  root.addEventListener('click', (e) => {
    if (local.suppressClick) {
      local.suppressClick = false
      if (pressEl && pressEl.contains(e.target)) { e.stopPropagation(); return }
    }
    const t = e.target.closest('[data-act]')
    if (!t) return
    const { act, id, kind, target, tier, label, view, mode, anchor } = t.dataset
    switch (act) {
      case 'takeover':
        if (store.ui.takeover) {
          store.releaseTakeover()
        } else {
          store.intervene({ tier: 'takeover', kind: 'takeover', target: 'agent', label: '停掉 agent，我来处理' })
          options.onTakeover?.()
        }
        store.emit()
        break
      case 'nav': store.go(view); store.emit(); break
      case 'open': store.openDetail(kind, id); store.emit(); break
      case 'back': store.back(); store.emit(); break
      case 'step': store.toggleStep(id); store.emit(); break
      case 'focus':
        store.ui.detail = null
        store.ui.view = anchor?.startsWith('file-') ? 'changes' : 'now'
        if (anchor?.startsWith('step-')) { store.ui.openStep = anchor.slice(5); store.ui.openStepManual = true }
        store.highlight(anchor)
        store.emit()
        break
      case 'sheet': openSheetFor(t.dataset.long, t.dataset.id); break
      case 'sheet-close': store.closeSheet(); store.emit(); break
      case 'iv':
        store.intervene({ tier, kind, target, label })
        if (kind === 'takeover') store.ui.detail = null
        store.emit()
        break
      case 'play': store.togglePlay(); store.emit(); break
      case 'detail-tab': local.diffMode = mode; store.emit(); break
      case 'preview-side': local.previewSide = mode; store.emit(); break
      case 'exclude': store.toggleExclude(id); store.emit(); break
      case 'accept': store.accept(store.derive()); store.emit(); break
      case 'reset-accept': store.resetAcceptance(); store.emit(); break
      case 'open-reject': store.openSheet({ type: 'reject' }); store.emit(); break
      case 'reject-send': store.reject(store.ui.acceptance.reason.trim()); store.closeSheet(); store.emit(); break
      case 'quick-reason':
        store.ui.acceptance.reason = t.dataset.reason
        { const box = els.flat.querySelector('#rejectReason'); if (box) box.value = t.dataset.reason }
        break
      case 'preview-click':
        store.toast(local.previewSide === 'after' ? '已进入首页 · 会话保持' : '被重定向到登录页', local.previewSide === 'after' ? 'ok' : 'takeover')
        store.emit()
        break
      case 'drawer': store.openDrawer(t.dataset.tab ?? 'term'); store.emit(); break
      case 'drawer-tab': store.setDrawerTab(t.dataset.tab); store.emit(); break
      case 'drawer-close': store.closeDrawer(); store.emit(); break
      case 'back-chat': {
        if (typeof options.onExit === 'function') { options.onExit(); break }
        const url = new URLSearchParams(location.search).get('chat')
        if (url) { location.href = url; break }
        store.toast('真实部署里，这里回到原来的对话', 'mark')
        store.emit()
        break
      }
      default: break
    }
  })

  root.addEventListener('input', (e) => {
    if (e.target.id === 'scrub') store.seek(Number(e.target.value))
    if (e.target.id === 'rejectReason') store.ui.acceptance.reason = e.target.value
  })

  function openSheetFor(type, id) {
    const d = store.derive()
    let title = ''
    let sub = ''
    let actions = []
    let target = id
    if (type === 'file') {
      const f = d.files.find((x) => x.path === id)
      if (!f) return
      title = baseName(f.path)
      sub = `${dirName(f.path)} · ${f.attempts.length} 版 · +${f.add} −${f.del}`
      actions = ACTIONS.file(f)
    } else if (type === 'command') {
      const c = d.commands.find((x) => x.id === id)
      if (!c) return
      title = shortCmd(c.cmd)
      sub = c.status === 'running' ? '运行中' : `exit ${c.exit} · ${fmtSec(c.dur ?? 0)}`
      actions = ACTIONS.command(c).map((a) => ({ ...a, target: a.kind === 'kill-cmd' ? c.id : c.cmd }))
      target = c.cmd
    } else if (type === 'step') {
      const s = d.steps.find((x) => x.id === id)
      if (!s) return
      title = `第 ${s.index} 步 · ${s.title}`
      sub = s.status === 'done' ? '已完成' : s.status === 'failed' ? '未达预期' : '进行中'
      actions = ACTIONS.step(s)
    } else {
      return
    }
    store.openSheet({ type, id, title, sub, actions: actions.map((a) => ({ ...a, target: a.target ?? target })) })
    store.emit()
  }

  // ---------- 渲染 ----------
  const unsubscribe = store.subscribe((d) => {
    renderNavbar(els.nav, d, store)
    renderTabs(els.tabbar, d, store)
    renderActionBar(els.bar, els.app, d, store)

    const sig = [
      store.ui.view, store.ui.detail?.kind, store.ui.detail?.id, store.ui.openStep,
      d.activity.length, d.commands.length, d.files.length, d.takeover,
      store.ui.acceptance.status, store.ui.interventions.length, local.diffMode, local.previewSide,
      store.ui.highlight, store.ui.acceptance.excluded.size,
      d.files.map((f) => `${f.path}${f.ignored}${f.reverted}${f.sensitive}`).join(','),
    ].join('|')

    if (sig !== local.sig) {
      local.sig = sig
      const key = store.scrollKey()
      if (local.key) store.ui.scroll.set(local.key, els.screen.scrollTop)
      try {
        els.screen.innerHTML = renderScreen(d, store)
      } catch (err) {
        console.error(err)
        els.screen.innerHTML = `<div class="empty">渲染失败：${esc(err.message)}</div>`
      }
      els.screen.scrollTop = store.ui.scroll.get(key) ?? 0
      els.app.dataset.scrolled = els.screen.scrollTop > 34 ? '1' : '0'
      local.key = key
      if (store.ui.highlight) {
        const el = els.screen.querySelector('#' + CSS.escape(store.ui.highlight))
        if (el) {
          el.classList.add('hl')
          requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }))
        }
      }
    }

    renderFlat(els.flat, d, store)
    const toastId = (store.ui.toast?.id ?? '') + (store.ui.sheet || store.ui.drawer ? ':modal' : '')
    if (toastId !== local.toastId) {
      local.toastId = toastId
      els.toast.innerHTML = store.ui.toast && !store.ui.sheet && !store.ui.drawer
        ? `<div class="toast ${store.ui.toast.kind}">${esc(store.ui.toast.text)}</div>`
        : ''
    }
  })

  store.start()
  return () => {
    themeObserver?.disconnect()
    unsubscribe()
    store.stop()
    root.innerHTML = ''
    root.classList.remove('pc')
  }
}

// ---------- 导航栏 ----------
function renderNavbar(el, d, store) {
  const { detail, takeover, view } = store.ui
  const tabName = { now: '现在', changes: '变更', accept: '验收' }[view] ?? '监看'
  const backLabel = detail ? (detail.kind === 'preview' ? '验收' : '变更') : '对话'
  const title = detail ? (detail.kind === 'preview' ? '结果预览' : baseName(detail.id)) : tabName
  const sig = [backLabel, title, takeover, Boolean(detail)].join('|')
  if (el._sig === sig) return
  el._sig = sig
  el.innerHTML = `
    <button class="nav-back" data-act="${detail ? 'back' : 'back-chat'}">
      ${icon('back')}<span>${esc(backLabel)}</span>
    </button>
    <div class="nav-title" ${detail ? 'data-always="1"' : ''}>${esc(title)}</div>
    ${detail
      ? detail.kind === 'preview'
        ? '<span class="nav-action" aria-hidden="true"></span>'
        : `<button class="nav-action" data-act="sheet" data-long="${detail.kind}" data-id="${esc(detail.id)}" aria-label="更多">${icon('more')}</button>`
      : `<button class="nav-action ${takeover ? 'destructive' : ''}" data-act="takeover">${takeover ? '释放' : '接管'}</button>`}
  `
}

// ---------- 标签栏 ----------
function renderTabs(el, d, store) {
  // 实时模式没有「接受」的服务端语义，别摆一个假按钮
  const tabs = store.live
    ? [['now', '现在', 'gauge'], ['changes', '变更', 'doc']]
    : [['now', '现在', 'gauge'], ['changes', '变更', 'doc'], ['accept', '验收', 'check']]
  const sig = store.ui.view + '|' + tabs.map((t) => t[0]).join(',') + '|' + store.ui.acceptance.status
  if (el._sig === sig) return
  el._sig = sig
  el.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`
  el.innerHTML = tabs.map(([id, label, ico]) => `
    <button class="tab ${store.ui.view === id ? 'active' : ''}" data-act="nav" data-view="${id}">
      ${icon(ico)}<span>${label}</span>
      ${id === 'accept' && d.artifact && store.ui.acceptance.status === 'pending' ? '<i class="tab-dot"></i>' : ''}
    </button>`).join('')
}

// ---------- 路由 ----------
function renderScreen(d, store) {
  const { ui } = store
  if (ui.detail) {
    if (ui.detail.kind === 'preview') return renderPreview()
    if (ui.detail.kind === 'file') return renderFileDetail(d, ui.detail.id, store)
  }
  if (ui.view === 'now') {
    if (store.live && d.steps.length === 0) return renderLiveEmpty(d, store)
    return renderNow(d, store)
  }
  if (ui.view === 'changes') return renderChanges(d, store)
  return renderAccept(d, store)
}

// ---------- 现在 ----------
function renderNow(d, store) {
  const { ui } = store
  const step = d.current
  const warn = d.now.level === 'warn'
  const place = [d.task.branch, d.task.workdir.replace(/^.*\//, '')].filter(Boolean).join(' · ')
  const sub = ui.takeover ? '已接管 · agent 已暂停' : place || '等待会话'

  return `
    <div class="page">
      <h1>现在</h1>
      <p>${esc(sub)}</p>
    </div>

    <div class="group status">
      <div class="row static">
        <span class="row-icon blue">${icon('wave')}</span>
        <div class="row-main">
          <span class="row-title">${esc(d.now.doing)}</span>
          <span class="row-sub">在做什么</span>
        </div>
      </div>
      <button class="row" data-act="nav" data-view="changes">
        <span class="row-icon gray">${icon('doc')}</span>
        <div class="row-main">
          <span class="row-title">${esc(d.now.scope)}</span>
          <span class="row-sub">改动范围</span>
        </div>
        <span class="chevron">${icon('chevron')}</span>
      </button>
      <button class="row" data-act="focus" data-anchor="${esc(step ? `step-${step.id}` : '')}">
        <span class="row-icon ${warn ? 'orange' : 'gray'}">${icon(warn ? 'warn' : 'check')}</span>
        <div class="row-main">
          <span class="row-title" ${warn ? 'style="color: var(--orange)"' : ''}>${esc(d.now.momentum)}</span>
          <span class="row-sub">节奏</span>
        </div>
        <span class="chevron">${icon('chevron')}</span>
      </button>
      <div class="row replay">
        <button class="play" data-act="play" aria-label="播放或暂停">${ui.playing ? icon('pause') : icon('play')}</button>
        <input id="scrub" type="range" min="0" max="${store.duration}" step="1" value="${Math.round(ui.t)}" aria-label="回放" />
        <span class="time">${fmtClock(ui.t)}</span>
      </div>
    </div>

    <p class="section-title">步骤</p>
    <div class="group steps">
      ${d.steps.map((s) => renderStep(s, d, store)).join('')}
    </div>

    <div class="group">
      <button class="row" data-act="drawer" data-tab="term">
        <span class="row-icon gray">${icon('terminal')}</span>
        <div class="row-main">
          <span class="row-title">原始输出</span>
          <span class="row-sub">终端 · git status · 最近 patch</span>
        </div>
        <span class="chevron">${icon('chevron')}</span>
      </button>
    </div>
`
}

/** 实时模式但没有可看的执行：不要拿演示数据糊弄。 */
function renderLiveEmpty(d, store) {
  const place = [d.task.branch, d.task.workdir.replace(/^.*\//, '')].filter(Boolean).join(' · ')
  return `
    <div class="page">
      <h1>现在</h1>
      <p>${esc(place || '等待会话')}</p>
    </div>
    <div class="group">
      <div class="row static">
        <span class="row-icon gray">${icon('wave')}</span>
        <div class="row-main">
          <span class="row-title">还没有可看的执行</span>
          <span class="row-sub">发一条消息，步骤、改动和命令会实时出现在这里</span>
        </div>
      </div>
    </div>`
}

function renderStep(s, d, store) {
  const open = store.ui.openStep === s.id
  const f = s.facts ?? {}
  const acts = d.activity.filter((a) => a.t >= (s.startT ?? Infinity) && a.t <= (s.endT ?? Infinity) && a.kind !== 'step')
  const bits = [statusText(s)]
  if (f.files) bits.push(`${f.files} 个文件 +${f.add} −${f.del}`)
  if (f.exit != null) bits.push(`exit ${f.exit}`)
  if (f.tests) bits.push(`${f.tests.passed} 通过 / ${f.tests.failed} 失败`)

  return `<div class="step ${s.status} ${open ? 'open' : ''}">
    <div class="step-head" data-act="step" data-id="${s.id}" id="step-${s.id}">
      <span class="step-idx">${s.index}</span>
      <div class="step-main">
        <span class="step-title">${esc(s.title)}${s.skipped ? ' · 已跳过' : ''}</span>
        <span class="step-meta">${bits.map((b) => esc(b)).join(' · ')}</span>
      </div>
      <span class="step-chevron">${icon('chevron')}</span>
    </div>
    ${open ? `<div class="step-body">
      ${s.expect ? `<div class="step-expect">预期：${esc(s.expect)}</div>` : ''}
      ${acts.length ? acts.slice(-8).map((a) => `
        <div class="step-act ${a.target ? 'tappable' : ''}" ${a.target ? `data-act="open" data-kind="${a.target.kind}" data-id="${esc(a.target.id)}" data-long="${a.target.kind}"` : ''}>
          <span class="step-act-t">${fmtClock(a.t)}</span>
          <span class="step-act-x">${esc(a.text)}</span>
        </div>`).join('') : '<div class="step-act"><span class="step-act-x muted">这一步没有动作</span></div>'}
      ${acts.length > 8 ? `<div class="step-more">还有 ${acts.length - 8} 条更早的动作</div>` : ''}
      <div class="step-foot"><button class="link-btn" data-act="sheet" data-long="step" data-id="${s.id}">重跑或跳过这一步</button></div>
    </div>` : ''}
  </div>`
}

function statusText(s) {
  return s.status === 'done' ? '已完成' : s.status === 'failed' ? '未达预期' : s.status === 'running' ? '进行中' : '未开始'
}

// ---------- 变更 ----------
function renderChanges(d, store) {
  const edited = d.files.filter((f) => f.attempts.length)
  const readOnly = d.files.filter((f) => !f.attempts.length)
  const accepted = new Set(store.acceptedFiles(d).map((f) => f.path))
  const max = Math.max(1, ...edited.map((f) => f.add + f.del))
  const tags = (f) => [f.sensitive ? '敏感' : '', f.ignored ? '已忽略' : '', f.reverted ? '已回滚' : ''].filter(Boolean)

  return `
    <div class="page">
      <h1>变更</h1>
      <p>${d.totals.files} 个文件 · <span style="color: var(--green)">+${d.totals.add}</span> <span style="color: var(--red)">−${d.totals.del}</span>${d.totals.sensitive ? ` · ${d.totals.sensitive} 个敏感` : ''}</p>
    </div>

    <p class="section-title">已修改</p>
    <div class="group">
      ${edited.length ? edited.map((f) => {
        const on = accepted.has(f.path)
        const dir = dirName(f.path)
        const sub = [dir === '.' ? null : dir, `${f.attempts.length} 版`, ...tags(f)].filter(Boolean).join(' · ')
        return `<div class="row" data-act="open" data-kind="file" data-id="${esc(f.path)}" data-long="file" id="file-${slug(f.path)}">
          <button class="file-check ${on ? 'on' : ''}" data-act="exclude" data-id="${esc(f.path)}" aria-label="纳入验收">
            ${on ? `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.3L19 7"/></svg>` : ''}
          </button>
          <div class="row-main">
            <span class="row-title mono">${esc(baseName(f.path))}</span>
            <span class="row-sub">${esc(sub)}</span>
            <span class="bar"><i class="bar-add" style="width:${(f.add / max) * 100}%"></i><i class="bar-del" style="width:${(f.del / max) * 100}%"></i></span>
          </div>
          <span class="delta"><span class="add">+${f.add}</span><span class="del">−${f.del}</span></span>
          <span class="chevron">${icon('chevron')}</span>
        </div>`
      }).join('') : '<div class="row static"><span class="row-title muted">还没有改动</span></div>'}
    </div>

    ${readOnly.length ? `
    <p class="section-title">只读取</p>
    <div class="group">
      ${readOnly.map((f) => `<div class="row static">
        <div class="row-main"><span class="row-title mono">${esc(baseName(f.path))}</span><span class="row-sub">${dirName(f.path) === '.' ? '' : esc(dirName(f.path)) + ' · '}读取 ${f.reads} 次</span></div>
      </div>`).join('')}
    </div>` : ''}
`
}

// ---------- 验收 ----------
function renderAccept(d, store) {
  const a = store.ui.acceptance
  const art = d.artifact
  const accepted = store.acceptedFiles(d)
  const passed = d.tests && d.tests.failed === 0

  return `
    <div class="page">
      <h1>验收</h1>
      <p class="${a.status === 'accepted' ? 'ok' : a.status === 'rejected' ? 'warn' : ''}">
        ${a.status === 'accepted' ? '已验收，等待合并' : a.status === 'rejected' ? `已打回：${esc(a.reason || '未填理由')}` : art ? '改动已完成，等你确认' : 'agent 还在跑'}
      </p>
    </div>

    <div class="artifact">
      <div class="art-top">
        <div class="art-ico">${icon('image')}</div>
        <div class="row-main">
          <div class="art-title">${esc(art?.title ?? '等待交付')}</div>
          <div class="art-sub">${art ? `${art.files} 个文件 · +${art.add} −${art.del} · ${fmtClock(art.t)}` : '尚未产出'}</div>
        </div>
      </div>
      <div class="art-actions">
        <button class="btn secondary" data-act="open" data-kind="preview" data-id="result" ${art ? '' : 'disabled'}>体验结果</button>
      </div>
    </div>

    <p class="section-title">证据</p>
    <div class="group">
      <div class="row static">
        <span class="row-icon ${passed ? 'green' : 'orange'}">${icon(passed ? 'check' : 'warn')}</span>
        <div class="row-main"><span class="row-title">用例</span><span class="row-sub">${d.tests ? `${d.tests.passed} 通过 / ${d.tests.failed} 失败` : '暂无测试'}</span></div>
        <span class="row-value ${passed ? '' : 'warn'}">${d.tests ? `${d.tests.passed}/${d.tests.passed + d.tests.failed}` : '—'}</span>
      </div>
      <div class="row static">
        <span class="row-icon blue">${icon('doc')}</span>
        <div class="row-main"><span class="row-title">接受范围</span><span class="row-sub">${a.excluded.size ? `已排除 ${a.excluded.size} 个文件` : '在「变更」里可以取消勾选'}</span></div>
        <span class="row-value">${accepted.length} 个文件</span>
      </div>
    </div>

    ${a.status === 'accepted' ? `<div class="banner ok">
      <span class="row-icon green">${icon('check')}</span>
      <span class="banner-main">已接受 ${accepted.length} 个文件</span>
      <button class="link-btn" data-act="reset-accept">重新验收</button>
    </div>` : ''}
    ${a.status === 'rejected' ? `<div class="banner danger">
      <span class="row-icon red">${icon('warn')}</span>
      <span class="banner-main">已打回</span>
      <button class="link-btn" data-act="reset-accept">重新验收</button>
    </div>` : ''}

    ${a.status === 'pending' ? `<div class="actions">
      <button class="btn primary" data-act="accept" ${art ? '' : 'disabled'}>接受 ${accepted.length} 个文件</button>
      <button class="btn ghost destructive" data-act="open-reject" ${art ? '' : 'disabled'}>打回…</button>
    </div>` : ''}
`
}

function renderActionBar(el, app, d, store) {
  const { ui } = store
  const show = ui.view === 'accept' && !ui.detail && ui.acceptance.status === 'pending' && Boolean(d.artifact)
  const sig = show ? `${store.acceptedFiles(d).length}` : '0'
  if (el._sig === sig) return
  el._sig = sig
  el.dataset.open = show ? '1' : '0'
  app.dataset.bar = show ? '1' : '0'
  if (!show) { el.innerHTML = ''; return }
  el.innerHTML = `
    <button class="reject-link" data-act="open-reject">打回</button>
    <button class="btn primary" data-act="accept">接受 ${store.acceptedFiles(d).length} 个文件</button>`
}

// ---------- 文件详情 ----------
function renderFileDetail(d, file, store) {
  const f = d.files.find((x) => x.path === file)
  if (!f) return '<div class="empty">没有这个文件</div>'
  const patch = patchOf(f)
  const prev = attemptDiff(f)
  const modes = [['current', '本轮'], ['prev', '上次尝试'], ['content', '正文']]
  let body = ''
  if (local.diffMode === 'current') {
    body = f.reverted ? '<div class="empty">已回滚到原始版本</div>'
      : patch ? hunkBlock(f, patch) : '<div class="empty">只读取过，没有改动</div>'
  } else if (local.diffMode === 'prev') {
    body = prev
      ? `<div class="diff-meta">第 ${prev.from} 版 → 第 ${prev.to} 版 · +${prev.changes.add} −${prev.changes.del}</div>
         <div class="hunk">${prev.lines.map((l) => lineRow(l)).join('')}</div>`
      : '<div class="empty">只有一版改动，没有可对比的上一次</div>'
  } else {
    const content = contentOf(f)
    body = content
      ? `<div class="diff-meta">直接读文件，不经过 agent 转述</div>
         <div class="hunk">${content.map((l) => `<div class="line"><span class="ln">${l.n}</span><span class="lt">${esc(l.text) || ' '}</span></div>`).join('')}</div>`
      : '<div class="empty">还没有可读内容</div>'
  }
  const excluded = store.ui.acceptance.excluded.has(f.path)

  return `
    <div class="detail-path mono">${esc(f.path)}</div>
    <div class="detail-meta">
      <span class="mono">${f.attempts.length} 版</span>
      <span class="mono" style="color: var(--green)">+${f.reverted ? 0 : f.add}</span>
      <span class="mono" style="color: var(--red)">−${f.reverted ? 0 : f.del}</span>
      <span>${STATUS_TEXT[f.status]}</span>
    </div>
    <div class="segmented">
      ${modes.map(([m, l]) => `<button class="${local.diffMode === m ? 'on' : ''}" data-act="detail-tab" data-mode="${m}">${l}</button>`).join('')}
    </div>
    <div class="diff">${body}</div>
    ${f.attempts.length ? `<div class="group">
      <button class="row" data-act="exclude" data-id="${esc(f.path)}">
        <span class="row-icon ${excluded ? 'gray' : 'green'}">${icon(excluded ? 'no' : 'check')}</span>
        <div class="row-main"><span class="row-title">${excluded ? '已排除在验收之外' : '已纳入验收'}</span><span class="row-sub">点一下切换</span></div>
      </button>
    </div>` : ''}
`
}

function hunkBlock(f, hunk) {
  return `<div class="hunk-head" data-long="file" data-id="${esc(f.path)}">${esc(hunk.header)}</div>
    <div class="hunk">${compact(hunk.lines, 2).map((l) => lineRow(l)).join('')}</div>`
}

function lineRow(l) {
  if (l.type === 'gap') return `<div class="line gap">${esc(l.text)}</div>`
  const mark = l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '
  return `<div class="line ${l.type}"><span class="ln">${mark}</span><span class="lt">${esc(l.text) || ' '}</span></div>`
}

function contentOf(f) {
  const h = patchOf(f)
  if (!h) return null
  const m = /\+(\d+)/.exec(h.header)
  let n = m ? Number(m[1]) : 1
  const out = []
  for (const l of h.lines) {
    if (l.type === 'del') continue
    out.push({ n: n++, text: l.text })
  }
  return out
}

// ---------- 预览 ----------
function renderPreview() {
  const side = local.previewSide
  return `
    <div class="segmented" style="margin-top: 12px">
      <button class="${side === 'before' ? 'on' : ''}" data-act="preview-side" data-mode="before">修复前</button>
      <button class="${side === 'after' ? 'on' : ''}" data-act="preview-side" data-mode="after">修复后</button>
    </div>
    <div class="preview">
      <div class="browser-bar"><span class="dots"></span><span class="url">127.0.0.1:4173/login</span></div>
      <div class="mock ${side}">
        <div class="mock-avatar"></div>
        <div class="mock-title">${side === 'after' ? '已恢复登录' : '登录已失效'}</div>
        <div class="mock-sub">${side === 'after' ? '会话已刷新，继续操作' : '401 · 被重定向到登录页'}</div>
        <div class="mock-btn" data-act="preview-click">${side === 'after' ? '继续' : '重新登录'}</div>
        <div class="mock-net ${side === 'after' ? 'ok' : 'bad'}">${side === 'after' ? 'POST /auth/refresh → 200' : 'POST /auth/refresh → 401'}</div>
      </div>
      <div class="preview-foot">真实产物 · 可直接点按</div>
    </div>
`
}

// ---------- 动作面板 / 打回 / 原始输出 ----------
function renderFlat(el, d, store) {
  const s = store.ui.sheet
  const drawer = store.ui.drawer
  if (!s && !drawer) { el.innerHTML = ''; el._sig = ''; return }
  const sig = [s?.type, s?.id, s?.actions?.length, drawer].join('|')
  if (el._sig === sig) return
  el._sig = sig

  if (s?.type === 'reject') {
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">打回这次改动</div><div class="sheet-sub">理由会附给 agent</div></div>
            <div class="reject-body">
              <textarea id="rejectReason" class="reject-input" rows="3" placeholder="一句话说明为什么打回…">${esc(store.ui.acceptance.reason)}</textarea>
              <div class="chips">
                ${['覆盖不全', '风格不一致', '缺少测试', '换个思路'].map((r) => `<button class="chip" data-act="quick-reason" data-reason="${r}">${r}</button>`).join('')}
              </div>
              <button class="btn primary" style="background: var(--red)" data-act="reject-send">发送打回</button>
            </div>
          </div>
          <button class="sheet-cancel" data-act="sheet-close">取消</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`
    return
  }

  if (s) {
    const tiers = ['mark', 'constrain', 'takeover'].filter((t) => s.actions.some((a) => a.tier === t))
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">${esc(s.title)}</div><div class="sheet-sub">${esc(s.sub)}</div></div>
            ${tiers.map((t) => `
              <div class="sheet-section">${TIER_TITLE[t]}</div>
              ${s.actions.filter((a) => a.tier === t).map((a) => `
                <button class="sheet-item ${a.tier === 'takeover' ? 'destructive' : ''}"
                  data-act="iv" data-tier="${a.tier}" data-kind="${a.kind}" data-target="${esc(a.target)}" data-label="${esc(a.label)}">
                  <span class="row-icon">${icon(a.icon)}</span>
                  <span class="sheet-item-main"><b>${esc(a.label)}</b><small>${esc(a.hint)}</small></span>
                </button>`).join('')}
            `).join('')}
          </div>
          <button class="sheet-cancel" data-act="sheet-close">取消</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`
    return
  }

  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="sheet-wrap">
        <div class="sheet drawer-sheet">
          <div class="sheet-head"><div class="sheet-title">原始输出</div><div class="sheet-sub">只读 · 直连 worker</div></div>
          <div class="sheet-seg">
            <div class="segmented" style="margin: 0">
              ${[['term', '终端'], ['status', 'git status'], ['patch', '最近 patch']].map(([k, l]) => `<button class="${drawer === k ? 'on' : ''}" data-act="drawer-tab" data-tab="${k}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="raw">${drawer === 'term' ? terminalOf(d) : drawer === 'status' ? gitStatusOf(d) : patchOfAll(d)}</div>
        </div>
        <button class="sheet-cancel" data-act="drawer-close">完成</button>
      </div>
      <div class="scrim" data-act="drawer-close"></div>
    </div>`
}

function terminalOf(d) {
  const out = []
  for (const c of d.commands) {
    out.push(`<div class="raw-cmd">$ ${esc(c.cmd)}</div>`)
    for (const l of c.lines) out.push(`<div class="raw-line ${l.stream === 'err' ? 'err' : ''}">${esc(l.line)}</div>`)
    if (c.exit != null) out.push(`<div class="raw-exit ${c.exit === 0 ? 'ok' : 'bad'}">[exit ${c.exit}]</div>`)
  }
  return out.join('') || '<div class="raw-line">还没有执行记录</div>'
}

function gitStatusOf(d) {
  const rows = d.files.map((f) => {
    const code = f.attempts.length ? 'M' : ' '
    return `<div class="raw-line"><span class="gs-code ${f.attempts.length ? 'mod' : ''}">${code}</span> ${esc(f.path)}</div>`
  })
  return `<div class="raw-line">On branch ${esc(d.task.branch)}</div>
    <div class="raw-line" style="opacity:.6">Changes not staged for commit:</div>${rows.join('')}`
}

function patchOfAll(d) {
  const files = d.files.filter((f) => f.attempts.length && !f.ignored && !f.reverted)
  if (!files.length) return '<div class="raw-line">还没有补丁</div>'
  return files.map((f) => {
    const h = patchOf(f)
    const body = h.lines.map((l) => `<div class="raw-line ${l.type === 'add' ? 'add' : l.type === 'del' ? 'del' : ''}">${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${esc(l.text)}</div>`).join('')
    return `<div class="patch-file"><div class="raw-cmd">--- a/${esc(f.path)}\n+++ b/${esc(f.path)}</div>
      <div class="raw-line" style="opacity:.6">${esc(h.header)}</div>${body}</div>`
  }).join('')
}
