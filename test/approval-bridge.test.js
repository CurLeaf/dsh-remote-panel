import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Writable } from 'node:stream'
import { createApprovalBridge } from '../lib/approval-bridge.js'
import { handleRequest, API_PREFIX } from '../lib/index.js'

const req = (sessionId = 'session-a') => ({ agent: { session: { id: sessionId } }, toolName: 'bash', callId: 'call-1', reason: '要跑 rm -rf build/' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('没接管时原样交给下一个回答者（桌面行为不变）', async () => {
  const bridge = createApprovalBridge()
  const request = req()
  const outcome = await bridge.intercept(request, async () => 'allowed-once')
  assert.equal(outcome, 'allowed-once')
  assert.equal(bridge.list().length, 0)
})

test('接管后挂起，手机批准才放行', async () => {
  const bridge = createApprovalBridge()
  bridge.setWatch('session-a', true)
  const promise = bridge.intercept(req(), async () => 'blocked-by-next')
  await sleep(0)
  const [entry] = bridge.list()
  assert.equal(entry.toolName, 'bash')
  assert.equal(entry.reason, '要跑 rm -rf build/')
  assert.equal(entry.sessionId, 'session-a')
  assert.equal(bridge.decide(entry.id, 'allowed-once'), true)
  assert.equal(await promise, 'allowed-once')
  assert.equal(bridge.list().length, 0)
})

test('重复点同一条返回 false（不会二次放行）', async () => {
  const bridge = createApprovalBridge()
  bridge.setWatch('session-a', true)
  const promise = bridge.intercept(req(), async () => 'x')
  await sleep(0)
  const id = bridge.list()[0].id
  assert.equal(bridge.decide(id, 'rejected'), true)
  assert.equal(bridge.decide(id, 'rejected'), false)
  assert.equal(await promise, 'rejected')
})

test('只认 allowed-once / rejected，别的一律当真', async () => {
  const bridge = createApprovalBridge()
  bridge.setWatch('session-a', true)
  const promise = bridge.intercept(req(), async () => 'x')
  await sleep(0)
  const id = bridge.list()[0].id
  assert.equal(bridge.decide(id, 'cancelled'), false)
  assert.equal(bridge.decide(id, 'unavailable'), false)
  assert.equal(bridge.list().length, 1, '非法答案不能把请求弄丢')
  bridge.close()
  assert.equal(await promise, 'unavailable')
})

test('超时回 unavailable，fail closed', async () => {
  const bridge = createApprovalBridge({ timeoutMs: 20 })
  bridge.setWatch('session-a', true)
  const outcome = await bridge.intercept(req(), async () => 'x')
  assert.equal(outcome, 'unavailable')
  assert.equal(bridge.list().length, 0)
})

test('请求被取消回 cancelled', async () => {
  const bridge = createApprovalBridge()
  bridge.setWatch('session-a', true)
  const controller = new AbortController()
  const promise = bridge.intercept({ ...req(), signal: controller.signal }, async () => 'x')
  await sleep(0)
  controller.abort()
  assert.equal(await promise, 'cancelled')
})

test('别的会话的请求不拦', async () => {
  const bridge = createApprovalBridge()
  bridge.setWatch('session-a', true)
  const outcome = await bridge.intercept(req('session-b'), async () => 'next-wins')
  assert.equal(outcome, 'next-wins')
})

/* ---------- 路由 ---------- */

const callRoute = async (method, path, body, token = 'test-token') => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const request = Object.assign(
    (async function* () { for (const c of chunks) yield c })(),
    { method, url: API_PREFIX + path, headers: { 'x-dsh-remote-panel': token } },
  )
  let payload = ''
  const response = new Writable({ write(chunk, _enc, cb) { payload += chunk.toString(); cb() } })
  response.writeHead = () => response
  await handleRequest(request, response, { token: 'test-token' })
  return { status: payload ? 200 : 0, body: payload ? JSON.parse(payload) : null }
}

test('待批路由需要令牌', async () => {
  const bad = await callRoute('GET', '/pending', undefined, 'wrong')
  assert.equal(bad.body.ok, false)
  assert.match(bad.body.error, /令牌不匹配/)
})

test('watch → pending 能看到接管标记', async () => {
  const on = await callRoute('POST', '/watch', { sessionId: 'session-route', on: true })
  assert.equal(on.body.ok, true)
  assert.ok(on.body.watching.includes('session-route'))
  const list = await callRoute('GET', '/pending')
  assert.ok(list.body.watching.includes('session-route'))
  await callRoute('POST', '/watch', { sessionId: 'session-route', on: false })
})

test('approve 缺字段 / 不存在的 id 都被拒', async () => {
  const missing = await callRoute('POST', '/approve', { decision: 'allowed-once' })
  assert.equal(missing.body.ok, false)
  assert.match(missing.body.error, /缺少待批 id/)
  const stale = await callRoute('POST', '/approve', { id: 'nope', decision: 'allowed-once' })
  assert.equal(stale.body.ok, false)
  assert.match(stale.body.error, /已经不在了/)
})
