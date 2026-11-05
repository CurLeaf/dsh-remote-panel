import { fmtSec, shortCmd, patchOf } from './engine.js'

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
  list: S('<path d="M4.5 7h15M4.5 12h15M4.5 17h10"/>'),
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
      <div class="flat-layer" id="flatLayer"></div>
      <div class="toast-layer" id="toastLayer"></div>
    </div>`

  const els = {
    nav: root.querySelector('#navbar'),
    screen: root.querySelector('#screen'),
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
      case 'stop-run': {
        const ok = options.onTakeover?.()
        if (ok === false) {
          store.toast('现在没有在跑的任务', 'mark')
        } else {
          store.toast('已请 agent 停手', 'ok')
        }
        store.emit()
        break
      }
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
      case 'approve':
      case 'reject': {
        const decision = act === 'approve' ? 'allowed-once' : 'rejected'
        Promise.resolve(options.onApprove?.(id, decision))
          .then((res) => store.toast(res?.ok === true ? (act === 'approve' ? '已批准' : '已拒绝') : '没送达：宿主还没重启', res?.ok === true ? 'ok' : 'mark'))
          .catch(() => store.toast('没送达：宿主还没重启', 'mark'))
          .finally(() => store.emit())
        break
      }
      case 'watch': {
        const sid = store.currentSessionId
        if (typeof sid !== 'string' || sid === '') {
          store.toast('还没接上会话，先打开一个会话再开手机批准', 'mark')
          store.emit()
          break
        }
        if (typeof options.onWatch !== 'function') {
          store.toast('这个环境没有审批通道', 'mark')
          store.emit()
          break
        }
        const on = !(store.watching ?? []).includes(sid)
        store.watchInFlight += 1
        Promise.resolve(options.onWatch(sid, on))
          .then((res) => {
            if (res && res.ok === false) throw new Error(res.error ?? '服务端拒绝')
            store.watching = on ? [...(store.watching ?? []), sid] : (store.watching ?? []).filter((x) => x !== sid)
            store.toast(on ? '手机批准已开：这个会话的审批会等你' : '手机批准已关', 'ok')
            store.emit()
          })
          .catch((error) => {
            // 以前这里是空 catch，失败完全没反馈，表现就是「点了没反应」
            store.toast(`手机批准没切成功：${error?.message ?? '未知原因'}`, 'mark')
            store.emit()
          })
          .finally(() => { store.watchInFlight = Math.max(0, store.watchInFlight - 1) })
        break
      }
      case 'say': {
        const text = t.dataset.text ?? ''
        const ok = options.onSend?.(text) === true
        store.toast(ok ? `已发送：${text}` : '发不出去：会话没接上', ok ? 'ok' : 'mark')
        store.emit()
        break
      }
      case 'session': {
        if (typeof options.onSelectSession === 'function') options.onSelectSession(id)
        store.ui.view = 'now'
        store.emit()
        break
      }
      case 'open': store.openDetail(kind, id); store.emit(); break
      case 'back': store.back(); store.emit(); break
      case 'step': {
        store.toggleStep(id)
        const step = store.derive().steps.find((x) => x.id === id)
        if (step) {
          Promise.resolve(
            options.onSeen?.({
              sessionId: store.currentSessionId,
              stepId: step.id,
              index: step.index,
              title: step.title,
            }),
          ).catch(() => {})
        }
        store.emit()
        break
      }
      case 'mark': {
        const step = store.derive().current
        const text = step ? `第 ${step.index} 步：${step.title}` : '回去看看这个会话'
        Promise.resolve(options.onMark?.(store.currentSessionId, text))
          .then((res) => store.toast(res?.ok === true ? '已标记，桌面能看到' : '标记没保存：宿主还没重启', res?.ok === true ? 'ok' : 'mark'))
          .catch(() => store.toast('标记没保存：宿主还没重启', 'mark'))
          .finally(() => store.emit())
        break
      }
      case 'notify': {
        // 安卓壳里没有 Web Notification，但前台服务有通知通道：先走桥。
        const bridge = typeof globalThis === 'object' ? globalThis.DSHPocket : null
        if (bridge && typeof bridge.notify === 'function') {
          try {
            bridge.notify('DSH 通知测试', '能看到这条，说明通知通道是通的')
            store.toast('已通过 App 通知通道发送', 'ok')
          } catch {
            store.toast('App 通知通道没响应', 'mark')
          }
          store.emit()
          break
        }
        if (typeof Notification === 'undefined') {
          store.toast('这个环境没有通知能力：浏览器要 HTTPS + 授权，安卓请用 App 打开', 'mark')
          store.emit()
          break
        }
        const report = (state) => {
          store.toast(state === 'granted' ? '通知已开' : '浏览器没给通知权限', state === 'granted' ? 'ok' : 'mark')
          store.emit()
        }
        if (Notification.permission === 'granted') {
          try {
            new Notification('DSH 通知测试', { body: '能看到这条就说明通了', tag: 'dsh-remote-panel' })
            report('granted')
          } catch {
            store.toast('系统把通知挡掉了', 'mark')
            store.emit()
          }
          break
        }
        Promise.resolve(Notification.requestPermission()).then(report).catch(() => {
          store.toast('请求通知权限失败', 'mark')
          store.emit()
        })
        break
      }
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
    renderActionBar(els.bar, els.app, d, store)

    const sig = [
      store.ui.view, store.ui.detail?.kind, store.ui.detail?.id, store.ui.openStep,
      d.activity.length, d.commands.length, d.files.length, d.takeover,
      store.ui.acceptance.status, store.ui.interventions.length, local.diffMode, local.previewSide,
      store.ui.highlight, store.ui.acceptance.excluded.size,
      d.files.map((f) => `${f.path}${f.ignored}${f.reverted}${f.sensitive}`).join(','),
      // 摘要页的内容也会变，必须进签名，否则「点了按钮状态变了但页面不重绘」：
      // 手机批准开关、待批准列表、其他会话、当前跟随的会话都属于这类。
      // 这是「手机批准点不动」的真正原因——状态早就改了，只是页面没重画。
      store.currentSessionId ?? '',
      (store.watching ?? []).join(','),
      (store.approvals ?? []).map((a) => a.id).join(','),
      ((store.overview && store.overview.sessions) || []).map((x) => `${x.id}:${x.level}`).join(','),
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
  const tabName = { sessions: '会话', now: '现在', changes: '变更', accept: '验收' }[view] ?? '监看'
  const backLabel = detail ? (detail.kind === 'preview' ? '验收' : '变更') : '对话'
  const title = detail ? (detail.kind === 'preview' ? '结果预览' : baseName(detail.id)) : tabName
  const live = store.live === true
  const sig = [backLabel, title, takeover, Boolean(detail), live].join('|')
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
      : live
        // 真实会话里没有「接管/释放」这回事：能做的只有让 agent 停手。
        // 以前点了「接管」只改本地标志位，agent 照跑，所以看起来完全没效果。
        ? '<button class="nav-action destructive" data-act="stop-run">停手</button>'
        : `<button class="nav-action ${takeover ? 'destructive' : ''}" data-act="takeover">${takeover ? '释放' : '接管'}</button>`}
  `
}

// ---------- 标签栏 ----------
// ---------- 路由 ----------
function renderScreen(d, store) {
  const { ui } = store
  // 摘要页是唯一视图：会话列表在左屏、变更在聊天里，不再重复。
  return renderSummary(d, store)
}

// ---------- 会话总览 ----------
const LEVEL_ICON = { pending: ['warn', 'orange'], done: ['check', 'green'], stale: ['warn', 'red'], running: ['wave', 'blue'], idle: ['doc', 'gray'] }

function agoText(ms) {
  if (ms === null || ms === undefined) return ''
  if (ms < 60e3) return '刚刚'
  if (ms < 3600e3) return `${Math.round(ms / 60e3)} 分钟前`
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)} 小时前`
  return `${Math.round(ms / 86400e3)} 天前`
}

// ---------- 现在 ----------
function renderSummary(d, store) {
  const { ui } = store
  const pending = store.approvals ?? []
  const watching = (store.watching ?? []).includes(store.currentSessionId)
  const place = [d.task.branch, d.task.workdir.replace(/^.*\//, '')].filter(Boolean).join(' · ')
  const lastStep = d.steps && d.steps.length ? d.steps[d.steps.length - 1] : null
  const busy = Boolean(lastStep) || pending.length > 0 || Boolean(ui.takeover)
  const totals = d.totals ?? { files: 0, add: 0, del: 0 }

  const sub = ui.takeover ? '已接管 · agent 已暂停' : place || '等待会话'

  const approveCard = pending.length === 0 ? '' : `<p class="section-title">等你批准（${pending.length}）</p>
    <div class="group">${pending.map((p) => `
      <div class="row static">
        <span class="row-icon orange">${icon('warn')}</span>
        <div class="row-main">
          <span class="row-title">${esc(p.toolName)}${p.reason ? ` · ${esc(p.reason)}` : ''}</span>
          <span class="row-sub">${esc(String(p.sessionId).replace(/^session-/, '').slice(0, 8))} · ${esc(agoText(p.ageMs))}</span>
        </div>
      </div>
      <div class="row static" style="gap:14px">
        <button class="link-btn" data-act="approve" data-id="${esc(p.id)}">批准这次</button>
        <button class="link-btn" data-act="reject" data-id="${esc(p.id)}" style="color:var(--red)">拒绝</button>
      </div>`).join('')}</div>`

  const emptyCard = `<div class="group">
      <div class="row static">
        <span class="row-icon gray">${icon('wave')}</span>
        <div class="row-main">
          <span class="row-title">还没有可看的执行</span>
          <span class="row-sub">发一条消息，这里会显示它正在做什么</span>
        </div>
      </div>
    </div>`

  const statusCard = `<p class="section-title">状态</p>
    <div class="group status">
      <div class="row static">
        <span class="row-icon blue">${icon('wave')}</span>
        <div class="row-main">
          <span class="row-title">${esc(d.now.doing)}</span>
          <span class="row-sub">在做什么</span>
        </div>
      </div>
      <div class="row static">
        <span class="row-icon gray">${icon('doc')}</span>
        <div class="row-main">
          <span class="row-title">${esc(d.now.scope)}</span>
          <span class="row-sub">改动范围</span>
        </div>
      </div>
      <div class="row static">
        <span class="row-icon ${d.now.level === 'warn' ? 'orange' : 'gray'}">${icon(d.now.level === 'warn' ? 'warn' : 'check')}</span>
        <div class="row-main">
          <span class="row-title" ${d.now.level === 'warn' ? 'style="color: var(--orange)"' : ''}>${esc(d.now.momentum)}</span>
          <span class="row-sub">节奏</span>
        </div>
      </div>
    </div>`

  const changesCard = totals.files === 0 ? '' : `<p class="section-title">改动</p>
    <div class="group">
      <div class="row static">
        <span class="row-icon gray">${icon('doc')}</span>
        <div class="row-main">
          <span class="row-title">${totals.files} 个文件</span>
          <span class="row-sub"><span style="color: var(--green)">+${totals.add}</span> <span style="color: var(--red)">−${totals.del}</span>${totals.sensitive ? ` · ${totals.sensitive} 个敏感` : ''}</span>
        </div>
      </div>
    </div>`

  // 跨工作区的其他会话：列表来自宿主的全局会话表，不只当前工作区。
  // 一次只能跟随一个，但这里能看到谁在等你、谁在跑，点一下切过去。
  const overview = store.overview
  const others = ((overview && overview.sessions) || []).filter((item) => item.id !== store.currentSessionId)
  const levelSub = (item) => {
    if (item.level === 'pending') return `等你处理${item.pending ? ` · ${item.pending}` : ''}`
    if (item.level === 'done') return '已完成，还没看'
    if (item.level === 'stale') return '可能卡住了'
    if (item.level === 'running') return '在跑'
    return '空闲'
  }
  const levelColor = (item) => (item.level === 'pending' ? 'orange' : item.level === 'done' ? 'green' : item.level === 'stale' ? 'orange' : item.level === 'running' ? 'blue' : 'gray')
  const workspaceOf = (item) => String(item.cwd || '').replace(/\/+$/, '').split('/').filter(Boolean).pop() || '未命名工作区'
  const waiting = others.filter((item) => item.level === 'pending' || item.level === 'done' || item.level === 'stale')
  const runningOthers = others.filter((item) => item.level === 'running')
  const spotlight = [...waiting, ...runningOthers].slice(0, 3)
  const othersCard = spotlight.length === 0 ? '' : `<p class="section-title">其他会话${waiting.length > 0 ? `（${waiting.length} 个等你）` : `（${runningOthers.length} 个在跑）`}</p>
    <div class="group">${spotlight.map((item) => `
      <button class="row" data-act="session" data-id="${esc(item.id)}">
        <span class="row-icon ${levelColor(item)}">${icon(item.level === 'pending' ? 'warn' : item.level === 'done' ? 'check' : 'wave')}</span>
        <div class="row-main">
          <span class="row-title">${esc(item.title)}</span>
          <span class="row-sub">${esc(workspaceOf(item))} · ${esc(levelSub(item))}</span>
        </div>
        <span class="chevron">${icon('chevron')}</span>
      </button>`).join('')}</div>`

  const stopCard = busy ? `<div class="group">
      <button class="row" data-act="say" data-text="先停下">
        <span class="row-icon gray">${icon('stop')}</span>
        <div class="row-main">
          <span class="row-title">先停下</span>
          <span class="row-sub">让 agent 停手，等你的下一步</span>
        </div>
      </button>
    </div>` : ''

  const watchRow = `<div class="group">
      <div class="row static">
        <span class="row-icon ${watching ? 'green' : 'gray'}">${icon('hand')}</span>
        <div class="row-main">
          <span class="row-title">手机批准：${watching ? '开' : '关'}</span>
          <span class="row-sub">${watching ? '这个会话的审批停下来等你在手机上点' : '关着的时候，审批照旧在桌面弹'}</span>
        </div>
        <button class="link-btn" data-act="watch">${watching ? '关闭' : '打开'}</button>
      </div>
      <div class="row static">
        <span class="row-icon gray">${icon('flag')}</span>
        <div class="row-main">
          <span class="row-title">后台通知</span>
          <span class="row-sub">页面在后台时弹系统通知</span>
        </div>
        <button class="link-btn" data-act="notify">开启</button>
      </div>
    </div>`

  return `
    <div class="page">
      <h1>现在</h1>
      <p>${esc(sub)}</p>
    </div>
    ${approveCard}
    ${place ? statusCard : emptyCard}
    ${othersCard}
    ${changesCard}
    ${stopCard}
    <p class="section-title">设置</p>
    ${watchRow}
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
