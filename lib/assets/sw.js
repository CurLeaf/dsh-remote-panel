/**
 * 手机端静态资源缓存（Service Worker）。
 *
 * 只做一件事：把「URL 自带版本」的资源放进 CacheStorage，让 WebView 的 HTTP 缓存
 * 被系统清掉之后，插件包仍然不用重下。
 *
 * 缓存范围（白名单，其余一律直通）：
 *   /plugins/*  DSH 客户端插件，combo URL 带 &rev=（不可变）
 *   /assets/*   前端构建产物，文件名带内容 hash（不可变）
 *
 * 明确不碰：HTML、/api/*、WebSocket、/dsh-genui/runtime.js（无版本号，交给 Caddy 的 max-age）。
 *
 * 为什么不用版本化的 cache 名：URL 里的 rev/hash 已经是版本，换版本自然换 key；
 * 用 boot rev 当 cache 名反而会让「一个插件改动」把整包缓存作废。
 */

const CACHE = 'dsh-static-v1'
const PREFIX = 'dsh-static-'
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const isAsset = (url) =>
	url.origin === self.location.origin &&
	// /plugins/events 是 SSE（事件流），不是静态资源：绝不能拦
	((url.pathname.startsWith('/plugins/') && url.pathname !== '/plugins/events') ||
		url.pathname.startsWith('/assets/'))

let puts = 0

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys()
			await Promise.all(
				names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)),
			)
			await trim()
			await self.clients.claim()
		})(),
	)
})

self.addEventListener('fetch', (event) => {
	const request = event.request
	if (request.method !== 'GET') return
	if (request.headers.has('range')) return
	if (request.headers.get('accept')?.includes('text/event-stream') === true) return
	const url = new URL(request.url)
	if (!isAsset(url)) return

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE)
			const hit = await cache.match(request)
			if (hit !== undefined) return hit
			const response = await fetch(request)
			if (response.ok && response.status === 200) {
				// 先响应，落盘交给 waitUntil：不阻塞首屏，也避免 worker 提前退出丢写入
				event.waitUntil(store(cache, request, response.clone()))
				// 清一次太贵，攒着做：每 50 次写入检查一次过期
				puts += 1
				if (puts % 50 === 0) event.waitUntil(trim())
			}
			return response
		})().catch(() => fetch(request)),
	)
})

/**
 * 首屏加载完，页面把本次实际用到的资源列表发过来，补进缓存。
 * 此时这些 URL 已经在 HTTP 缓存里，预取不产生额外流量；这样第一次访问也能回填，
 * 不用等第二次启动。
 */
self.addEventListener('message', (event) => {
	const data = event.data
	if (data === null || typeof data !== 'object' || data.type !== 'precache' || !Array.isArray(data.urls)) return
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE)
			for (const raw of data.urls.slice(0, 64)) {
				let url
				try {
					url = new URL(String(raw), self.location.origin)
				} catch {
					continue
				}
				if (!isAsset(url)) continue
				if ((await cache.match(url.href)) !== undefined) continue
				try {
					const response = await fetch(url.href, { credentials: 'same-origin' })
					if (response.ok && response.status === 200) await store(cache, url.href, response)
				} catch {
					/* 单个资源失败不影响其它 */
				}
			}
		})(),
	)
})

/**
 * 带时间戳落盘（流式，不把 9MB 的 combo 读进内存两次）。
 * 时间戳只用于 30 天清理，不影响资源本身。
 */
async function store(cache, request, response) {
	try {
		const headers = new Headers(response.headers)
		headers.set('x-sw-stored-at', String(Date.now()))
		await cache.put(
			request,
			new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			}),
		)
	} catch {
		/* 配额不足 / 流被中断：跳过，下次再存 */
	}
}

async function trim() {
	try {
		const cache = await caches.open(CACHE)
		const now = Date.now()
		for (const request of await cache.keys()) {
			const response = await cache.match(request)
			const at = Number(response?.headers.get('x-sw-stored-at') ?? 0)
			if (at !== 0 && now - at > KEEP_MS) await cache.delete(request)
		}
	} catch {
		/* 清理失败不影响读写 */
	}
}
