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
 * 从日志文本里按时间顺序提取令牌。
 *
 * 端口必须可配置：DSH 带 `--public-url` 启动时，日志里的令牌 URL 用的是**反代端口**
 * 而不是 3080，写死端口会取到上一个进程的旧令牌。
 *
 * @param {string} text
 * @param {number|number[]} [ports] 省略表示不限端口
 * @returns {string[]} 按时间顺序（旧 → 新）
 */
export function parseTokens(text, ports) {
	if (typeof text !== 'string') return []
	const allow = ports === undefined ? undefined : new Set((Array.isArray(ports) ? ports : [ports]).map(Number))
	const found = []
	for (const match of text.matchAll(TOKEN_URL)) {
		if (allow !== undefined && !allow.has(Number(match[1]))) continue
		found.push(match[2])
	}
	return found
}

/**
 * 最新令牌。
 * @param {string} text
 * @param {number|number[]} [ports]
 */
export function parseToken(text, ports) {
	const all = parseTokens(text, ports)
	return all.length === 0 ? undefined : all[all.length - 1]
}

/**
 * @param {{ port: number, since?: string, exec?: typeof run }} options
 * @returns {Promise<string|undefined>}
 */
export async function findTokens({ ports, since = '-6 hours', exec = run }) {
	try {
		const { stdout } = await exec(
			'journalctl',
			['--user', '--since', since, '--no-pager', '-o', 'cat', '-n', '5000'],
			{ timeout: 8000, maxBuffer: 16 * 1024 * 1024 },
		)
		return parseTokens(String(stdout), ports)
	} catch {
		return []
	}
}

/**
 * 向本机 DSH 验证一个令牌是否仍然有效（有效时返回 303）。
 * @param {string} token
 * @param {number} upstreamPort
 * @param {typeof fetch} [http]
 */
export async function verifyToken(token, upstreamPort, http = fetch) {
	try {
		const response = await http(`http://127.0.0.1:${upstreamPort}/?token=${encodeURIComponent(token)}`, {
			redirect: 'manual',
			signal: AbortSignal.timeout(2000),
		})
		return response.status === 303
	} catch {
		return false
	}
}

/** 兼容旧签名：返回最新令牌。 */
export async function findToken(options) {
	const all = await findTokens({ ...options, ports: options.port ?? options.ports })
	return all.length === 0 ? undefined : all[all.length - 1]
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
