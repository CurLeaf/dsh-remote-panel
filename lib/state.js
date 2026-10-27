/**
 * 部署状态落盘与回填码解析。
 *
 * 部署脚本最后一行是 `DSH_REMOTE_OK <base64(json)>`。面板把它贴在向导里，
 * Host 解析后记到 `$DSH_HOME/remote-panel.json`（0600），后续状态探测只读这份状态，
 * 不需要再去猜端口或虚拟 IP。
 */

import { appendFileSync, chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 状态文件格式版本。 */
export const STATE_VERSION = 1

/** 回填码前缀。 */
export const BACKFILL_PREFIX = 'DSH_REMOTE_OK'

/**
 * @param {string} [home]
 * @returns {string}
 */
export function statePath(home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
	return join(home, 'remote-panel.json')
}

/**
 * 解析回填码。
 * @param {string} text 允许带前缀、首尾空白
 * @returns {{version:string, port:number, ip:string, upstream:number|undefined, health:string|undefined}}
 */
export function parseBackfill(text) {
	if (typeof text !== 'string' || text.trim() === '') throw new Error('回填码为空')
	const trimmed = text.trim()
	const payload = trimmed.startsWith(BACKFILL_PREFIX)
		? trimmed.slice(BACKFILL_PREFIX.length).trim()
		: trimmed

	let decoded
	try {
		decoded = Buffer.from(payload, 'base64').toString('utf8')
	} catch {
		throw new Error('回填码不是合法的 base64')
	}

	let parsed
	try {
		parsed = JSON.parse(decoded)
	} catch {
		throw new Error('回填码内容不是 JSON（可能复制时被截断）')
	}

	const port = Number(parsed.port)
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('回填码里的端口非法')

	const ip = String(parsed.ip ?? '')
	if (!/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(ip)) {
		throw new Error('回填码里的虚拟 IP 非法')
	}

	const accessKey = parsed.key === undefined ? undefined : String(parsed.key)
	if (accessKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(accessKey)) {
		throw new Error('回填码里的访问口令非法')
	}

	return {
		version: String(parsed.version ?? ''),
		port,
		ip,
		accessKey,
		upstream: Number.isInteger(Number(parsed.upstream)) ? Number(parsed.upstream) : undefined,
		health: parsed.health === undefined ? undefined : String(parsed.health),
	}
}

/**
 * 读状态；文件不存在或损坏都返回 null（面板显示「未部署」）。
 * @param {string} [home]
 */
export function readState(home) {
	try {
		const raw = JSON.parse(readFileSync(statePath(home), 'utf8'))
		if (raw === null || typeof raw !== 'object' || raw.schema !== STATE_VERSION) return null
		return raw
	} catch {
		return null
	}
}

/**
 * 原子写状态（0600）。
 * @param {object} value
 * @param {string} [home]
 */
export function writeState(value, home) {
	const path = statePath(home)
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
	const temp = `${path}.tmp`
	writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
	renameSync(temp, path)
	chmodSync(path, 0o600)
	return path
}

/**
 * 把回填码并进状态。
 * @param {string} code
 * @param {{ version?: string, home?: string }} [options]
 */
export function applyBackfill(code, { version = '', home } = {}) {
	const parsed = parseBackfill(code)
	const state = {
		schema: STATE_VERSION,
		deployedAt: Date.now(),
		panelVersion: version,
		provider: 'easytier+caddy',
		...parsed,
	}
	const path = writeState(state, home)
	return { state, path }
}

/**
 * 追加一条白名单变更记录（F4）。
 * @param {{ action: string, entry: string, ok: boolean, note?: string }} record
 * @param {string} [home]
 */
export function appendAudit(record, home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
	const path = join(home, 'remote-panel-audit.log')
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
	const line = JSON.stringify({ at: new Date().toISOString(), ...record })
	appendFileSync(path, `${line}\n`, { mode: 0o600 })
	chmodSync(path, 0o600)
	return path
}

/**
 * 最近 n 条变更。
 * @param {number} [limit]
 * @param {string} [home]
 */
export function readAudit(limit = 10, home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
	try {
		return readFileSync(join(home, 'remote-panel-audit.log'), 'utf8')
			.split('\n')
			.filter(Boolean)
			.slice(-limit)
			.map((line) => JSON.parse(line))
			.reverse()
	} catch {
		return []
	}
}
