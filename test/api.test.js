import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createServer } from 'node:net'

import { findFreePort } from '../lib/api.js'
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

async function call({ method, url, body }) {
	const res = response()
	await handleRequest(request({ method, url, body }), res, { token })
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
