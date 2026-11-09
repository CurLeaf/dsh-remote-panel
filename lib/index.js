/**
 * Host half of `dsh-remote-panel` —— 只剩一条数据面：公网隧道（dsh-tunnel）。
 *
 * 控制面仍然**不监听任何端口**：只借用 DSH 自己的 HTTP 服务注册一条前缀路由；
 * 真正对外的 TLS/门禁/反代由 `dsh-remote-panel-tunnel.service`（lib/tunnel/agent.mjs）负责。
 *
 * 信任边界：
 *   - 路由挂在 webServer 上，但 DSH 的 /api 鉴权不管我们这条前缀，所以必须自带鉴权。
 *   - 每个进程启动时生成一次随机令牌，通过 webserver/index-inject 注入 index，
 *     随该页面的 JS 一起下发；index 本身只有通过 DSH 认证（cookie）才会被渲染，
 *     因此「拿到 index」等价于「已被 DSH 认证」。
 *   - 之后每个请求必须带 `x-dsh-remote-panel: <token>`，否则 403。
 */

import { execFile } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { BadRequest, defaults, readJson, renderDeploy } from './api.js'
import {
	lastCertSnapshot,
	probe,
	probeCertificate,
	readApkAssets,
	rememberCert,
	UNIT_NAME,
	unitState,
} from './probe.js'
import { baseUrl, pairingUrls, renderQr } from './pair.js'
import { publicState, readState } from './state.js'
import { loadOrCreateToken } from './token.js'
import { VERSION } from './version.js'

/** 与 cordis.patch.yml 的 insert[].id 必须一致。 */
export const name = 'remote-panel'

export { VERSION }

/** 控制面 API 前缀；前端与测试共用。 */
export const API_PREFIX = '/remote-panel/api'

/** 注入 index 的全局名，前端从这里读取进程令牌。 */
export const TOKEN_GLOBAL = '__DSH_REMOTE_PANEL__'

/** 前端携带令牌的请求头。 */
export const TOKEN_HEADER = 'x-dsh-remote-panel'

const STARTED_AT = Date.now()

function json(res, status, body) {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	})
	res.end(JSON.stringify(body))
}

/**
 * 注入 index 的 head：主屏图标 / 独立窗口 / 主题色。
 *
 * manifest 与图标由中继边缘直接发（不带口令也能取），所以这里只指路径；
 * 桌面直连 3080 时它们 404，不影响正常使用。
 */
export function appHeadInjections() {
	return [
		'<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#151517">',
		'<meta name="theme-color" media="(prefers-color-scheme: light)" content="#151517">',
		'<meta name="mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
		'<meta name="apple-mobile-web-app-title" content="DSH">',
		'<link rel="apple-touch-icon" href="/icon-192.png">',
		'<link rel="manifest" href="/manifest.webmanifest">',
	].map((html) => ({ kind: 'html', placement: 'head', html }))
}

/** 把 index 的 viewport 补齐：刘海屏安全区 + 键盘不遮输入框。 */
export function withAppViewport(html) {
	return String(html).replace(
		/(<meta\s+name="viewport"\s+content=")([^"]*)(")/i,
		(all, head, content, tail) => {
			if (content.includes('viewport-fit')) return all
			return `${head}${content}, viewport-fit=cover, interactive-widget=resizes-content${tail}`
		},
	)
}

function safeEqual(actual, expected) {
	if (typeof actual !== 'string' || typeof expected !== 'string') return false
	const a = Buffer.from(actual, 'utf8')
	const b = Buffer.from(expected, 'utf8')
	return a.length === b.length && timingSafeEqual(a, b)
}

function headerValue(req, key) {
	const value = req.headers?.[key]
	return Array.isArray(value) ? value[0] : value
}

function authorized(req, token) {
	return safeEqual(headerValue(req, TOKEN_HEADER), token)
}

/** 单元日志尾部，诊断包里带一份。 */
function journalTail(lines = 30) {
	return new Promise((resolve) => {
		execFile(
			'journalctl',
			['--user', '-u', UNIT_NAME, '-n', String(lines), '--no-pager'],
			{ timeout: 5000 },
			(error, stdout) => resolve(error === null ? String(stdout).trim() : `读取日志失败：${error.message}`),
		)
	})
}

/**
 * 路由表：`<METHOD> <suffix>` → handler(context)。
 * 所有功能（状态、向导、配对、诊断）都挂在这张表上。
 * @type {Map<string, (context: object) => unknown>}
 */
export const routes = new Map()

routes.set('GET /defaults', () => defaults())

routes.set('POST /render', async ({ req }) => {
	const body = await readJson(req)
	return renderDeploy(body)
})

routes.set('GET /state', () => ({ ok: true, state: publicState(readState()) }))

routes.set('GET /pair', async () => {
	const state = readState()
	if (state === null) throw new BadRequest('尚未部署：先生成并执行安装脚本')
	const urls = pairingUrls({ hostname: state.hostname, port: state.port, accessKey: state.accessKey })
	return {
		ok: true,
		found: true,
		urls,
		// 二维码编的就是门禁链接：先种 Cookie，再由边缘跳 token
		qr: await renderQr(urls.combo),
	}
})

routes.set('GET /probe', async () => {
	const state = readState()
	const result = await probe(state)
	rememberCert(result)
	return { ok: true, state: publicState(state), probe: result }
})

routes.set('GET /diag', async () => {
	const state = readState()
	const safeState = state === null ? null : { ...state, accessKey: undefined }
	const [result, unit, logs] = await Promise.all([
		probe(state),
		unitState(),
		journalTail(40),
	])
	return {
		ok: true,
		generatedAt: new Date().toISOString(),
		panelVersion: VERSION,
		node: process.version,
		platform: `${process.platform}/${process.arch}`,
		state: safeState,
		probe: result,
		unit,
		logs,
		apk: readApkAssets(),
	}
})

/** 客户端上报的外壳挂点自检结果（内存里保留最近一次）。 */
let lastShellReport = null

routes.set('POST /shell', async ({ req }) => {
	const body = await readJson(req)
	const missing = Array.isArray(body?.missing) ? body.missing.filter((item) => typeof item === 'string') : null
	if (missing === null) throw new BadRequest('missing 必须是字符串数组')
	// 外壳三根柱子靠语义钩子认出来（semantic），还是退回哈希类名（class）——
	// 后者今天能用，但 DSH 换前缀就会碎，面板上要能提前看见
	const shell = ['semantic', 'class', 'missing'].includes(body?.shell) ? body.shell : null
	lastShellReport = { ok: missing.length === 0, missing, shell, checkedAt: Date.now() }
	return { ok: true, ...lastShellReport }
})

routes.set('GET /status', () => {
	const state = readState()
	const cert = lastCertSnapshot()
	return {
		ok: true,
		version: VERSION,
		startedAt: STARTED_AT,
		uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
		deployed: state !== null,
		// 面板展示用：只给域名，不把口令放在 status 里
		state: state === null ? null : { ...state, accessKey: undefined },
		url: state === null ? null : baseUrl({ hostname: state.hostname, port: state.port }),
		apk: readApkAssets(),
		tls: cert === null ? { enabled: true } : {
			enabled: true,
			expiresAt: cert.expiresAt ?? null,
			hoursLeft: cert.hoursLeft ?? null,
		},
		shell: lastShellReport,
	}
})

/**
 * 处理一次控制面请求。
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ token: string, probe?: Function, certProbe?: Function }} [options]
 */
export async function handleRequest(req, res, { token, probe: runProbe = probe, certProbe = probeCertificate } = {}) {
	if (!authorized(req, token)) {
		json(res, 403, {
			ok: false,
			error: '面板令牌不匹配：页面可能是重启前打开的，硬刷新一次即可',
		})
		return
	}

	const url = new URL(req.url ?? '/', 'http://panel.invalid')
	const suffix = url.pathname.slice(API_PREFIX.length) || '/'
	const key = `${req.method ?? 'GET'} ${suffix}`
	const handler = routes.get(key)
	if (handler === undefined) {
		json(res, 404, { ok: false, error: `no route: ${key}` })
		return
	}

	try {
		const result = await handler({ req, res, url, query: url.searchParams, version: VERSION, probe: runProbe, certProbe })
		if (result !== undefined) json(res, 200, result)
	} catch (error) {
		const status = error instanceof BadRequest ? 400 : 500
		json(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
	}
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, options = {}) {
	const token = options.token ?? loadOrCreateToken()

	ctx.inject(['webServer'], (webCtx) => {
		webCtx.on('webserver/index-inject', (table) => {
			table.push({ kind: 'global', name: TOKEN_GLOBAL, value: token })
			table.push(...appHeadInjections())
		})

		// viewport-fit=cover 让「添加到主屏幕」后铺满刘海屏；
		// interactive-widget=resizes-content 让软键盘改变布局而不是盖住输入条。
		webCtx.effect(() => webCtx.webServer.tapIndex(withAppViewport), 'remote-panel: mobile viewport')

		webCtx.effect(
			() =>
				webCtx.webServer.register({
					kind: 'prefix',
					path: API_PREFIX,
					handler: (req, res) => handleRequest(req, res, { token }),
				}),
			'remote-panel: control plane api',
		)
	})
}
