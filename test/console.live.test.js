import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSession, parseExit, parseTests } from '../console/live.js'

const T0 = 1_700_000_000_000
let seq = 0
const ev = (type, data, ms = 0) => ({ type, seq: seq++, time: T0 + ms, data })

const session = { id: 'session-1', cwd: '/home/me/app', title: '修登录竞态' }

test('退出码只认输出里的标记', () => {
  assert.equal(parseExit('done\n[exit code: 2]'), 2)
  assert.equal(parseExit('all good'), null)
  assert.equal(parseExit(''), null)
})

test('认出 vitest / jest 的测试汇总', () => {
  assert.deepEqual(parseTests('Tests  4 passed | 2 failed (6)'), { passed: 4, failed: 2 })
  assert.deepEqual(parseTests('Tests  6 passed (6)'), { passed: 6, failed: 0 })
  assert.deepEqual(parseTests('Tests:       1 failed, 6 passed, 7 total'), { passed: 6, failed: 1 })
  assert.equal(parseTests('no summary here'), null)
})

test('todo 列表变成步骤，命令、退出码、测试都落到事件里', () => {
  seq = 0
  const events = [
    ev('turn/start', { turn: 1 }, 0),
    ev('todo/write', { todos: [
      { content: '复现问题', status: 'in_progress' },
      { content: '修掉竞态', status: 'pending' },
    ] }, 1000),
    ev('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'pnpm vitest run' }) }, 1200),
    ev('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'Tests  4 passed | 2 failed (6)\n[exit code: 1]' }] } }, 6200),
    ev('todo/write', { todos: [
      { content: '复现问题', status: 'completed' },
      { content: '修掉竞态', status: 'in_progress' },
    ] }, 7200),
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 9000),
  ]
  const { scenario, events: out, activeStepId } = normalizeSession(session, events)
  assert.equal(scenario.steps.length, 2)
  assert.equal(scenario.steps[0].title, '复现问题')
  assert.equal(scenario.task.title, '修登录竞态')
  assert.equal(activeStepId, 'todo-2')

  const starts = out.filter((e) => e.type === 'step.start')
  const ends = out.filter((e) => e.type === 'step.end')
  assert.equal(starts.length, 2)
  assert.equal(ends.length, 1)
  assert.equal(ends[0].step, 'todo-1')
  assert.equal(starts[1].step, 'todo-2')

  const cmdEnd = out.find((e) => e.type === 'cmd.end')
  assert.equal(cmdEnd.exit, 1)
  assert.equal(cmdEnd.dur, 5)
  assert.equal(out.filter((e) => e.type === 'cmd.line').length, 2)

  const testResult = out.find((e) => e.type === 'test.result')
  assert.deepEqual({ passed: testResult.passed, failed: testResult.failed }, { passed: 4, failed: 2 })
  assert.ok(scenario.duration >= 9)
})

test('edit 的结果 meta 直接给出文件前后文本', () => {
  seq = 0
  const events = [
    ev('turn/start', { turn: 1 }, 0),
    ev('tool/call', { turn: 1, step: 1, callId: 'c9', name: 'edit', arguments: JSON.stringify({ file_path: '/home/me/app/src/a.ts' }) }, 500),
    ev('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c9', content: [{ type: 'text', text: 'ok' }] }, meta: { diffs: [{ path: '/home/me/app/src/a.ts', oldText: 'one\ntwo', newText: 'one\nthree' }] } }, 1500),
  ]
  const { events: out } = normalizeSession(session, events)
  const edit = out.find((e) => e.type === 'file.edit')
  assert.equal(edit.path, '/home/me/app/src/a.ts')
  assert.equal(edit.attempt, 1)
  assert.equal(edit.add, 1)
  assert.equal(edit.del, 1)
  assert.ok(edit.hunk.lines.some((l) => l.type === 'add' && l.text === 'three'))
})

test('没有 todo 时退回 turn 作为步骤', () => {
  seq = 0
  const events = [
    ev('turn/start', { turn: 1 }, 0),
    ev('user/message', { role: 'user', content: [{ type: 'text', text: '把登录修好' }] }, 100),
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 5000),
  ]
  const { scenario, events: out } = normalizeSession(session, events)
  assert.equal(scenario.steps.length, 1)
  assert.equal(scenario.steps[0].title, '把登录修好')
  assert.equal(out.filter((e) => e.type === 'step.start').length, 1)
  assert.equal(out.filter((e) => e.type === 'step.end').length, 1)
})
