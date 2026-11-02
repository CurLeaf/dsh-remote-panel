import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIO } from '../console/scenario.js'
import { deriveState, attemptDiff, fmtSec } from '../console/engine.js'
import { diffLines, compact, toPatchText } from '../console/diff.js'

const derive = (t, iv = [], flags = {}) => deriveState(SCENARIO, SCENARIO.events, t, iv, flags)

test('空状态：还没开始时不报范围与信号', () => {
  const s = derive(-1)
  assert.equal(s.totals.files, 0)
  assert.deepEqual(s.signals, [])
  assert.equal(s.current, null)
})

test('第一次编辑之后：文件、增量、状态都对得上', () => {
  const s = derive(42.5)
  const f = s.files.find((x) => x.path === 'src/auth/session.ts')
  assert.ok(f, '应当有 session.ts')
  assert.equal(f.add, 18)
  assert.equal(f.del, 4)
  assert.equal(f.attempts.length, 1)
  assert.equal(f.status, 'editing')
  assert.equal(s.totals.add, 18)
  assert.match(s.now.doing, /session\.ts/)
})

test('每一步只记自己的事实：改动量、exit、测试结果', () => {
  const s = derive(66)
  const s3 = s.steps.find((x) => x.id === 's3')
  const s4 = s.steps.find((x) => x.id === 's4')
  assert.equal(s3.facts.files, 3)
  assert.equal(s3.facts.add, 27)
  assert.equal(s4.facts.exit, 1)
  assert.deepEqual(s4.facts.tests, { passed: 4, failed: 2 })
  // 第 2 步没改文件，不能被第 3 步的改动串味
  assert.equal(s.steps.find((x) => x.id === 's2').facts.files, 0)
})

test('长静默被视为「在打转」', () => {
  const s = derive(300)
  assert.ok(s.signals.some((x) => x.kind === 'silence'), JSON.stringify(s.signals))
  assert.match(s.now.momentum, /停滞/)
  assert.equal(s.now.level, 'warn')
})

test('连续失败的命令被计为打转信号，而通过的不会', () => {
  const mid = derive(92)
  assert.ok(mid.signals.some((x) => x.kind === 'repeat-cmd'))
  const end = derive(416)
  assert.equal(end.signals.find((x) => x.kind === 'repeat-cmd'), undefined)
})

test('完成后：三行状态切换到验收态，历史告警不再打扰', () => {
  const s = derive(416)
  assert.ok(s.artifact)
  assert.equal(s.now.doing, '已完成 · 等待验收')
  assert.match(s.now.momentum, /已完成/)
  assert.equal(s.signals.length, 0)
  assert.equal(s.now.level, 'ok')
  // 产物数字取自真实累计，而不是写死的文案
  assert.equal(s.artifact.add, s.totals.add)
  assert.equal(s.artifact.files, s.totals.files)
})

test('回滚文件：范围立刻缩小，但文件仍在列表里（带已回滚状态）', () => {
  const s = derive(416, [{ kind: 'revert-file', tier: 'constrain', target: 'src/auth/session.ts' }])
  const f = s.files.find((x) => x.path === 'src/auth/session.ts')
  assert.equal(f.reverted, true)
  assert.equal(s.totals.files, 3)
  assert.equal(s.totals.add, 62 - 39)
})

test('忽略文件：从范围里剔除', () => {
  const s = derive(416, [{ kind: 'ignore-file', tier: 'constrain', target: 'src/config/feature-flags.ts' }])
  const f = s.files.find((x) => x.path === 'src/config/feature-flags.ts')
  assert.equal(f.ignored, true)
  assert.equal(s.totals.files, 3)
})

test('禁止再跑的命令被拦截，不再产生输出', () => {
  const s = derive(416, [{ kind: 'block-cmd', tier: 'constrain', target: 'pnpm vitest run src/auth' }])
  const blocked = s.commands.filter((c) => c.status === 'blocked')
  assert.ok(blocked.length >= 3)
  assert.equal(blocked[0].lines.length, 0)
})

test('终止运行中的命令：状态变 killed', () => {
  const s = derive(87, [{ kind: 'kill-cmd', tier: 'constrain', target: 'c3' }])
  const c = s.commands.find((x) => x.id === 'c3')
  assert.equal(c.status, 'killed')
})

test('接管：状态行改口，agent 不再推进视觉', () => {
  const s = derive(300, [], { takeover: true })
  assert.equal(s.takeover, true)
  assert.match(s.now.doing, /已接管/)
})

test('进行中的步骤只统计到这一刻，不提前泄漏结果', () => {
  const mid = derive(92)
  const s6 = mid.steps.find((x) => x.id === 's6')
  assert.equal(s6.facts.tests.failed, 1)
  const end = derive(416)
  assert.equal(end.steps.find((x) => x.id === 's7').facts.tests.failed, 0)
})

test('两版补丁之间能算出真实差异', () => {
  const s = derive(416)
  const f = s.files.find((x) => x.path === 'src/auth/session.ts')
  const d = attemptDiff(f)
  assert.ok(d)
  assert.equal(d.from, 2)
  assert.equal(d.to, 3)
  assert.ok(d.changes.add > 0 && d.changes.del > 0)
  assert.ok(d.lines.some((l) => l.type === 'add'))
})

test('diff 工具：上下文折叠与 patch 文本', () => {
  const a = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const b = ['a', 'b', 'c', 'X', 'e', 'f', 'g']
  const d = diffLines(a, b)
  assert.ok(d.some((l) => l.type === 'add' && l.text === 'X'))
  const c = compact(d, 1)
  assert.ok(c.some((l) => l.type === 'gap'))
  const text = toPatchText('x.ts', { header: '@@ -1 +1 @@', lines: [{ type: 'add', text: 'hi' }] })
  assert.match(text, /^\+\+\+ b\/x\.ts/m)
  assert.match(text, /^\+hi$/m)
})

test('时间格式化', () => {
  assert.equal(fmtSec(8), '8 秒')
  assert.equal(fmtSec(90), '1 分 30 秒')
  assert.equal(fmtSec(180), '3 分钟')
})
