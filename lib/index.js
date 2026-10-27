/**
 * Host half of `dsh-remote-panel`.
 *
 * 这里**不监听任何端口**：控制面只借用 DSH 自己的 HTTP 服务注册一条前缀路由，
 * 数据面（Caddy / EasyTier）永远是独立进程。原因见 README「为什么不做成全插件」。
 *
 * 信任边界：
 *   - 路由挂在 webServer 上，但 DSH 的 /api 镚栏不管我们这条前缀，所以必须自带鉴权。
 *   - 每个进程启动时生成一次随机令牌，通过 webserver/index-inject 注入 index，
 *     随该页面的 JS 一起下发；index 本身只有通过 DSH 认证（cookie）才会被渲染，
 *     因此「拿到 index」等价于「已被 DSH 认证」。
 *   - 之后每个请求必须带 `x-dsh-remote-panel: <token>`，否则 403。
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { BadRequest, defaults, readJson, render } from './api.js'
import { probe } from './probe.js'
import { findToken, pairingUrls, renderQr } from './pair.js'
import { applyBackfill, readState } from './state.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** 与 cordis.patch.yml 的 insert[].id 必须一致。 */
export const name = 'remote-panel'

export const VERSION = pkg.version

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

/**
 * 路由表：`<METHOD> <suffix>` → handler(context)。
 * 后续功能（状态、向导、配对、白名单）都挂在这张表上，保持分派逻辑只有一处。
 * @type {Map<string, (context: object) => unknown>}
 */
export const routes = new Map()

routes.set('GET /defaults', () => defaults(VERSION))

routes.set('POST /render', async ({ req }) => {
	const body = await readJson(req)
	return render(body)
})

routes.set('GET /state', () => ({ ok: true, state: readState() }))

routes.set('POST /state', async ({ req }) => {
	const body = await readJson(req)
	const code = String(body.code ?? '').trim()
	if (code === '') throw new BadRequest('缺少回填码')
	try {
		return { ok: true, ...applyBackfill(code, { version: VERSION }) }
	} catch (error) {
		throw new BadRequest(error instanceof Error ? error.message : String(error))
	}
})

routes.set('GET /pair', async () => {
	const state = readState()
	if (state === null) throw new BadRequest('尚未部署：先完成部署并回填')
	const upstream = Number.isInteger(Number(state.upstream)) ? Number(state.upstream) : 3080
	const token = await findToken({ port: upstream })
	const urls = pairingUrls({ ip: state.ip, port: state.port, accessKey: state.accessKey, token })
	return {
		ok: true,
		found: token !== undefined,
		upstream,
		urls,
		qr: token === undefined ? null : await renderQr(urls.token),
	}
})

routes.set('GET /probe', async () => {
	const state = readState()
	return { ok: true, state, probe: await probe(state) }
})

routes.set('GET /status', ({ query }) => ({
	ok: true,
	version: VERSION,
	startedAt: STARTED_AT,
	uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
	deployed: readState() !== null,
	echo: query.get('echo') ?? null,
}))

/**
 * 处理一次控制面请求。
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ token: string }} options
 */
export async function handleRequest(req, res, { token }) {
	if (!authorized(req, token)) {
		json(res, 403, { ok: false, error: 'panel token missing or invalid' })
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
		const result = await handler({ req, res, url, query: url.searchParams, version: VERSION })
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
export function apply(ctx) {
	const token = randomBytes(24).toString('base64url')

	ctx.inject(['webServer'], (webCtx) => {
		webCtx.on('webserver/index-inject', (table) => {
			table.push({ kind: 'global', name: TOKEN_GLOBAL, value: token })
		})

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
