/**
 * 面板令牌。
 *
 * 只写一次、之后复用：如果每进程重新生成，DSH 一重启，已经打开的页面就全部 403，
 * 而页面本身并不会自己刷新——这是实机踩到的第一个体验坑。
 *
 * 落盘位置与状态文件同级（$DSH_HOME），权限 0600。删掉文件即视为「作废所有已打开的页面」。
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const TOKEN = /^[A-Za-z0-9_-]{24,128}$/

/**
 * @param {string} [home]
 * @returns {string}
 */
export function tokenPath(home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
	return join(home, 'remote-panel-token')
}

/**
 * 读已有令牌；没有或损坏就生成一个并原子写入。
 * @param {string} [home]
 * @returns {string}
 */
export function loadOrCreateToken(home) {
	const path = tokenPath(home)
	try {
		const existing = readFileSync(path, 'utf8').trim()
		if (TOKEN.test(existing)) return existing
	} catch {
		/* 不存在或不可读，重新生成 */
	}

	const value = randomBytes(24).toString('base64url')
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
	const temp = `${path}.tmp`
	writeFileSync(temp, `${value}\n`, { mode: 0o600 })
	renameSync(temp, path)
	chmodSync(path, 0o600)
	return value
}
