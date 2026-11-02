import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { addMark, loadRelay, markSeen, normalizeRelay, removeMark } from '../lib/relay.js'
import { API_PREFIX, handleRequest } from '../lib/index.js'

const dir = () => mkdtempSync(join(tmpdir(), 'relay-'))
const pathIn = (d) => join(d, 'remote-panel', 'relay.json')

test('坏文件 / 缺字段都归一化成空结构', () => {
  const d = dir()
  assert.deepEqual(loadRelay(pathIn(d)), { version: 1, lastSeen: null, marks: [] })
  writeFileSync(pathIn(d).replace('/remote-panel/relay.json', '/x'), '')
  assert.deepEqual(normalizeRelay({ lastSeen: { sessionId: 1 }, marks: 'nope' }), { version: 1, lastSeen: null, marks: [] })
})

test('记录看到的步骤并落盘', () => {
  const d = dir()
  const relay = markSeen(pathIn(d), { sessionId: 'session-a', stepId: 'todo-2', index: 2, title: '写测试' })
  assert.equal(relay.lastSeen.sessionId, 'session-a')
  assert.equal(relay.lastSeen.index, 2)
  assert.equal(loadRelay(pathIn(d)).lastSeen.title, '写测试')
  JSON.parse(readFileSync(pathIn(d), 'utf8'))
})

test('标记去重、可以删除', () => {
  const d = dir()
  addMark(pathIn(d), { sessionId: 'session-a', text: '回去看这个 diff' }, 'm1')
  addMark(pathIn(d), { sessionId: 'session-a', text: '回去看这个 diff' }, 'm2')
  const relay = loadRelay(pathIn(d))
  assert.equal(relay.marks.length, 1, '同会话同文案只留一条')
  assert.equal(relay.marks[0].id, 'm1')
  const after = removeMark(pathIn(d), 'm1')
  assert.equal(after.marks.length, 0)
})

test('缺 sessionId / text 的标记直接忽略', () => {
  const d = dir()
  addMark(pathIn(d), { sessionId: '', text: 'x' }, 'm1')
  addMark(pathIn(d), { sessionId: 'session-a', text: '   ' }, 'm2')
  assert.equal(loadRelay(pathIn(d)).marks.length, 0)
})

const call = async (method, path, body, token = 'test-token') => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Object.assign((async function* () { for (const c of chunks) yield c })(), {
    method, url: API_PREFIX + path, headers: { 'x-dsh-remote-panel': token },
  })
  let payload = ''
  const res = new Writable({ write(c, _e, cb) { payload += c.toString(); cb() } })
  res.writeHead = () => res
  await handleRequest(req, res, { token: 'test-token' })
  return JSON.parse(payload)
}

test('relay 路由：看到 / 标记 / 删除', async () => {
  process.env.DSH_HOME = dir()
  try {
    const seen = await call('POST', '/relay/seen', { sessionId: 'session-r', stepId: 'todo-1', index: 1, title: '读代码' })
    assert.equal(seen.ok, true)
    assert.equal(seen.relay.lastSeen.sessionId, 'session-r')

    const marked = await call('POST', '/relay/mark', { sessionId: 'session-r', text: '这条 diff 要看' })
    assert.equal(marked.ok, true)
    assert.equal(marked.relay.marks.length, 1)
    const id = marked.relay.marks[0].id

    const listed = await call('GET', '/relay')
    assert.equal(listed.relay.marks[0].id, id)

    const unmarked = await call('POST', '/relay/unmark', { id })
    assert.equal(unmarked.relay.marks.length, 0)
  } finally {
    delete process.env.DSH_HOME
  }
})

test('relay 标记缺字段给 400', async () => {
  process.env.DSH_HOME = dir()
  try {
    const bad = await call('POST', '/relay/mark', { sessionId: '' })
    assert.equal(bad.ok, false)
    assert.match(bad.error, /缺少 sessionId 或 text/)
  } finally {
    delete process.env.DSH_HOME
  }
})
