/**
 * 配对：从 journal 里找回当前进程的启动令牌，生成两条 URL，并出二维码。
 *
 * 为什么需要 journal：DSH 的 `?token=` 只打印在宿主 stdout，且每次启动轮换。
 * Linux 下 systemd 把它收进 journal，同一用户可读，这是最省事且不碰内部格式的取法。
 * 找不到就如实返回「未找到」，不猜、不伪造。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** 只认带端口与 token 的 URL，避免抓到别的 profile。 */
const TOKEN_URL = /https?:\/\/[^\s"']*:(\d+)\/?(?:\?|&)token=([A-Za-z0-9_-]{16,})/g

/**
 * 从日志文本里提取指定端口的最新令牌。
 * @param {string} text
 * @param {number} port
 * @returns {string|undefined}
 */
export function parseToken(text, port) {
	if (typeof text !== 'string') return undefined
	let found
	for (const match of text.matchAll(TOKEN_URL)) {
		if (Number(match[1]) === port) found = match[2]
	}
	return found
}

/**
 * @param {{ port: number, since?: string, exec?: typeof run }} options
 * @returns {Promise<string|undefined>}
 */
export async function findToken({ port, since = '-6 hours', exec = run }) {
	try {
		const { stdout } = await exec(
			'journalctl',
			['--user', '--since', since, '--no-pager', '-o', 'cat', '-n', '5000'],
			{ timeout: 8000, maxBuffer: 16 * 1024 * 1024 },
		)
		return parseToken(String(stdout), port)
	} catch {
		return undefined
	}
}

/**
 * 两条配对 URL。顺序有意义：先门禁，再令牌。
 * @param {{ ip: string, port: number, accessKey?: string, token?: string }} input
 */
export function pairingUrls({ ip, port, accessKey, token }) {
	const base = `http://${ip}:${port}`
	return {
		gate: accessKey === undefined ? undefined : `${base}/?k=${accessKey}`,
		token: token === undefined ? undefined : `${base}/?token=${token}`,
	}
}

/**
 * 二维码（SVG 字符串）。
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function renderQr(text) {
	const { default: qrcode } = await import('qrcode')
	return qrcode.toString(text, { type: 'svg', margin: 1, width: 220 })
}
