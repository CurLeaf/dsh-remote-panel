// 演示场景：一次真实的「登录态失效」修复过程。
// 时间单位为虚拟秒；UI 用 20x 速度播放，也可以直接拖动时间轴跳到任意时刻。
// 这份数据刻意包含：多轮尝试、同一命令重试、重复失败、一个敏感文件、一段长静默，
// 用来验证「推进 / 打转」「范围」「对照物」这些判断信号。

const hunk = (header, lines) => ({ header, lines })

export const SCENARIO = {
  task: {
    id: 'task-auth-race',
    title: '修复登录态偶发失效',
    branch: 'fix/auth-race',
    workdir: '~/WorkSpace/acme-web',
    intent: '登录偶发失效：有时 401 之后会被直接登出。先查一下原因，别动生产配置。',
    previewUrl: 'http://127.0.0.1:4173/login',
    totalSteps: 7,
  },
  steps: [
    { id: 's1', index: 1, title: '复现登录态失效', expect: '能稳定复现 401 后会话被清空' },
    { id: 's2', index: 2, title: '定位竞态点', expect: '找到 refresh 与 logout 的交叠窗口' },
    { id: 's3', index: 3, title: '第一次修复 session 恢复', expect: '401 时先刷新，刷新失败才登出' },
    { id: 's4', index: 4, title: '跑认证测试', expect: 'auth 相关用例全绿' },
    { id: 's5', index: 5, title: '换方案：加锁', expect: '并发 refresh 只发一次' },
    { id: 's6', index: 6, title: '再次重试', expect: '同一用例应当通过' },
    { id: 's7', index: 7, title: '修掉真正的竞态', expect: '会话恢复且不乱登出' },
  ],
  events: [
    // ---- 1. 复现 ----
    { t: 0, type: 'step.start', step: 's1' },
    { t: 2, type: 'file.read', path: 'src/auth/session.ts' },
    { t: 4, type: 'file.read', path: 'src/auth/token.ts' },
    { t: 6, type: 'file.read', path: 'package.json' },
    { t: 9, type: 'note', text: '在 auth.spec.ts 里找到「401 后立即登出」的断言，先跑到失败。' },
    { t: 11, type: 'cmd.start', id: 'c1', cmd: 'pnpm vitest run src/auth' },
    { t: 12, type: 'cmd.line', id: 'c1', stream: 'out', line: 'RUN  v3.2.1  /home/yxw/WorkSpace/acme-web' },
    { t: 13, type: 'cmd.line', id: 'c1', stream: 'out', line: ' ❯ src/auth/auth.spec.ts (6 tests | 2 failed) 412ms' },
    { t: 14, type: 'cmd.line', id: 'c1', stream: 'err', line: '   × refreshes the token on 401  18ms' },
    { t: 15, type: 'cmd.line', id: 'c1', stream: 'err', line: '   × keeps the session when refresh succeeds  9ms' },
    { t: 19, type: 'cmd.end', id: 'c1', exit: 1, dur: 8 },
    { t: 20, type: 'test.result', id: 'c1', spec: 'src/auth/auth.spec.ts', passed: 4, failed: 2,
      cases: [
        { name: 'refreshes the token on 401', ok: false, ms: 18 },
        { name: 'keeps the session when refresh succeeds', ok: false, ms: 9 },
        { name: 'clears session on refresh failure', ok: true, ms: 6 },
        { name: 'logout clears cookies', ok: true, ms: 4 },
      ] },
    { t: 22, type: 'step.end', step: 's1', ok: false },

    // ---- 2. 定位 ----
    { t: 26, type: 'step.start', step: 's2' },
    { t: 28, type: 'file.read', path: 'src/auth/store.ts' },
    { t: 33, type: 'note', text: 'refresh 是并发的：两个 401 同时到达会各发一次 refresh，后到的把先到的 token 覆盖成失效值。' },
    { t: 36, type: 'step.end', step: 's2', ok: true },

    // ---- 3. 第一次修复 ----
    { t: 40, type: 'step.start', step: 's3' },
    { t: 42, type: 'file.edit', path: 'src/auth/session.ts', attempt: 1, add: 18, del: 4,
      hunk: hunk('@@ -12,7 +12,21 @@ export async function restoreSession(req: Request) {', [
        { type: 'ctx', text: '  const token = readCookie(req, \'sid\')' },
        { type: 'ctx', text: '  if (!token) return null' },
        { type: 'del', text: '  const session = await store.get(token)' },
        { type: 'add', text: '  let session = await store.get(token)' },
        { type: 'add', text: '  if (!session) {' },
        { type: 'add', text: '    const refreshed = await refresh(token)' },
        { type: 'add', text: '    session = refreshed ? await store.get(refreshed) : null' },
        { type: 'add', text: '  }' },
        { type: 'ctx', text: '  if (!session) return null' },
        { type: 'ctx', text: '  return session' },
      ]) },
    { t: 45, type: 'file.edit', path: 'src/auth/token.ts', attempt: 1, add: 6, del: 2,
      hunk: hunk('@@ -3,6 +3,10 @@ export function readCookie(req: Request, name: string) {', [
        { type: 'ctx', text: '  const raw = req.headers.cookie ?? \'\'' },
        { type: 'del', text: '  return parse(raw)[name]' },
        { type: 'add', text: '  const value = parse(raw)[name]' },
        { type: 'add', text: '  if (value === \'undefined\' || value === \'null\') return null' },
        { type: 'add', text: '  return value' },
      ]) },
    { t: 47, type: 'file.edit', path: 'src/config/feature-flags.ts', attempt: 1, add: 3, del: 1,
      hunk: hunk('@@ -8,4 +8,6 @@ export const flags = {', [
        { type: 'ctx', text: '  newCheckout: false,' },
        { type: 'del', text: '  refreshOn401: false,' },
        { type: 'add', text: '  refreshOn401: true,' },
        { type: 'add', text: '  refreshLock: false,' },
      ]) },
    { t: 49, type: 'step.end', step: 's3', ok: true },

    // ---- 4. 跑测试（失败） ----
    { t: 52, type: 'step.start', step: 's4' },
    { t: 54, type: 'cmd.start', id: 'c2', cmd: 'pnpm vitest run src/auth' },
    { t: 55, type: 'cmd.line', id: 'c2', stream: 'out', line: 'RUN  v3.2.1  /home/yxw/WorkSpace/acme-web' },
    { t: 56, type: 'cmd.line', id: 'c2', stream: 'out', line: ' ❯ src/auth/auth.spec.ts (6 tests | 2 failed) 388ms' },
    { t: 57, type: 'cmd.line', id: 'c2', stream: 'err', line: '   × refreshes the token on 401  21ms' },
    { t: 58, type: 'cmd.line', id: 'c2', stream: 'err', line: '     → expected 200, received 401' },
    { t: 59, type: 'cmd.line', id: 'c2', stream: 'err', line: '   × keeps the session when refresh succeeds  11ms' },
    { t: 63, type: 'cmd.end', id: 'c2', exit: 1, dur: 9 },
    { t: 64, type: 'test.result', id: 'c2', spec: 'src/auth/auth.spec.ts', passed: 4, failed: 2,
      cases: [
        { name: 'refreshes the token on 401', ok: false, ms: 21 },
        { name: 'keeps the session when refresh succeeds', ok: false, ms: 11 },
      ] },
    { t: 66, type: 'step.end', step: 's4', ok: false },

    // ---- 5. 换方案（继续失败） ----
    { t: 70, type: 'step.start', step: 's5' },
    { t: 72, type: 'note', text: '并发 refresh 需要串行化。加一个按 token 的互斥。' },
    { t: 75, type: 'file.edit', path: 'src/auth/session.ts', attempt: 2, add: 9, del: 3,
      hunk: hunk('@@ -12,10 +12,16 @@ export async function restoreSession(req: Request) {', [
        { type: 'ctx', text: '  let session = await store.get(token)' },
        { type: 'del', text: '  if (!session) {' },
        { type: 'del', text: '    const refreshed = await refresh(token)' },
        { type: 'add', text: '  if (!session) {' },
        { type: 'add', text: '    const refreshed = await withLock(`refresh:${token}`, async () => {' },
        { type: 'add', text: '      const again = await store.get(token)' },
        { type: 'add', text: '      if (again) return token' },
        { type: 'add', text: '      return (await refresh(token)) ?? null' },
        { type: 'add', text: '    })' },
        { type: 'ctx', text: '    session = refreshed ? await store.get(refreshed) : null' },
        { type: 'ctx', text: '  }' },
      ]) },
    { t: 79, type: 'step.end', step: 's5', ok: true },
    { t: 82, type: 'step.start', step: 's6' },
    { t: 84, type: 'cmd.start', id: 'c3', cmd: 'pnpm vitest run src/auth' },
    { t: 85, type: 'cmd.line', id: 'c3', stream: 'out', line: 'RUN  v3.2.1  /home/yxw/WorkSpace/acme-web' },
    { t: 86, type: 'cmd.line', id: 'c3', stream: 'err', line: '   × refreshes the token on 401  24ms' },
    { t: 87, type: 'cmd.line', id: 'c3', stream: 'err', line: '     → expected 200, received 401' },
    { t: 91, type: 'cmd.end', id: 'c3', exit: 1, dur: 9 },
    { t: 92, type: 'test.result', id: 'c3', spec: 'src/auth/auth.spec.ts', passed: 5, failed: 1,
      cases: [
        { name: 'refreshes the token on 401', ok: false, ms: 24 },
        { name: 'keeps the session when refresh succeeds', ok: true, ms: 8 },
      ] },

    // ---- 长静默：agent 在反复读同一个文件、没有新输出 ----
    { t: 96, type: 'file.read', path: 'src/auth/session.ts' },
    { t: 140, type: 'file.read', path: 'src/auth/session.ts' },
    { t: 188, type: 'file.read', path: 'src/auth/session.ts' },
    { t: 236, type: 'file.read', path: 'src/auth/store.ts' },
    { t: 300, type: 'file.read', path: 'src/auth/session.ts' },
    { t: 340, type: 'note', text: '锁只防住了同一进程；测试里两个请求走不同的 worker，锁没生效。' },

    // ---- 7. 真正的修复 ----
    { t: 360, type: 'step.end', step: 's6', ok: false },
    { t: 364, type: 'step.start', step: 's7' },
    { t: 366, type: 'note', text: '把 refresh 的去重从进程内锁换成 store 层的条件写。' },
    { t: 370, type: 'file.edit', path: 'src/auth/session.ts', attempt: 3, add: 12, del: 7,
      hunk: hunk('@@ -12,16 +12,21 @@ export async function restoreSession(req: Request) {', [
        { type: 'del', text: '    const refreshed = await withLock(`refresh:${token}`, async () => {' },
        { type: 'del', text: '      const again = await store.get(token)' },
        { type: 'del', text: '      if (again) return token' },
        { type: 'del', text: '      return (await refresh(token)) ?? null' },
        { type: 'del', text: '    })' },
        { type: 'add', text: '    const refreshed = await store.compareAndSwap(token, async (current) => {' },
        { type: 'add', text: '      if (current) return current.value' },
        { type: 'add', text: '      const next = await refresh(token)' },
        { type: 'add', text: '      return next ?? null' },
        { type: 'add', text: '    })' },
        { type: 'ctx', text: '    session = refreshed ? await store.get(refreshed) : null' },
      ]) },
    { t: 374, type: 'file.edit', path: 'src/auth/store.ts', attempt: 1, add: 14, del: 2,
      hunk: hunk('@@ -21,8 +21,20 @@ export class SessionStore {', [
        { type: 'ctx', text: '  async get(token: string) {' },
        { type: 'del', text: '    return this.rows.get(token) ?? null' },
        { type: 'add', text: '    return this.rows.get(token) ?? null' },
        { type: 'add', text: '  }' },
        { type: 'add', text: '' },
        { type: 'add', text: '  async compareAndSwap(token: string, next: (cur: Row | null) => Promise<string | null>) {' },
        { type: 'add', text: '    const cur = this.rows.get(token) ?? null' },
        { type: 'add', text: '    const value = await next(cur)' },
        { type: 'add', text: '    if (value) this.rows.set(token, { value, at: Date.now() })' },
        { type: 'add', text: '    return value' },
      ]) },
    { t: 380, type: 'cmd.start', id: 'c4', cmd: 'pnpm vitest run src/auth' },
    { t: 381, type: 'cmd.line', id: 'c4', stream: 'out', line: 'RUN  v3.2.1  /home/yxw/WorkSpace/acme-web' },
    { t: 382, type: 'cmd.line', id: 'c4', stream: 'out', line: ' ✓ src/auth/auth.spec.ts (6 tests) 392ms' },
    { t: 384, type: 'cmd.line', id: 'c4', stream: 'out', line: 'Test Files  1 passed (1)' },
    { t: 385, type: 'cmd.line', id: 'c4', stream: 'out', line: '     Tests  6 passed (6)' },
    { t: 389, type: 'cmd.end', id: 'c4', exit: 0, dur: 9 },
    { t: 390, type: 'test.result', id: 'c4', spec: 'src/auth/auth.spec.ts', passed: 6, failed: 0,
      cases: [
        { name: 'refreshes the token on 401', ok: true, ms: 19 },
        { name: 'keeps the session when refresh succeeds', ok: true, ms: 7 },
        { name: 'clears session on refresh failure', ok: true, ms: 5 },
        { name: 'logout clears cookies', ok: true, ms: 4 },
      ] },
    { t: 396, type: 'cmd.start', id: 'c5', cmd: 'pnpm exec tsc --noEmit' },
    { t: 402, type: 'cmd.end', id: 'c5', exit: 0, dur: 6 },
    { t: 406, type: 'step.end', step: 's7', ok: true },
    { t: 410, type: 'artifact', title: '登录态恢复修复', files: 5, add: 62, del: 19 },
  ],
}

// 干预动作的三档语义（UI 与服务端共享的契约）
export const TIERS = {
  mark: { id: 'mark', label: '标记', hint: '只记录，不影响 agent', color: 'tier-mark' },
  constrain: { id: 'constrain', label: '约束', hint: '影响后续执行', color: 'tier-constrain' },
  takeover: { id: 'takeover', label: '接管', hint: '停掉 agent，人工接手', color: 'tier-takeover' },
}

// 通知：只做指针，点进去落到具体对象
export const NOTIFICATIONS = [
  { id: 'n1', at: 300, title: '卡住了', body: '同一文件已被重读 4 次 · 近 3 分钟没有新进展', target: { view: 'timeline', anchor: 'step-s6' }, level: 'warn' },
  { id: 'n2', at: 92, title: '测试连续失败 2 次', body: 'refreshes the token on 401 · 预期 200 实际 401', target: { view: 'now', anchor: 'test-0' }, level: 'warn' },
  { id: 'n3', at: 410, title: '任务完成，等待验收', body: '6 个用例全绿 · 改动已就绪', target: { view: 'accept', anchor: 'artifact' }, level: 'ok' },
]
