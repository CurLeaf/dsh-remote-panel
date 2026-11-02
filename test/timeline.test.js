import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveState } from '../console/engine.js'
import { summarizeArgs } from '../console/live.js'

const scenario = () => ({
  task: { title: 't', branch: '', workdir: '/w', intent: '' },
  steps: [{ id: 's1', index: 1, title: '查资料', status: 'pending', startT: null, endT: null }, { id: 's2', index: 2, title: '写代码', status: 'pending', startT: null, endT: null }],
  duration: 60,
})

test('通用工具调用进时间线：名字 / 摘要 / 耗时 / 结果', () => {
  const events = [
    { t: 0, type: 'step.start', step: 's1' },
    { t: 1, type: 'tool.start', id: 'c1', name: 'web_search', summary: 'codex 双端' },
    { t: 4, type: 'tool.end', id: 'c1', name: 'web_search', ok: true, dur: 3, text: '三条结果\n第二条' },
    { t: 5, type: 'step.end', step: 's1', ok: true },
    { t: 6, type: 'step.start', step: 's2' },
    { t: 60, type: 'tool.start', id: 'c2', name: 'grep', summary: 'deriveState' },
  ]
  const d = deriveState(scenario(), events, 60)
  const s1 = d.steps[0]
  const s2 = d.steps[1]
  assert.equal(s1.calls.length, 1)
  assert.equal(s1.calls[0].name, 'web_search')
  assert.equal(s1.calls[0].summary, 'codex 双端')
  assert.equal(s1.calls[0].dur, 3)
  assert.equal(s1.calls[0].ok, true)
  assert.equal(s2.calls.length, 1, '运行中的调用也要出现')
  assert.equal(s2.calls[0].dur, null)
  assert.ok(d.activity.some((a) => a.kind === 'tool' && a.text.includes('web_search')))
})

test('运行中的步骤超过 3 分钟标卡住，并算出耗时', () => {
  const events = [
    { t: 0, type: 'step.start', step: 's1' },
    { t: 200, type: 'tool.start', id: 'c9', name: 'bash', summary: 'npm test' },
  ]
  const d = deriveState(scenario(), events, 200)
  assert.equal(d.steps[0].stale, true)
  assert.ok(d.steps[0].elapsed >= 200)
  const quick = deriveState(scenario(), events, 60)
  assert.equal(quick.steps[0].stale, false)
  assert.equal(quick.steps[0].elapsed, 60)
})

test('步骤上的调用次数会计入 facts', () => {
  const events = [
    { t: 0, type: 'step.start', step: 's1' },
    { t: 1, type: 'tool.start', id: 'a', name: 'grep', summary: 'x' },
    { t: 2, type: 'cmd.start', id: 'b', cmd: 'ls' },
    { t: 3, type: 'step.end', step: 's1', ok: true },
  ]
  const d = deriveState(scenario(), events, 5)
  assert.equal(d.steps[0].facts.calls, 2)
})

test('摘要优先挑最有信息量的参数', () => {
  assert.equal(summarizeArgs('bash', { command: 'ls -la' }), 'ls -la')
  assert.equal(summarizeArgs('web_search', { queries: [], query: '双端互联' }), '双端互联')
  assert.equal(summarizeArgs('read', { file_path: '/a/b.ts' }), '/a/b.ts')
  assert.equal(summarizeArgs('mcp__x__y', { zeta: 1, alpha: 2 }), 'zeta, alpha')
  assert.equal(summarizeArgs('unknown', null), 'unknown')
  assert.equal(summarizeArgs('subagent', { prompt: '  多   空格  ' }), '多 空格')
})
