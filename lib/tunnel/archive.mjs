/**
 * 会话列表裁剪：把**已归档**的会话从 `session/list` 的响应里去掉。
 *
 * 为什么在边缘做：DSH 的 `ApiSessionList.list()` 按设计返回全部可见会话，
 * 没有「排除归档」的参数；而归档集合（`workspaceRegistry.archivedSessionIds`）
 * 是经 WebSocket 的 follow 流下发给客户端的，边缘读不到那份流。
 * 但它在 Host 上是落盘的（`$DSH_HOME/storages/workspace.json` 的
 * `global.archivedSessionIds`），边缘与 DSH 同机同用户，直接读它即可。
 *
 * 个人使用场景下这是个纯赚的裁剪：归档会话不会出现在列表里，
 * 但归档本身、恢复、以及按 id 打开都不受影响（那些走别的接口）。
 */

import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 归档集合的落盘位置。 */
export function archivedStorePath(home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
	return join(home, 'storages', 'workspace.json')
}

/**
 * 归档集合的读取器：按 mtime 缓存，文件没变就不重复解析。
 * 读不到文件时返回空集合（等于不裁剪），并把原因交给调用方记一次日志。
 * @param {{ path?: string, onError?: (message: string) => void }} [options]
 */
export function createArchiveIndex(options = {}) {
	const path = options.path ?? archivedStorePath()
	const onError = options.onError ?? (() => {})
	let cachedAt = -1
	let cached = new Set()
	let lastError = ''

	/** 当前归档集合（只读）。 */
	function ids() {
		let mtime
		try {
			mtime = statSync(path).mtimeMs
		} catch (e) {
			if (e.code !== 'ENOENT' || lastError !== 'missing') {
				onError(`读不到归档集合（${path}）：${e.code ?? e.message}`)
				lastError = 'missing'
			}
			return cached
		}
		if (mtime === cachedAt) return cached
		try {
			const raw = JSON.parse(readFileSync(path, 'utf8'))
			const list = raw?.global?.archivedSessionIds
			cached = new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [])
			cachedAt = mtime
			lastError = ''
		} catch (e) {
			if (lastError !== 'parse') onError(`归档集合解析失败：${e.message}`)
			lastError = 'parse'
		}
		return cached
	}

	return { ids, path }
}

/**
 * 从 `session/list` 的响应体里剔除已归档的会话。
 *
 * 只处理预期形状（`result.value.items` 数组）；形状不符时返回 null，
 * 由调用方原样转发——**不改写看不懂的响应**。
 *
 * @param {Buffer|string} body 上游原始响应体
 * @param {Set<string>} archived 归档会话 id 集合
 * @returns {{ body: Buffer, kept: number, removed: number } | null}
 */
export function filterSessionList(body, archived) {
	if (archived.size === 0) return null
	let doc
	try {
		doc = JSON.parse(typeof body === 'string' ? body : body.toString('utf8'))
	} catch {
		return null
	}
	const value = doc?.result?.value
	const items = value?.items
	if (!Array.isArray(items)) return null

	const kept = items.filter((item) => item !== null && !archived.has(item.sessionId))
	if (kept.length === items.length) return { body: Buffer.from(JSON.stringify(doc)), kept: kept.length, removed: 0 }
	value.items = kept
	return { body: Buffer.from(JSON.stringify(doc)), kept: kept.length, removed: items.length - kept.length }
}
