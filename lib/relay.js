/**
 * 断点接力：手机看到哪、标了哪些「回去处理」，存在宿主侧一份 JSON 里。
 *
 * 为什么放宿主：手机和桌面是两台设备（不同 localStorage），但连同一个 DSH。
 * 桌面在「设置 → 远程访问 → 手机断点」里读这份数据，就能接着看手机看过的位置。
 *
 * 纯 IO + 归一化：路径由调用方给，测试用临时目录。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const empty = () => ({ version: 1, lastSeen: null, marks: [] })
const MAX_MARKS = 30

/** 归一化：手改坏的文件也不能把面板打挂。 */
export function normalizeRelay(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const seen = source.lastSeen
  const lastSeen =
    seen && typeof seen === 'object' && typeof seen.sessionId === 'string' && seen.sessionId !== ''
      ? {
          sessionId: seen.sessionId,
          stepId: typeof seen.stepId === 'string' ? seen.stepId : '',
          index: Number.isInteger(seen.index) ? seen.index : null,
          title: typeof seen.title === 'string' ? seen.title : '',
          at: Number.isFinite(seen.at) ? seen.at : 0,
        }
      : null
  const marks = Array.isArray(source.marks)
    ? source.marks
        .filter((m) => m && typeof m.id === 'string' && typeof m.sessionId === 'string' && typeof m.text === 'string')
        .map((m) => ({ id: m.id, sessionId: m.sessionId, text: m.text.slice(0, 120), at: Number.isFinite(m.at) ? m.at : 0 }))
        .slice(0, MAX_MARKS)
    : []
  return { version: 1, lastSeen, marks }
}

export function loadRelay(path) {
  try {
    if (!existsSync(path)) return empty()
    return normalizeRelay(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return empty()
  }
}

/** 原子写：tmp + rename；目录不存在就建。 */
export function saveRelay(path, value) {
  const data = normalizeRelay(value)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  renameSync(tmp, path)
  return data
}

/** 手机报「看到这一步」。 */
export function markSeen(path, input) {
  const relay = loadRelay(path)
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : ''
  if (sessionId === '') return relay
  relay.lastSeen = {
    sessionId,
    stepId: typeof input?.stepId === 'string' ? input.stepId : '',
    index: Number.isInteger(input?.index) ? input.index : null,
    title: typeof input?.title === 'string' ? input.title.slice(0, 80) : '',
    at: Date.now(),
  }
  return saveRelay(path, relay)
}

/** 手机标一条「待处理」；同会话同文案去重。 */
export function addMark(path, input, id) {
  const relay = loadRelay(path)
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId : ''
  const text = typeof input?.text === 'string' ? input.text.trim().slice(0, 120) : ''
  if (sessionId === '' || text === '') return relay
  const exists = relay.marks.find((m) => m.sessionId === sessionId && m.text === text)
  if (exists !== undefined) return relay
  relay.marks.unshift({ id, sessionId, text, at: Date.now() })
  relay.marks = relay.marks.slice(0, MAX_MARKS)
  return saveRelay(path, relay)
}

/** 处理掉一条标记。 */
export function removeMark(path, id) {
  const relay = loadRelay(path)
  if (typeof id !== 'string' || id === '') return relay
  relay.marks = relay.marks.filter((m) => m.id !== id)
  return saveRelay(path, relay)
}
