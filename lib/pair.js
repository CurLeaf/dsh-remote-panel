/**
 * 手机配对：当前部署只有一个入口——中继域名 + 门禁口令。
 *
 * 旧版的 journal 取令牌 / `/pair` 跳转 / `remote-panel/login` 页已经删除：
 * 边缘在 `?k=` 命中时直接种 Cookie 并跳 `/?token=<当前令牌>`，令牌由 agent 上报中继，
 * 面板不需要再从 journal 里猜，也不会因为令牌轮换把旧链接写死。
 */

/**
 * 对外基址。443 不写端口，避免二维码里出现 `:443`。
 * @param {{hostname:string, port?:number}} options
 */
export function baseUrl({ hostname, port = 443 }) {
	const host = String(hostname ?? '').trim().toLowerCase()
	if (host === '') throw new Error('缺少域名')
	return port === 443 || port === 80 || port === undefined ? `https://${host}` : `https://${host}:${port}`
}

/**
 * 面板要展示/复制的链接。
 *
 * @param {{hostname:string, port?:number, accessKey?:string}} options
 */
export function pairingUrls({ hostname, port = 443, accessKey }) {
	const base = baseUrl({ hostname, port })
	const key = typeof accessKey === 'string' && accessKey !== '' ? accessKey : undefined
	const suffix = key === undefined ? '' : `?k=${encodeURIComponent(key)}`
	return {
		// 一张二维码走完：种门禁 Cookie + 跳转换取 DSH 会话
		gate: `${base}/${suffix}`,
		combo: `${base}/${suffix}`,
		apk: key === undefined ? undefined : `${base}/app.apk?k=${encodeURIComponent(key)}`,
		manifest: `${base}/manifest.webmanifest`,
		version: `${base}/version.json`,
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
