import { diffLines, countChanges } from './diff.js'

/** 已经有专用渲染（命令 / 文件 / 待办）的工具，不再重复进通用时间线。 */
const RICH_TOOLS = new Set(['bash', 'read', 'edit', 'write', 'str_replace_editor', 'todo_write'])

/** 给通用工具配一句话摘要：优先挑最有信息量的参数。 */
export function summarizeArgs(name, args) {
  const a = args ?? {}
  const pick = [a.command, a.query, a.file_path, a.path, a.pattern, a.url, a.prompt, a.description, a.goal, a.task]
  for (const value of pick) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim().replace(/\s+/g, ' ').slice(0, 80)
  }
  if (args && typeof args === 'object') {
    const keys = Object.keys(args)
    if (keys.length > 0) return `${keys.slice(0, 3).join(', ')}`
  }
  return name
}

/** 终端一次最多收多少行，避免把整份构建日志塞进内存。 */
const MAX_CMD_LINES = 300

const VITEST = /\bTests?\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i
const JEST = /Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/i

/** 从 bash 输出末尾的 `[exit code: N]` 取退出码；没有就当 0。 */
export function parseExit(text) {
  const m = /\[exit code: (-?\d+)\]/.exec(text ?? '')
  return m === null ? null : Number(m[1])
}

/** 从测试输出里认出「几个过、几个挂」。认不出就不编。 */
export function parseTests(text) {
  const s = text ?? ''
  let m = VITEST.exec(s)
  if (m !== null) return { passed: Number(m[1]), failed: Number(m[2] ?? 0) }
  m = JEST.exec(s)
  if (m !== null) return { passed: Number(m[2]), failed: Number(m[1] ?? 0) }
  return null
}

/** tool/result 的模型可见文本。 */
function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

function parseArgs(raw) {
  if (typeof raw !== 'string') return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function splitLines(text) {
  const s = String(text ?? '')
  return s === '' ? [] : s.replace(/\n$/, '').split('\n')
}

/**
 * 把一条 DSH session 的事件流，翻译成监看屏认识的 (scenario, events)。
 *
 * - 步骤优先取 agent 自己的 todo 列表（`todo/write`），没有就退回 turn。
 * - 文件改动取 `tool/result.meta.diffs` 里的 before/after 文本，自己算行级 diff。
 * - 命令取 bash 的入参和输出，退出码读 `[exit code: N]`。
 * - 纯函数：同样的输入永远得到同样的输出。
 *
 * @param {{cwd?: string, title?: string, id?: string}} session
 * @param {Array<{type: string, seq?: number, time: number, data?: any}>} rawEvents
 */
export function normalizeSession(session, rawEvents) {
  const input = (rawEvents ?? [])
    .filter((e) => e && typeof e.time === 'number')
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.time - b.time)
  const startMs = input.length ? input[0].time : Date.now()
  const clock = (ms) => Math.max(0, Math.round((ms - startMs) / 100) / 10)
  // 有 todo 就按 todo 分步；没有才退回 turn，避免两套步骤混在一起
  const hasTodos = input.some(
    (e) => e.type === 'todo/write' || (e.type === 'tool/call' && e.data?.name === 'todo_write'),
  )

  const out = []
  const steps = []
  const stepByKey = new Map()
  let lastStepId = null
  const calls = new Map()
  const attempts = new Map()
  let turnTitle = ''
  let lastTurnStep = null

  const ensureStep = (content) => {
    let step = stepByKey.get(content)
    if (step === undefined) {
      step = { id: `todo-${steps.length + 1}`, index: steps.length + 1, title: content, status: 'pending', startT: null, endT: null, started: false }
      steps.push(step)
      stepByKey.set(content, step)
    }
    return step
  }

  const startStep = (step, at) => {
    if (step.started) return
    step.started = true
    step.startT = at
    out.push({ type: 'step.start', step: step.id, t: at })
  }

  const applyTodos = (todos, at) => {
    if (!Array.isArray(todos) || todos.length === 0) return
    for (const todo of todos) {
      const content = typeof todo?.content === 'string' ? todo.content : ''
      if (content === '') continue
      const step = ensureStep(content)
      if (todo.status === 'in_progress') {
        startStep(step, at)
        lastStepId = step.id
      } else if (todo.status === 'completed') {
        startStep(step, at)
        if (step.endT === null) {
          step.endT = at
          out.push({ type: 'step.end', step: step.id, ok: true, t: at })
        }
      }
    }
  }

  for (const e of input) {
    const at = clock(e.time)
    const d = e.data ?? {}
    switch (e.type) {
      case 'turn/start': {
        if (!hasTodos) {
          const step = { id: `turn-${d.turn}`, index: steps.length + 1, title: '', status: 'running', startT: at, endT: null, started: true }
          steps.push(step)
          lastTurnStep = step
          lastStepId = step.id
          out.push({ type: 'step.start', step: step.id, t: at })
        }
        break
      }
      case 'turn/end': {
        if (!hasTodos && lastTurnStep !== null && lastTurnStep.endT === null) {
          lastTurnStep.endT = at
          out.push({ type: 'step.end', step: lastTurnStep.id, ok: true, t: at })
        }
        lastTurnStep = null
        turnTitle = ''
        break
      }
      case 'user/message': {
        const text = textOf(d).trim()
        if (text !== '' && turnTitle === '') turnTitle = text.slice(0, 80)
        if (!hasTodos && lastTurnStep !== null && lastTurnStep.title === '' && text !== '') {
          lastTurnStep.title = text.slice(0, 40)
        }
        break
      }
      case 'todo/write': {
        applyTodos(d.todos, at)
        break
      }
      case 'tool/call': {
        const call = { id: d.callId, name: d.name, args: parseArgs(d.arguments), t: at, text: '' }
        calls.set(d.callId, call)
        if (!RICH_TOOLS.has(d.name)) {
          out.push({ type: 'tool.start', id: d.callId, name: d.name, summary: summarizeArgs(d.name, call.args), t: at })
        }
        if (d.name === 'read') {
          const path = call.args.file_path
          if (typeof path === 'string') out.push({ type: 'file.read', path, t: at })
        } else if (d.name === 'bash') {
          const cmd = typeof call.args.command === 'string' ? call.args.command : ''
          if (cmd !== '') out.push({ type: 'cmd.start', id: d.callId, cmd, t: at })
        }
        break
      }
      case 'tool/result': {
        const message = d.message ?? {}
        const call = calls.get(message.toolCallId)
        if (call === undefined) break
        const text = textOf(message)
        if (call.name === 'bash') {
          const lines = splitLines(text)
          for (const line of lines.slice(0, MAX_CMD_LINES)) out.push({ type: 'cmd.line', id: call.id, stream: message.isError ? 'err' : 'out', line, t: at })
          const exit = parseExit(text) ?? (message.isError ? 1 : 0)
          out.push({ type: 'cmd.end', id: call.id, exit, dur: Math.max(0, at - call.t), t: at })
          const tests = parseTests(text)
          if (tests !== null) out.push({ type: 'test.result', passed: tests.passed, failed: tests.failed, t: at })
        } else if (call.name === 'edit' || call.name === 'write' || call.name === 'str_replace_editor') {
          const diffs = d.meta && Array.isArray(d.meta.diffs) ? d.meta.diffs : []
          for (const diff of diffs) {
            const path = typeof diff?.path === 'string' ? diff.path : call.args.file_path
            if (typeof path !== 'string' || path === '') continue
            const before = splitLines(diff?.oldText)
            const after = splitLines(diff?.newText)
            const lines = diffLines(before, after)
            const changes = countChanges(lines)
            const attempt = (attempts.get(path) ?? 0) + 1
            attempts.set(path, attempt)
            out.push({
              type: 'file.edit',
              path,
              attempt,
              add: changes.add,
              del: changes.del,
              hunk: { header: `@@ ${path} @@`, lines },
              t: at,
            })
          }
        } else if (call.name === 'todo_write') {
          // 新版按 todo/write 事件走；旧日志只有工具调用，这里兜底
          applyTodos(call.args.todos, at)
        } else {
          // 其余工具（web_search / grep / subagent / mcp / job …）统一进时间线：
          // 名字 + 一句话摘要 + 结果首行，手机上一眼看出「这一步调了什么」。
          out.push({
            type: 'tool.end',
            id: call.id,
            name: call.name,
            ok: message.isError !== true,
            dur: Math.max(0, at - call.t),
            text: textOf(message).trim().slice(0, 220),
            t: at,
          })
        }
        break
      }
      default:
        break
    }
  }

  const openStep = [...steps].reverse().find((s) => s.startT !== null && s.endT === null)
  const lastEnded = [...steps].reverse().find((s) => s.endT !== null)
  const currentStepId = openStep?.id ?? lastEnded?.id ?? null
  const firstUser = input.find((e) => e.type === 'user/message')
  const fallbackTitle = firstUser ? textOf(firstUser.data?.message).trim().slice(0, 40) : ''
  for (const step of steps) {
    if (step.title === '') step.title = `第 ${step.index} 轮`
    delete step.started
  }
  const task = {
    id: session?.id ?? '',
    title: session?.title || fallbackTitle || '未命名会话',
    intent: session?.title || fallbackTitle || '',
    branch: '',
    workdir: typeof session?.cwd === 'string' ? session.cwd : '',
  }

  return {
    scenario: { task, steps, duration: input.length ? clock(input[input.length - 1].time) : 0 },
    events: out,
    startMs,
    endMs: input.length ? input[input.length - 1].time : startMs,
    activeStepId: currentStepId,
  }
}
