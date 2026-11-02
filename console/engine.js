import { diffLines, compact, countChanges } from './diff.js'

const SILENCE_ALERT = 180 // 3 分钟没有新进展就提示
const READ_CHURN_ALERT = 3
const CMD_REPEAT_ALERT = 3
const FILE_CHURN_ALERT = 3
const FAIL_REPEAT_ALERT = 2

export function fmtSec(s) {
  if (!Number.isFinite(s) || s < 0) return '—'
  if (s < 60) return `${Math.round(s)} 秒`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`
}

export function fmtClock(t) {
  const s = Math.max(0, Math.round(t))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const STATUS_TEXT = { read: '读取', editing: '修改中', done: '已完成' }

/**
 * 从事件流推导出整个界面需要的状态。
 * 纯函数：同样的 (events, t, interventions) 永远得到同样的结果。
 */
export function deriveState(scenario, allEvents, t, interventions = [], flags = {}) {
  const done = interventions.filter((i) => !i.undone)
  const events = allEvents.filter((e) => e.t <= t)

  const steps = scenario.steps.map((s) => ({ ...s, status: 'pending', startT: null, endT: null, ok: null }))
  const byId = new Map(steps.map((s) => [s.id, s]))
  const files = new Map()
  const commands = new Map()
  const activity = []
  const notes = []
  let tests = null
  let artifact = null
  let lastEvent = null

  const ignored = new Set(done.filter((i) => i.kind === 'ignore-file').map((i) => i.target))
  const blocked = new Set(done.filter((i) => i.kind === 'block-cmd').map((i) => i.target))
  const sensitive = new Set(done.filter((i) => i.kind === 'sensitive-file').map((i) => i.target))
  const reverted = new Set(done.filter((i) => i.kind === 'revert-file').map((i) => i.target))
  const killed = new Set(done.filter((i) => i.kind === 'kill-cmd').map((i) => i.target))
  const rejected = new Set(done.filter((i) => i.kind === 'reject-hunk').map((i) => i.target))
  const skipped = new Set(done.filter((i) => i.kind === 'skip-step').map((i) => i.target))
  const skippedCases = new Set(done.filter((i) => i.kind === 'skip-test').map((i) => i.target))
  const focus = done.find((i) => i.kind === 'fix-only')?.target ?? null
  const proofRequested = done.some((i) => i.kind === 'request-proof')
  const takeover = flags.takeover === true

  const touch = (e) => { lastEvent = e }

  for (const e of events) {
    switch (e.type) {
      case 'step.start': {
        const s = byId.get(e.step)
        if (s) { s.status = 'running'; s.startT = e.t }
        touch(e)
        activity.push({ t: e.t, kind: 'step', text: `开始第 ${s?.index ?? '?'} 步 · ${s?.title ?? ''}`, anchor: `step-${e.step}`, target: { kind: 'step', id: e.step } })
        break
      }
      case 'step.end': {
        const s = byId.get(e.step)
        if (s) { s.status = e.ok ? 'done' : 'failed'; s.ok = e.ok; s.endT = e.t }
        touch(e)
        break
      }
      case 'file.read': {
        const f = ensureFile(files, e.path)
        f.reads++
        f.lastT = e.t
        f.lastKind = 'read'
        touch(e)
        activity.push({ t: e.t, kind: 'read', text: `读取 ${shortPath(e.path)}`, anchor: `file-${slug(e.path)}`, target: { kind: 'file', id: e.path } })
        break
      }
      case 'file.edit': {
        // 干预是覆盖态而不是时间旅行：历史仍保留，只是不再计入范围
        const f = ensureFile(files, e.path)
        f.attempts.push({ n: e.attempt, add: e.add, del: e.del, hunk: e.hunk, t: e.t })
        f.add += e.add
        f.del += e.del
        f.lastT = e.t
        f.lastKind = 'edit'
        touch(e)
        activity.push({ t: e.t, kind: 'edit', text: `编辑 ${shortPath(e.path)} +${e.add} −${e.del}`, anchor: `file-${slug(e.path)}`, target: { kind: 'file', id: e.path } })
        break
      }
      case 'cmd.start': {
        const blockedNow = blocked.has(e.cmd)
        commands.set(e.id, {
          id: e.id, cmd: e.cmd, startT: e.t, endT: null, exit: null, lines: [],
          status: blockedNow ? 'blocked' : 'running',
        })
        touch(e)
        if (!blockedNow) activity.push({ t: e.t, kind: 'cmd', text: `运行 ${e.cmd}`, anchor: `cmd-${e.id}`, target: { kind: 'command', id: e.id } })
        break
      }
      case 'cmd.line': {
        const c = commands.get(e.id)
        if (c && c.status !== 'blocked') {
          c.lines.push({ stream: e.stream, line: e.line })
          touch(e)
        }
        break
      }
      case 'cmd.end': {
        const c = commands.get(e.id)
        if (c) {
          c.endT = e.t
          c.exit = e.exit
          c.dur = e.dur
          if (c.status !== 'blocked') c.status = e.exit === 0 ? 'ok' : 'fail'
        }
        touch(e)
        activity.push({ t: e.t, kind: 'exit', text: `${shortCmd(commands.get(e.id)?.cmd ?? '命令')} 结束 · exit ${e.exit}`, anchor: `cmd-${e.id}`, target: { kind: 'command', id: e.id } })
        break
      }
      case 'test.result':
        tests = { ...e, t: e.t, cases: e.cases ?? [] }
        touch(e)
        activity.push({ t: e.t, kind: 'test', text: `测试 ${e.passed} 通过 / ${e.failed} 失败`, anchor: 'test-result' })
        break
      case 'note':
        notes.push({ t: e.t, text: e.text })
        touch(e)
        activity.push({ t: e.t, kind: 'note', text: e.text, anchor: 'notes' })
        break
      case 'artifact':
        artifact = { ...e, t: e.t }
        touch(e)
        activity.push({ t: e.t, kind: 'artifact', text: '产出可验收结果', anchor: 'artifact' })
        break
      default:
        break
    }
  }

  // 干预可以覆盖命令的最终状态：终止优先于运行中，拦截优先于一切
  for (const c of commands.values()) {
    if (blocked.has(c.cmd)) c.status = 'blocked'
    if (killed.has(c.id)) c.status = 'killed'
  }

  // ---- 文件状态 ----
  const fileList = [...files.values()].map((f) => {
    let status = 'read'
    if (f.attempts.length) status = f.lastKind === 'edit' && !isSettled(f.lastT, t, steps) ? 'editing' : 'done'
    if (f.attempts.length === 0) status = 'read'
    if (reverted.has(f.path)) status = 'done'
    const lastAttempt = f.attempts[f.attempts.length - 1]
    return {
      ...f,
      status,
      sensitive: sensitive.has(f.path),
      ignored: ignored.has(f.path),
      reverted: reverted.has(f.path),
      rejectedCount: f.attempts.filter((a) => rejected.has(`${f.path}#${a.n}`)).length,
      lastAttempt,
    }
  }).sort((a, b) => (b.lastT ?? 0) - (a.lastT ?? 0))

  const active = fileList.filter((f) => !f.ignored)
  const live = active.filter((f) => !f.reverted)
  const totals = {
    files: live.filter((f) => f.attempts.length).length,
    add: live.reduce((n, f) => n + f.add, 0),
    del: live.reduce((n, f) => n + f.del, 0),
    sensitive: live.filter((f) => f.sensitive).length,
    reads: active.reduce((n, f) => n + f.reads, 0),
    reverted: active.filter((f) => f.reverted).length,
  }

  // ---- 步骤 ----
  const current = [...steps].reverse().find((s) => s.status === 'running')
    ?? [...steps].reverse().find((s) => s.status !== 'pending')
    ?? null
  for (const s of steps) {
    if (skipped.has(s.id) && s.status !== 'done') s.skipped = true
    const start = s.startT ?? Infinity
    const end = s.endT ?? t
    const inStep = events.filter((e) => e.t >= start && e.t <= end)
    const edits = inStep.filter((e) => e.type === 'file.edit')
    const ends = inStep.filter((e) => e.type === 'cmd.end')
    const test = [...inStep].reverse().find((e) => e.type === 'test.result')
    s.facts = {
      files: new Set(edits.map((e) => e.path)).size,
      add: edits.reduce((n, e) => n + e.add, 0),
      del: edits.reduce((n, e) => n + e.del, 0),
      exit: ends.length ? ends[ends.length - 1].exit : null,
      tests: test ? { passed: test.passed, failed: test.failed } : null,
    }
  }

  // ---- 信号：推进还是打转 ----
  const finished = Boolean(artifact)
  const signals = []
  // 只有「产生新东西」的事件才算进展，反复读取不算
  const meaningful = [...events].reverse().find((e) => e.type !== 'file.read')
  const lastT = meaningful?.t ?? 0
  const silence = Math.max(0, t - lastT)

  // 连续失败的命令 / 连续失败的测试，比总次数更能说明打转
  let failStreak = 0
  let maxFailStreak = 0
  let testFailStreak = 0
  let maxTestFailStreak = 0
  for (const c of commands.values()) {
    if (c.exit == null || c.status === 'blocked') continue
    if (c.exit === 0) { failStreak = 0 } else { failStreak++; maxFailStreak = Math.max(maxFailStreak, failStreak) }
  }
  for (const e of events) {
    if (e.type !== 'test.result') continue
    if (e.failed > 0) { testFailStreak++; maxTestFailStreak = Math.max(maxTestFailStreak, testFailStreak) } else testFailStreak = 0
  }

  if (!finished) {
    if (silence >= SILENCE_ALERT) {
      signals.push({ kind: 'silence', level: 'warn', text: `已 ${fmtSec(silence)}没有新进展`, anchor: current ? `step-${current.id}` : 'activity' })
    }
    if (maxFailStreak >= CMD_REPEAT_ALERT) {
      signals.push({ kind: 'repeat-cmd', level: 'warn', text: `同一命令连续失败 ${maxFailStreak} 次：${[...commands.values()].find((c) => c.status === 'fail')?.cmd ?? ''}`, anchor: current ? `step-${current.id}` : 'activity' })
    }
    for (const f of active) {
      if (f.attempts.length >= FILE_CHURN_ALERT) signals.push({ kind: 'churn-file', level: 'warn', text: `${shortPath(f.path)} 已改 ${f.attempts.length} 版`, anchor: `file-${slug(f.path)}` })
      if (f.reads >= READ_CHURN_ALERT && !f.attempts.length) signals.push({ kind: 'churn-read', level: 'warn', text: `${shortPath(f.path)} 已被重读 ${f.reads} 次`, anchor: `file-${slug(f.path)}` })
    }
    if (maxTestFailStreak >= FAIL_REPEAT_ALERT) {
      signals.push({ kind: 'repeat-fail', level: 'warn', text: `同一用例连续失败 ${maxTestFailStreak} 次：${tests?.cases.find((c) => !c.ok)?.name ?? ''}`, anchor: current ? `step-${current.id}` : 'activity' })
    }
  }

  const runningCmd = [...commands.values()].find((c) => c.status === 'running' && !takeover)
  const doing = takeover
    ? '已接管 · agent 已暂停'
    : finished
      ? '已完成 · 等待验收'
      : runningCmd
      ? `运行 ${runningCmd.cmd}`
      : active.find((f) => f.status === 'editing')
        ? `编辑 ${shortPath(active.find((f) => f.status === 'editing').path)}`
        : current
          ? `第 ${current.index}/${scenario.steps.length} 步 · ${current.title}`
          : '等待开始'

  const scope = `${totals.files} 个文件 +${totals.add} −${totals.del}${totals.sensitive ? ` · ${totals.sensitive} 个敏感文件` : ''}`
  const top = signals[0]
  const momentum = finished
    ? `已完成 · ${tests ? tests.passed : 0} 用例通过`
    : !top
      ? `推进正常 · 距上次进展 ${fmtSec(silence)}`
      : top.kind === 'silence'
        ? `停滞 ${fmtSec(silence)}`
        : top.kind === 'repeat-cmd'
          ? `连续失败 ${maxFailStreak} 次`
          : top.kind === 'repeat-fail'
            ? `同一用例失败 ${maxTestFailStreak} 次`
            : top.kind === 'churn-read'
              ? '反复重读同一文件'
              : '反复修改同一文件'

  return {
    t,
    task: scenario.task,
    steps,
    current,
    files: fileList,
    totals,
    commands: [...commands.values()],
    tests,
    activity: activity.slice(-60),
    notes,
    artifact: artifact ? { ...artifact, files: totals.files, add: totals.add, del: totals.del } : null,
    signals,
    takeover,
    focus,
    skippedCases,
    proofRequested,
    interventions: interventions.map((i) => ({ ...i })),
    now: {
      doing,
      scope,
      momentum,
      level: signals.some((s) => s.level === 'warn') ? 'warn' : 'ok',
      silence,
    },
    lastEventT: lastT,
  }
}

function ensureFile(files, path) {
  if (!files.has(path)) {
    files.set(path, { path, reads: 0, attempts: [], add: 0, del: 0, lastT: 0, lastKind: 'read' })
  }
  return files.get(path)
}

function isSettled(lastT, now, steps) {
  // 编辑发生在「当前正在跑的步骤」里就算 editing，否则视为完成
  const running = steps.find((s) => s.status === 'running')
  if (!running) return true
  return lastT < running.startT
}

export function shortPath(path) {
  const parts = path.split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : path
}

export function shortCmd(cmd) {
  return cmd.length > 26 ? cmd.slice(0, 24) + '…' : cmd
}

export function slug(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-')
}

/** 文件当前补丁（默认最新一版） */
export function patchOf(file) {
  const a = file.attempts[file.attempts.length - 1]
  return a ? a.hunk : null
}

/** 「与上次尝试的差」：对两版补丁做行级比较 */
export function attemptDiff(file) {
  const n = file.attempts.length
  if (n < 2) return null
  const prev = file.attempts[n - 2].hunk.lines.map((l) => l.text)
  const cur = file.attempts[n - 1].hunk.lines.map((l) => l.text)
  const lines = compact(diffLines(prev, cur), 2)
  return { lines, changes: countChanges(diffLines(prev, cur)), from: n - 1, to: n }
}

export { STATUS_TEXT }
