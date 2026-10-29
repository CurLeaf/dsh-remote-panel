import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detectTls, findFreePort } from '../lib/api.js'
import { API_PREFIX, TOKEN_HEADER, handleRequest } from '../lib/index.js'

const token = 'test-token'

const valid = {
	user: 'yxw',
	home: '/home/yxw',
	virtualIp: '10.140.140.223',
	port: 8710,
	upstreamPort: 3080,
	accessKey: 'MwcufbMjggfe3b8wYm8Rxykm',
	networkSecret: 'abcdefghijklmnop1234',
	networkName: 'txcloud-easytier',
	relay: '110.40.229.62:14010',
}

function response() {
	const state = { status: 0, headers: {}, body: '' }
	return {
		state,
		writeHead(status, headers) {
			state.status = status
			Object.assign(state.headers, headers ?? {})
		},
		end(chunk) {
			state.body = chunk ?? ''
		},
	}
}

function request({ method = 'GET', url = '/', body } = {}) {
	const req = { method, url, headers: { [TOKEN_HEADER]: token } }
	if (body !== undefined) {
		req[Symbol.asyncIterator] = async function* () {
			yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
		}
	}
	return req
}

async function call({ method, url, body }, options = {}) {
	const res = response()
	await handleRequest(request({ method, url, body }), res, { token, ...options })
	return { status: res.state.status, body: res.state.body === '' ? undefined : JSON.parse(res.state.body) }
}

test('GET /defaults 给出可用的初始值', async () => {
	const { status, body } = await call({ url: `${API_PREFIX}/defaults` })
	assert.equal(status, 200)
	assert.equal(typeof body.user, 'string')
	assert.ok(body.home.startsWith('/'))
	assert.ok(body.port > 0)
	assert.match(body.accessKey, /^[A-Za-z0-9_-]{16,}$/)
	assert.match(body.lanCidr, /\/\d{1,2}$/)
})

test('POST /render 渲染出可执行脚本', async () => {
	const { status, body } = await call({ method: 'POST', url: `${API_PREFIX}/render`, body: valid })
	assert.equal(status, 200)
	assert.match(body.install, /DSH_REMOTE_OK/)
	assert.equal(body.summary.urls.mesh, 'http://10.140.140.223:8710/')
	assert.ok(body.files['~/.config/caddy/Caddyfile'].includes('reverse_proxy'))
})

test('POST /render 空请求体为 400', async () => {
	const { status } = await call({ method: 'POST', url: `${API_PREFIX}/render`, body: '' })
	assert.equal(status, 400)
})

test('POST /render 非法 IP 为 400 且带原因', async () => {
	const { status, body } = await call({
		method: 'POST',
		url: `${API_PREFIX}/render`,
		body: { ...valid, virtualIp: '10.0.0.999' },
	})
	assert.equal(status, 400)
	assert.match(body.error, /虚拟 IP/)
})

test('POST /render 数组请求体为 400', async () => {
	const { status } = await call({ method: 'POST', url: `${API_PREFIX}/render`, body: [] })
	assert.equal(status, 400)
})

test('POST /render 坏 JSON 为 400', async () => {
	const { status, body } = await call({ method: 'POST', url: `${API_PREFIX}/render`, body: '{oops' })
	assert.equal(status, 400)
	assert.match(body.error, /JSON/)
})

test('findFreePort 跳过被占用的端口', async () => {
	const server = createServer()
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const busy = server.address().port
	try {
		const free = await findFreePort(busy)
		assert.notEqual(free, busy)
		assert.ok(free > busy)
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
})

test('GET /pair 未部署时为 400', async () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-api-'))
	const previous = process.env.DSH_HOME
	process.env.DSH_HOME = home
	try {
		const { status, body } = await call({ url: `${API_PREFIX}/pair` })
		assert.equal(status, 400)
		assert.match(body.error, /尚未部署/)
	} finally {
		if (previous === undefined) delete process.env.DSH_HOME
		else process.env.DSH_HOME = previous
		rmSync(home, { recursive: true, force: true })
	}
})

test('detectTls：按线上 Caddyfile 判断，重新部署时向导不会把 TLS 改回明文', async () => {
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const { join } = await import('node:path')
	const home = mkdtempSync(join(tmpdir(), 'panel-tls-'))
	try {
		const dir = join(home, '.config', 'caddy')
		mkdirSync(dir, { recursive: true })
		assert.equal(detectTls(home), false) // 文件还不存在
		writeFileSync(join(dir, 'Caddyfile'), '{\n\tauto_https off\n}\n:8710 {\n\thandle {\n\t}\n}\n')
		assert.equal(detectTls(home), false)
		writeFileSync(join(dir, 'Caddyfile'), '{\n\tauto_https disable_redirects\n}\n10.0.0.1:8710 {\n\ttls internal\n}\n')
		assert.equal(detectTls(home), true)
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

// ── M3：/probe 带 cert、/status 带轻量 tls ────────────────────────────

test('GET /probe 的 probe 结构带 cert 时不崩（注入假探测，不走网络）', async () => {
	const fakeProbe = async () => ({
		ok: true,
		easytier: { state: 'active', ok: true },
		caddy: { state: 'active', ok: true },
		healthz: { ok: true, status: 200 },
		upstream: { ok: true, status: 401 },
		cert: {
			ok: true,
			expiresAt: '2026-10-29T20:16:40.000Z',
			hoursLeft: 10.6,
			subject: '',
			san: 'IP Address:10.140.140.223',
		},
	})
	const { status, body } = await call({ url: `${API_PREFIX}/probe` }, { probe: fakeProbe })
	assert.equal(status, 200)
	assert.equal(body.ok, true)
	assert.ok('state' in body)
	assert.equal(body.probe.ok, true)
	assert.equal(body.probe.cert.ok, true)
	assert.equal(body.probe.cert.hoursLeft, 10.6)
	assert.equal(body.probe.cert.san, 'IP Address:10.140.140.223')
})

test('GET /probe 证书不可用时也是 200，cert 带 reason', async () => {
	const fakeProbe = async () => ({
		ok: true,
		cert: {
			ok: false,
			expiresAt: null,
			hoursLeft: null,
			subject: '',
			san: '',
			reason: 'TLS 握手失败：timeout',
		},
	})
	const { status, body } = await call({ url: `${API_PREFIX}/probe` }, { probe: fakeProbe })
	assert.equal(status, 200)
	assert.equal(body.probe.cert.ok, false)
	assert.match(body.probe.cert.reason, /握手失败/)
})

test('GET /status 带轻量 tls 字段，且不因证书探测变慢/报错', async () => {
	const { status, body } = await call({ url: `${API_PREFIX}/status` })
	assert.equal(status, 200)
	assert.equal(typeof body.tls, 'object')
	assert.notEqual(body.tls, null)
	assert.equal(typeof body.tls.enabled, 'boolean')
	// 证书详情来自 /probe 缓存；没探测过时只报 enabled
	assert.equal(body.tls.expiresAt === undefined || typeof body.tls.expiresAt === 'string', true)
	assert.equal(body.tls.hoursLeft === undefined || typeof body.tls.hoursLeft === 'number', true)
})
