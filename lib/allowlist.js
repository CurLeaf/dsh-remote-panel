/**
 * 白名单编辑。
 *
 * 只改 Caddyfile 里那一行 `@lan remote_ip ...`，其余字符原样保留；
 * 写前留 .bak，写后由调用方 reload。纯函数部分不碰磁盘，便于单测。
 */

import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LINE = /^(\s*)@lan\s+remote_ip\s+(.+?)\s*$/

/** 允许的条目：IPv4 / IPv6 / CIDR，不含空白。 */
const ENTRY = /^[0-9A-Fa-f:.]{2,45}(?:\/\d{1,3})?$/

/** 天然危险、需要二次确认的条目。 */
const DANGEROUS = new Set(['0.0.0.0/0', '::/0', '0.0.0.0', '::'])

/**
 * @param {string} entry
 * @param {{ force?: boolean }} [options]
 */
export function validateEntry(entry, { force = false } = {}) {
	const value = String(entry ?? '').trim()
	if (value === '') throw new Error('条目为空')
	if (!ENTRY.test(value)) throw new Error(`条目格式不合法：${value}`)
	if (DANGEROUS.has(value) && !force) throw new Error(`${value} 会放行全部来源，需要二次确认`)
	return value
}

/**
 * 解析当前的远程来源列表。
 * @param {string} text Caddyfile 内容
 * @returns {string[]}
 */
export function parseEntries(text) {
	for (const line of String(text).split('\n')) {
		const match = LINE.exec(line)
		if (match !== null) return match[2].split(/\s+/).filter(Boolean)
	}
	return []
}

/**
 * 增删一条，返回新的 Caddyfile 文本。
 * @param {string} text
 * @param {string} entry
 * @param {'add'|'remove'} mode
 */
export function withEntry(text, entry, mode) {
	const lines = String(text).split('\n')
	const index = lines.findIndex((line) => LINE.test(line))
	if (index === -1) throw new Error('Caddyfile 里找不到 @lan remote_ip 行')

	const match = LINE.exec(lines[index])
	const indent = match[1]
	const current = match[2].split(/\s+/).filter(Boolean)
	const next =
		mode === 'add'
			? current.includes(entry)
				? current
				: [...current, entry]
			: current.filter((item) => item !== entry)

	if (next.length === 0) throw new Error('白名单不能为空：至少保留本机 127.0.0.1')

	// 必须保持一行：同名 matcher 定义两次会被 Caddy 拒绝（matcher is defined more than once: @lan）
	lines[index] = `${indent}@lan remote_ip ${next.join(' ')}`
	return lines.join('\n')
}

/** 默认路径。 */
export function caddyfilePath(home = homedir()) {
	return join(home, '.config', 'caddy', 'Caddyfile')
}

/**
 * 读 → 校验 → 写（原子）→ 留备份。
 * @param {{ entry: string, mode: 'add'|'remove', force?: boolean, home?: string }} input
 */
export function mutateAllowlist({ entry, mode, force = false, home }) {
	const value = validateEntry(entry, { force })
	if (mode !== 'add' && mode !== 'remove') throw new Error('mode 必须是 add 或 remove')

	const path = caddyfilePath(home)
	if (!existsSync(path)) throw new Error(`Caddyfile 不存在：${path}（先完成部署）`)

	const before = readFileSync(path, 'utf8')
	const after = withEntry(before, value, mode)
	if (after === before) return { changed: false, entries: parseEntries(after), path }

	copyFileSync(path, `${path}.bak`)
	const temp = `${path}.tmp`
	writeFileSync(temp, after, 'utf8')
	renameSync(temp, path)
	chmodSync(path, 0o644)
	return { changed: true, entries: parseEntries(after), path }
}
