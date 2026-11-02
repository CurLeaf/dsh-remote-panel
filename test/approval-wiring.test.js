import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { API_PREFIX, apply, approvals, handleRequest } from '../lib/index.js'

const TOKEN = 'wiring-token'

/** 只实现 apply() 会用到的那几个面：webServer 注入、approval 注入、effect。 */
const fakeCtx = () => {
  const approvalListeners = []
  const disposers = []
  const ctx = {
    inject(names, setup) {
      if (names.includes('approval')) {
        setup({
          on(event, listener) {
            approvalListeners.push({ event, listener })
            return () => {}
          },
          effect(fn) {
            const dispose = fn()
            disposers.push(dispose)
            return () => {}
          },
        })
      }
      if (names.includes('webServer')) {
        setup({
          on() {},
          effect(fn) {
            const dispose = fn()
            disposers.push(dispose)
            return () => {}
          },
          webServer: { tapIndex: () => () => {}, register: () => () => {} },
        })
      }
    },
    effect(fn) {
      const dispose = fn()
      disposers.push(dispose)
      return () => {}
    },
  }
  return { ctx, approvalListeners, disposers }
}

const call = async (method, path, body, token = TOKEN) => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = Object.assign((async function* () { for (const c of chunks) yield c })(), {
    method, url: API_PREFIX + path, headers: { 'x-dsh-remote-panel': token },
  })
  let payload = ''
  const res = new Writable({ write(c, _e, cb) { payload += c.toString(); cb() } })
  res.writeHead = () => res
  await handleRequest(req, res, { token: TOKEN })
  return JSON.parse(payload)
}

test('apply() 把 approval/request 接到桥上了', () => {
  const { ctx, approvalListeners } = fakeCtx()
  apply(ctx, { token: TOKEN, syncAssets: false, refreshLoginPage: false })
  assert.equal(approvalListeners.length, 1)
  assert.equal(approvalListeners[0].event, 'approval/request')
  assert.equal(typeof approvalListeners[0].listener, 'function')
})

test('没接管的会话走 next()，桌面行为不变', async () => {
  const { ctx, approvalListeners } = fakeCtx()
  apply(ctx, { token: TOKEN, syncAssets: false, refreshLoginPage: false })
  const listener = approvalListeners[0].listener
  const outcome = await listener({ agent: { session: { id: 'session-nowatch' } }, toolName: 'bash' }, async () => 'from-next')
  assert.equal(outcome, 'from-next')
})

test('接管后：/pending 看得到 → /approve 放行', async () => {
  const { ctx, approvalListeners } = fakeCtx()
  apply(ctx, { token: TOKEN, syncAssets: false, refreshLoginPage: false })
  const listener = approvalListeners[0].listener

  const watched = await call('POST', '/watch', { sessionId: 'session-watch', on: true })
  assert.ok(watched.watching.includes('session-watch'))

  const decided = listener(
    { agent: { session: { id: 'session-watch' } }, toolName: 'bash', reason: '要跑 rm -rf build/' },
    async () => 'from-next',
  )
  await new Promise((r) => setTimeout(r, 10))

  const pending = await call('GET', '/pending')
  assert.equal(pending.ok, true)
  const entry = pending.entries.find((e) => e.sessionId === 'session-watch')
  assert.ok(entry, '被接管的请求必须出现在 /pending')
  assert.equal(entry.toolName, 'bash')
  assert.equal(entry.reason, '要跑 rm -rf build/')

  const approved = await call('POST', '/approve', { id: entry.id, decision: 'allowed-once' })
  assert.equal(approved.ok, true)
  assert.equal(await decided, 'allowed-once')
  assert.equal((await call('GET', '/pending')).entries.length, 0)

  await call('POST', '/watch', { sessionId: 'session-watch', on: false })
})

test('接管后拒绝也生效，并把结果记进 /pending 变化', async () => {
  const { ctx, approvalListeners } = fakeCtx()
  apply(ctx, { token: TOKEN, syncAssets: false, refreshLoginPage: false })
  const listener = approvalListeners[0].listener
  await call('POST', '/watch', { sessionId: 'session-reject', on: true })
  const decided = listener({ agent: { session: { id: 'session-reject' } }, toolName: 'write' }, async () => 'x')
  await new Promise((r) => setTimeout(r, 10))
  const id = (await call('GET', '/pending')).entries[0].id
  await call('POST', '/approve', { id, decision: 'rejected' })
  assert.equal(await decided, 'rejected')
  await call('POST', '/watch', { sessionId: 'session-reject', on: false })
})

test.after(() => approvals.close())
