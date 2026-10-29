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

import { timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { BadRequest, defaults, detectTls, isPortFree, readJson, render } from './api.js'
import { runDoctor } from './doctor.js'
import { loadOrCreateToken } from './token.js'
import { probe, probeCertificate, certCheck, lastCertSnapshot, reloadProxy } from './probe.js'
import { caddyfilePath, mutateAllowlist, parseEntries } from './allowlist.js'
import { recentRejects } from './logs.js'
import { pingHost } from './netcheck.js'
import { findTokens, pairingUrls, renderQr, verifyToken } from './pair.js'
import { appendAudit, applyBackfill, readAudit, readState } from './state.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** 与 cordis.patch.yml 的 insert[].id 必须一致。 */
export const name = 'remote-panel'

export const VERSION = pkg.version

/** 控制面 API 前缀；前端与测试共用。 */
export const API_PREFIX = '/remote-panel/api'

/** 手机 App 化资源（manifest / 图标）的公开前缀：浏览器抓 manifest 时带不了自定义头。 */
export const APP_PREFIX = '/remote-panel/app'

/** 我们清单的路径（head 里注入一次 <link rel="manifest">）。 */
export const MANIFEST_PATH = `${APP_PREFIX}/manifest.webmanifest`

/**
 * 我们自己的 Web App Manifest：DSH 自带的那个用 favicon.svg 当图标、没有 short_name 之外的品牌信息，
 * 这里换成黑底蓝鱼标 + 固定 start_url/scope，装到主屏后点开就是独立窗口。
 */
export function appManifest() {
	return {
		name: 'DeepSeek Harness',
		short_name: 'DSH',
		description: '手机上操作这台机器上的 DeepSeek Harness',
		id: '/',
		start_url: '/',
		scope: '/',
		display: 'fullscreen',
		display_override: ['fullscreen', 'standalone'],
		background_color: '#000000',
		theme_color: '#000000',
		icons: [
			{ src: `${APP_PREFIX}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: `${APP_PREFIX}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: `${APP_PREFIX}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
		],
	}
}



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
 * 把 PWA 资源落到 Caddy 能直接 file_server 的目录（默认 ~/.dsh/remote-panel-app）。
 *
 * 为什么要落盘：浏览器抓 manifest 按规范**不带 Cookie**，走门禁必然 401，
 * Chrome/Edge 报 `manifest-parsing-or-network-error`，「安装应用」直接失败。
 * 只有让 Caddy 在门禁之前直接发静态文件才装得上。启动时同步一次即可。
 *
 * @param {string} [dir]
 * @returns {string} 实际写入的目录
 */
export function syncAppAssets(dir = join(homedir(), '.dsh', 'remote-panel-app')) {
	mkdirSync(dir, { recursive: true })
	const write = (name, bytes) => {
		const target = join(dir, name)
		if (existsSync(target) && Buffer.compare(readFileSync(target), bytes) === 0) return
		writeFileSync(target, bytes)
	}
	write('manifest.webmanifest', Buffer.from(`${JSON.stringify(appManifest(), null, 2)}\n`))
	for (const name of APP_ASSETS.keys()) {
		try {
			write(name, readFileSync(new URL(`./assets/${name}`, import.meta.url)))
		} catch {
			/* 缺某个尺寸不算致命 */
		}
	}
	const ca = localCaPath()
	if (ca !== undefined) {
		try {
			write('ca.crt', readFileSync(ca))
		} catch {
			/* 没有就算了 */
		}
	}
	return dir
}

/**
 * 注入 index 的 head 行：主题色 + iOS 独立窗口 + 桌面图标 + 我们自己的 manifest。
 *
 * manifest 用黑底蓝鱼图标、`display: fullscreen`、`start_url/scope = /`；
 * 它排在 DSH 自带那条之前，浏览器取第一条，所以主屏看到的是我们的图标与名字。
 */
export function appHeadInjections() {
	const head = [
		'<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">',
		'<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">',
		'<meta name="mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
		'<meta name="apple-mobile-web-app-title" content="DSH">',
		`<link rel="apple-touch-icon" href="${APP_PREFIX}/icon-180.png">`,
		`<link rel="manifest" href="${MANIFEST_PATH}">`,
	]
	return head.map((html) => ({ kind: 'html', placement: 'head', html }))
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

const APP_ASSETS = new Map([
	['icon-180.png', 'image/png'],
	['icon-192.png', 'image/png'],
	['icon-512.png', 'image/png'],
	['icon-maskable-512.png', 'image/png'],
])

/**
 * Caddy 内部 CA 的根证书：手机要装的就是这张。
 * 用户级 Caddy 在 ~/.local/share/caddy（或 XDG_DATA_HOME）；系统级在 /var/lib/caddy。
 */
export function localCaPath(env = process.env) {
	const base = env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local', 'share')
	const candidates = [
		join(base, 'caddy', 'pki', 'authorities', 'local', 'root.crt'),
		'/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt',
	]
	return candidates.find((candidate) => existsSync(candidate))
}

/** 公开资源：manifest 与图标（浏览器抓它们时不会带面板令牌）。 */
function handleAppAsset(req, res) {
	const path = String(req.url ?? '/').split('?')[0]
	const name = path.startsWith(`${APP_PREFIX}/`) ? path.slice(APP_PREFIX.length + 1) : ''
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405).end()
		return
	}
	if (name === 'manifest.webmanifest') {
		const body = JSON.stringify(appManifest())
		res.writeHead(200, {
			'content-type': 'application/manifest+json; charset=utf-8',
			'cache-control': 'no-cache',
			'content-length': Buffer.byteLength(body),
		})
		res.end(body)
		return
	}
	if (name === 'ca.crt') {
		const path = localCaPath()
		if (path === undefined) {
			res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Caddy 根证书还没生成（先启用 HTTPS）')
			return
		}
		const bytes = readFileSync(path)
		res.writeHead(200, {
			'content-type': 'application/x-x509-ca-cert',
			'content-disposition': 'attachment; filename="dsh-caddy-root.crt"',
			'cache-control': 'no-store',
			'content-length': bytes.length,
		})
		res.end(bytes)
		return
	}
	const type = APP_ASSETS.get(name)
	if (type === undefined) {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
		return
	}
	try {
		const bytes = readFileSync(new URL(`./assets/${name}`, import.meta.url))
		res.writeHead(200, {
			'content-type': type,
			'cache-control': 'public, max-age=86400',
			'content-length': bytes.length,
		})
		res.end(bytes)
	} catch {
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
	}
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

/** 面板发起的请求走同源反代：优先用 Caddy 写的 X-Forwarded-Proto，兜底看 socket。 */
export function requestScheme(req) {
	const forwarded = String(req?.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase()
	if (forwarded === 'https' || forwarded === 'http') return forwarded
	return req?.socket?.encrypted === true ? 'https' : 'http'
}

function authorized(req, token) {
	return safeEqual(headerValue(req, TOKEN_HEADER), token)
}

/**
 * `/status` 里的轻量 TLS 字段。
 *
 * 只报「线上 Caddyfile 有没有启用 TLS」，外加最近一次 `/probe` 留下的证书缓存；
 * 这里**不做网络探测**（`/status` 在页面启动路径上，必须秒回），证书详情走 `/probe`。
 * @param {boolean} enabled
 * @param {{expiresAt?: string|null, hoursLeft?: number|null} | undefined} snapshot
 */
export function tlsStatus(enabled, snapshot) {
	const info = { enabled: enabled === true }
	if (info.enabled && snapshot !== undefined && snapshot !== null) {
		if (typeof snapshot.expiresAt === 'string') info.expiresAt = snapshot.expiresAt
		if (typeof snapshot.hoursLeft === 'number') info.hoursLeft = snapshot.hoursLeft
	}
	return info
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

routes.set('GET /pair', async ({ req }) => {
	const state = readState()
	if (state === null) throw new BadRequest('尚未部署：先完成部署并回填')
	const upstream = Number.isInteger(Number(state.upstream)) ? Number(state.upstream) : 3080
	// 端口不写死：带 --public-url 时日志里出现的是反代端口
	const candidates = await findTokens({ ports: [upstream, state.port] })
	let token
	for (const candidate of candidates.slice(-6).reverse()) {
		if (await verifyToken(candidate, upstream)) {
			token = candidate
			break
		}
	}
	// 全部验证失败也把最新的给出来，至少能让用户看到「令牌过期」而不是空白
	if (token === undefined) token = candidates.at(-1)
	// 协议：优先看这次请求（经 Caddy 的 https 会带 X-Forwarded-Proto），
	// 但面板也可能被「直连 3080」打开（桌面客户端/回环书签），那种请求永远汇报 http；
	// 这时按线上 Caddyfile 判断——配对链接必须指向真正对外的那一套。
	const scheme = requestScheme(req) === 'https' || detectTls() ? 'https' : 'http'
	const urls = pairingUrls({
		ip: state.ip,
		port: state.port,
		accessKey: state.accessKey,
		token,
		scheme,
	})
	return {
		ok: true,
		found: token !== undefined,
		upstream,
		urls,
		qr: urls.combo === undefined ? null : await renderQr(urls.combo),
	}
})

routes.set('GET /allowlist', () => {
	const file = caddyfilePath()
	try {
		return { ok: true, entries: parseEntries(readFileSync(file, 'utf8')), path: file }
	} catch (error) {
		throw new BadRequest(`读取 Caddyfile 失败：${error instanceof Error ? error.message : String(error)}`)
	}
})

routes.set('GET /ipcheck', async ({ query }) => {
	const ip = query.get('ip') ?? ''
	try {
		return { ok: true, ...(await pingHost(ip)) }
	} catch (error) {
		throw new BadRequest(error instanceof Error ? error.message : String(error))
	}
})

routes.set('GET /rejects', async () => ({ ok: true, entries: await recentRejects({ limit: 5 }) }))

routes.set('GET /audit', () => ({ ok: true, entries: readAudit(10) }))

routes.set('POST /allowlist', async ({ req }) => {
	const body = await readJson(req)
	const action = String(body.action ?? '')
	const value = String(body.value ?? '')
	if (action !== 'add' && action !== 'remove') throw new BadRequest('action 必须是 add 或 remove')
	let result
	try {
		result = mutateAllowlist({ entry: value, mode: action, force: body.force === true })
	} catch (error) {
		throw new BadRequest(error instanceof Error ? error.message : String(error))
	}
	const reload = result.changed ? await reloadProxy() : { ok: true, skipped: true }
	appendAudit({ action, entry: value, changed: result.changed, reload: reload.ok })
	return { ok: true, ...result, reload }
})

routes.set('GET /doctor', async ({ query, certProbe = probeCertificate }) => {
	const raw = Number(query.get('port') ?? 8710)
	const port = Number.isInteger(raw) && raw > 0 && raw <= 65535 ? raw : 8710
	const virtualIp = query.get('ip') ?? undefined
	const devName = query.get('dev') ?? undefined
	const state = readState()
	const tlsEnabled = detectTls()

	// 证书探测与静态体检并行：最多多等 2s（probeCertificate 自带超时）
	let certPromise = Promise.resolve(undefined)
	if (tlsEnabled) {
		certPromise =
			state === null
				? Promise.resolve({ ok: false, hoursLeft: null, reason: '尚未部署' })
				: Promise.resolve(certProbe({ host: state.ip, port: Number(state.port) || port }))
	}
	const [doctor, cert] = await Promise.all([
		runDoctor({
			port,
			virtualIp: virtualIp === '' ? undefined : virtualIp,
			devName: devName === '' ? undefined : devName,
			isPortFree,
		}),
		certPromise,
	])
	if (!tlsEnabled) return doctor
	return withCertCheck(doctor, cert, { deployed: state !== null })
})

/** 把证书自检追加到 doctor 结果末尾（doctor.js 本轮不在改动范围）。 */
function withCertCheck(doctor, cert, options) {
	if (doctor === undefined || doctor === null || !Array.isArray(doctor.checks)) return doctor
	return { ...doctor, checks: [...doctor.checks, certCheck(cert, options)] }
}

routes.set('GET /diag', async ({ probe: runProbe = probe }) => {
	const state = readState()
	const safeState = state === null ? null : { ...state, accessKey: undefined, networkSecret: undefined }
	const tlsEnabled = detectTls()
	const result = await runProbe(state, { tls: tlsEnabled })
	const doctor = await runDoctor({ isPortFree })
	return {
		ok: true,
		generatedAt: new Date().toISOString(),
		panelVersion: VERSION,
		node: process.version,
		platform: `${process.platform}/${process.arch}`,
		state: safeState,
		probe: result,
		doctor: tlsEnabled ? withCertCheck(doctor, result.cert, { deployed: state !== null }) : doctor,
	}
})

routes.set('GET /probe', async ({ probe: runProbe = probe }) => {
	const state = readState()
	return { ok: true, state, probe: await runProbe(state, { tls: detectTls() }) }
})

routes.set('GET /status', ({ query }) => {
	const tlsEnabled = detectTls()
	return {
		ok: true,
		version: VERSION,
		startedAt: STARTED_AT,
		uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
		deployed: readState() !== null,
		// 面板展示用：对外的协议（直连 3080 时页面自己看到的只有 http）
		scheme: tlsEnabled ? 'https' : 'http',
		// 轻量证书信息：只读最近一次 /probe 的缓存，不在 status 里做网络探测
		tls: tlsStatus(tlsEnabled, lastCertSnapshot()),
		echo: query.get('echo') ?? null,
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
export function apply(ctx) {
	// 持久化：DSH 重启后已打开的页面仍然可用
	const token = loadOrCreateToken()
	// PWA 资源给 Caddy 直接发：manifest 抓取不带 Cookie，不能走门禁
	try {
		syncAppAssets()
	} catch (error) {
		console.warn('[remote-panel] sync app assets failed', error)
	}

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

		webCtx.effect(
			() =>
				webCtx.webServer.register({
					kind: 'prefix',
					path: APP_PREFIX,
					handler: handleAppAsset,
				}),
			'remote-panel: app assets',
		)
	})
}
