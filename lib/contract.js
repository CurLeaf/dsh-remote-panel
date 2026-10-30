/**
 * 外壳契约检查：确认 DSH 前端还在用我们依赖的那套 hash 类名。
 *
 * 手机外壳的样式全靠 DSH 构建产物里的私有类名（`wSkVaW_header` 这种），
 * 它们随每次构建变化。DSH 一升级，样式可能整体失配——所以在宿主侧做一次
 * 「挂点还在不在」的体检，失配时面板显红，而不是等用户发现界面错位。
 *
 * 只读：拉一次 index.html 和它引用的 CSS，做纯字符串匹配。
 */

import { request } from 'node:http'

/** 外壳依赖的类名前缀（对应 lib/client.js 里的选择器）。 */
export const SHELL_MARKERS = ['wSkVaW_', 'hHd-Xa_', 'uV2eYG_', 'pXSMma_', 'pI_x6G_']

/**
 * @param {{ port: number, token: string, host?: string, timeoutMs?: number }} options
 * @returns {Promise<{ ok: boolean, missing: string[], asset?: string, reason?: string, checkedAt: number }>}
 */
export async function checkShellContract({ port, token, host = '127.0.0.1', timeoutMs = 4000 }) {
	const checkedAt = Date.now()
	const base = `http://${host}:${port}`
	// DSH 的令牌是「先 303 种 Cookie，再访问首页」两步走，这里手工跟一次
	const login = await requestText(`${base}/?token=${encodeURIComponent(token)}`, { timeoutMs })
	const cookie = login.cookie
	if (cookie === undefined) return { ok: false, missing: [...SHELL_MARKERS], reason: 'login-failed', checkedAt }
	const html = await requestText(`${base}/`, { timeoutMs, cookie })
	if (html.body === undefined) return { ok: false, missing: [...SHELL_MARKERS], reason: 'index-unreachable', checkedAt }
	// 页面通常引多个 CSS（vendor + 业务），挂点类名在业务那个里，所以全取回来一起看
	const assets = [...html.body.matchAll(/href="\.?\/?(assets\/[^"']+\.css)"/g)].map((m) => m[1])
	if (assets.length === 0) return { ok: false, missing: [...SHELL_MARKERS], reason: 'no-css-asset', checkedAt }
	let css = ''
	let matched
	for (const asset of assets) {
		const body = await requestText(`${base}/${asset}`, { timeoutMs, cookie })
		if (body.body === undefined) continue
		css += body.body
		if (matched === undefined && SHELL_MARKERS.some((marker) => body.body.includes(marker))) matched = asset
	}
	if (css === '') return { ok: false, missing: [...SHELL_MARKERS], reason: 'css-unreachable', checkedAt }
	const missing = SHELL_MARKERS.filter((marker) => !css.includes(marker))
	return { ok: missing.length === 0, missing, asset: matched ?? assets[0], assets, checkedAt }
}

/**
 * 简单 GET：返回 { body, cookie }，超时/失败给 undefined。
 * 体检不该把状态接口带崩，所以这里不抛异常。
 */
function requestText(url, { timeoutMs, cookie } = {}) {
	return new Promise((resolve) => {
		const headers = cookie === undefined ? {} : { cookie }
		const req = request(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
			const jar = (res.headers['set-cookie'] ?? []).map((entry) => entry.split(';')[0]).join('; ')
			if ((res.statusCode ?? 500) >= 400) {
				res.resume()
				resolve({ cookie: jar === '' ? undefined : jar })
				return
			}
			let body = ''
			res.setEncoding('utf8')
			res.on('data', (chunk) => {
				body += chunk
			})
			res.on('end', () => resolve({ body, cookie: jar === '' ? undefined : jar }))
		})
		req.on('timeout', () => {
			req.destroy()
			resolve({})
		})
		req.on('error', () => resolve({}))
		req.end()
	})
}
