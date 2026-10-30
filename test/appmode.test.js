import assert from 'node:assert/strict'
import { test } from 'node:test'

import { APP_PREFIX, MANIFEST_PATH, appHeadInjections, appManifest, requestScheme, syncAppAssets, tlsStatus, withAppViewport, writeLandingPage, writeLoginPage } from '../lib/index.js'

test('head 注入：主题色、iOS 独立窗口、桌面图标；不重复声明 manifest', () => {
	const rows = appHeadInjections()
	assert.ok(rows.every((row) => row.kind === 'html' && row.placement === 'head'))
	const html = rows.map((row) => row.html).join('\n')
	assert.match(html, /name="theme-color" media="\(prefers-color-scheme: dark\)" content="#000000"/)
	assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
	assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/)
	assert.match(html, new RegExp(`rel="apple-touch-icon" href="${APP_PREFIX}/icon-180\\.png"`))
	// 换掉 DSH 自带的 manifest：图标从 favicon.svg 改成黑底蓝鱼标，名字固定成 DSH
	assert.match(html, new RegExp(`rel="manifest" href="${MANIFEST_PATH.replace('.', '\\.')}"`))
	assert.match(html, /apple-mobile-web-app-title" content="DSH"/)
})

test('viewport 补齐安全区与键盘策略', () => {
	const html = '<head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>'
	const out = withAppViewport(html)
	assert.match(out, /content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"/)
	assert.equal(withAppViewport(out), out)
	assert.equal(withAppViewport('<head></head>'), '<head></head>')
})

test('requestScheme 认 X-Forwarded-Proto（Caddy 写的）与 socket 加密', () => {
	assert.equal(requestScheme({ headers: { 'x-forwarded-proto': 'https' }, socket: {} }), 'https')
	assert.equal(requestScheme({ headers: { 'x-forwarded-proto': 'http,https' }, socket: {} }), 'http')
	assert.equal(requestScheme({ headers: {}, socket: { encrypted: true } }), 'https')
	assert.equal(requestScheme({ headers: {}, socket: {} }), 'http')
	assert.equal(requestScheme(undefined), 'http')
})

test('manifest：独立窗口 + 自有图标 + 固定 start_url', () => {
	const manifest = appManifest()
	assert.equal(manifest.display, 'fullscreen')
	assert.equal(manifest.start_url, '/')
	assert.equal(manifest.scope, '/')
	assert.equal(manifest.theme_color, '#000000')
	assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
	for (const icon of manifest.icons) {
		assert.ok(icon.src.startsWith(`${APP_PREFIX}/`), icon.src)
	}
})

test('tlsStatus：只报 enabled + 最近一次 /probe 的缓存，不发起探测', () => {
	// 明文部署：即便缓存里有证书字段也不报
	assert.deepEqual(tlsStatus(false, { expiresAt: '2026-10-29T20:16:40.000Z', hoursLeft: 3 }), { enabled: false })
	// 启用 TLS 但还没探测过
	assert.deepEqual(tlsStatus(true, undefined), { enabled: true })
	assert.deepEqual(tlsStatus(true, null), { enabled: true })
	// 已探测过：带到期时间与剩余小时数
	assert.deepEqual(tlsStatus(true, { expiresAt: '2026-10-29T20:16:40.000Z', hoursLeft: 3.5 }), {
		enabled: true,
		expiresAt: '2026-10-29T20:16:40.000Z',
		hoursLeft: 3.5,
	})
	// 握手失败的缓存没有到期时间：只报 enabled，不往 status 里塞 null
	assert.deepEqual(tlsStatus(true, { expiresAt: null, hoursLeft: null, reason: 'TLS 握手失败：timeout' }), {
		enabled: true,
	})
})

test('syncAppAssets 把清单与图标落到 Caddy 目录，且幂等', async () => {
	const { mkdtempSync, rmSync, readFileSync, statSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	const dir = mkdtempSync(join(tmpdir(), 'panel-pwa-'))
	try {
		syncAppAssets(dir)
		const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'))
		assert.equal(manifest.short_name, 'DSH')
		assert.ok(statSync(join(dir, 'icon-192.png')).size > 0)
		const before = statSync(join(dir, 'manifest.webmanifest')).mtimeMs
		await new Promise((r) => setTimeout(r, 20))
		syncAppAssets(dir)
		assert.equal(statSync(join(dir, 'manifest.webmanifest')).mtimeMs, before, '内容未变时不应重写')
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test('令牌只出现在门禁之后的登录页，免鉴权的旧入口不再带任何凭据', async () => {
	const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	const dir = mkdtempSync(join(tmpdir(), 'panel-login-'))
	try {
		const token = 'tok_abcdefghijklmnop'
		const target = writeLoginPage(dir, token)
		assert.equal(target, `/?token=${token}`)
		const login = readFileSync(join(dir, 'login.html'), 'utf8')
		assert.ok(login.includes(token), '登录页应带令牌')
		assert.match(login, /remote-panel\/login|\/\?token=/)

		writeLandingPage(dir)
		const landing = readFileSync(join(dir, 'go.html'), 'utf8')
		assert.equal(landing.includes(token), false, '免鉴权页面不能出现令牌')
		assert.equal(/dsh_gate|K7mQ|\?k=/.test(landing), false, '免鉴权页面也不能出现口令')
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
