import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOverview, pendingLabel, STALE_MS } from '../console/overview.js'

const NOW = 1_800_000_000_000
const rows = [
  { id: 'a', title: '等批准的会话', updatedAt: NOW - 5_000, cwd: '/w' },
  { id: 'b', title: '刚跑完的会话', updatedAt: NOW - 10_000 },
  { id: 'c', title: '卡住的会话', updatedAt: NOW - STALE_MS - 1 },
  { id: 'd', title: '在跑的会话', updatedAt: NOW - 1_000 },
  { id: 'e', title: '闲着的会话', updatedAt: NOW - 60_000 },
]
const status = new Map([
  ['a', { running: true, pendingInteraction: { kind: 'approval' } }],
  ['b', { running: false, completionUnread: true }],
  ['c', { running: true }],
  ['d', { running: true }],
])

test('待处理排在最前，其次完成未读、卡住', () => {
  const { sessions, inbox, counts } = buildOverview({ rows, status, now: NOW })
  assert.deepEqual(sessions.slice(0, 4).map((s) => s.id), ['a', 'b', 'c', 'd'])
  assert.equal(sessions[4].id, 'e')
  assert.deepEqual(inbox.map((s) => s.id), ['a', 'b', 'c'])
  assert.deepEqual(counts, { pending: 1, done: 1, stale: 1, running: 1, total: 5 })
})

test('同一级别按最后活动时间倒序', () => {
  const same = [
    { id: 'x', title: 'x', updatedAt: NOW - 30_000 },
    { id: 'y', title: 'y', updatedAt: NOW - 1_000 },
  ]
  const { sessions } = buildOverview({ rows: same, status: new Map(), now: NOW })
  assert.deepEqual(sessions.map((s) => s.id), ['y', 'x'])
})

test('pending 标签能从常见字段里抠出来，抠不出给兜底', () => {
  assert.equal(pendingLabel({ kind: 'approval' }), 'approval')
  assert.equal(pendingLabel({ request: { toolName: 'bash' } }), 'bash')
  assert.equal(pendingLabel({ title: '要跑 rm -rf build/' }), '要跑 rm -rf build/')
  assert.equal(pendingLabel({}), '等你处理')
  assert.equal(pendingLabel(null), null)
})

test('没有 updatedAt 的会话不判卡住', () => {
  const { sessions } = buildOverview({ rows: [{ id: 'z', title: 'z', updatedAt: null }], status: new Map([['z', { running: true }]]), now: NOW })
  assert.equal(sessions[0].level, 'running')
  assert.equal(sessions[0].stale, false)
})

test('currentId 标出当前监看的会话', () => {
  const { sessions } = buildOverview({ rows, status, now: NOW, currentId: 'd' })
  assert.equal(sessions.find((s) => s.id === 'd').current, true)
  assert.equal(sessions.find((s) => s.id === 'a').current, false)
})

test('空输入不抛', () => {
  assert.deepEqual(buildOverview().sessions, [])
  assert.deepEqual(buildOverview({ rows: null, status: null }).inbox, [])
})
