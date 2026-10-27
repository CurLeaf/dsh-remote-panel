/**
 * 从 Caddy 的 JSON 访问日志里挑出被拒绝的请求。
 *
 * 只为了回答一个问题：「刚才那条 403/401 是谁」。解析失败的行直接跳过，
 * 不让日志格式变化把面板拖挂。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * @param {string} text journalctl 输出
 * @param {number} [limit]
 * @returns {Array<{at:string, status:number, ip:string, host:string, uri:string}>}
 */
export function parseRejects(text, limit = 5) {
	const rows = []
	for (const line of String(text).split('\n')) {
		const trimmed = line.trim()
		if (!trimmed.startsWith('{')) continue
		let entry
		try {
			entry = JSON.parse(trimmed)
		} catch {
			continue
		}
		const status = Number(entry.status)
		if (status !== 401 && status !== 403) continue
		rows.push({
			at: typeof entry.ts === 'number' ? new Date(entry.ts * 1000).toISOString() : '',
			status,
			ip: String(entry.request?.remote_ip ?? ''),
			host: String(entry.request?.host ?? ''),
			uri: String(entry.request?.uri ?? ''),
		})
	}
	return rows.slice(-limit).reverse()
}

/**
 * @param {{ since?: string, exec?: typeof run, limit?: number }} [options]
 */
export async function recentRejects({ since = '-6 hours', exec = run, limit = 5 } = {}) {
	try {
		const { stdout } = await exec(
			'journalctl',
			['--user', '-u', 'dsh-proxy', '--since', since, '--no-pager', '-o', 'cat', '-n', '4000'],
			{ timeout: 6000, maxBuffer: 16 * 1024 * 1024 },
		)
		return parseRejects(String(stdout), limit)
	} catch {
		return []
	}
}
