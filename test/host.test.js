import assert from 'node:assert/strict'
import { test } from 'node:test'

import { API_PREFIX, TOKEN_HEADER, handleRequest } from '../lib/index.js'

function request({ method = 'GET', url = '/', headers = {} } = {}) {
	return { method, url, headers }
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

const token = 'test-token'

test('无令牌一律 403', async () => {
	const res = response()
	await handleRequest(request({ url: `${API_PREFIX}/status` }), res, { token })
	assert.equal(res.state.status, 403)
})

test('错误令牌一律 403', async () => {
	const res = response()
	await handleRequest(
		request({ url: `${API_PREFIX}/status`, headers: { [TOKEN_HEADER]: 'nope' } }),
		res,
		{ token },
	)
	assert.equal(res.state.status, 403)
})

test('长度不同的令牌不抛异常', async () => {
	const res = response()
	await handleRequest(
		request({ url: `${API_PREFIX}/status`, headers: { [TOKEN_HEADER]: 'x' } }),
		res,
		{ token },
	)
	assert.equal(res.state.status, 403)
})

test('GET /status 返回版本与运行时长', async () => {
	const res = response()
	await handleRequest(
		request({ url: `${API_PREFIX}/status`, headers: { [TOKEN_HEADER]: token } }),
		res,
		{ token },
	)
	assert.equal(res.state.status, 200)
	const body = JSON.parse(res.state.body)
	assert.equal(body.ok, true)
	assert.equal(typeof body.version, 'string')
	assert.equal(typeof body.uptimeSeconds, 'number')
	assert.equal(res.state.headers['cache-control'], 'no-store')
})

test('未知路由 404 且带 key', async () => {
	const res = response()
	await handleRequest(
		request({ url: `${API_PREFIX}/nope`, headers: { [TOKEN_HEADER]: token } }),
		res,
		{ token },
	)
	assert.equal(res.state.status, 404)
	assert.match(JSON.parse(res.state.body).error, /no route/)
})

test('前缀根路径不会越界', async () => {
	const res = response()
	await handleRequest(request({ url: API_PREFIX, headers: { [TOKEN_HEADER]: token } }), res, { token })
	assert.equal(res.state.status, 404)
})

test('外壳自检上报后，/status 能读到', async () => {
	const post = response()
	// handleRequest 需要一个可读的 req 流：用它已有的 readJson 习惯，构造最小 body
	const body = JSON.stringify({ missing: ['wSkVaW_'] })
	const req = {
		method: 'POST',
		url: `${API_PREFIX}/shell`,
		headers: { [TOKEN_HEADER]: token, 'content-type': 'application/json' },
		async *[Symbol.asyncIterator]() {
			yield Buffer.from(body)
		},
	}
	await handleRequest(req, post, { token })
	assert.equal(post.state.status, 200)
	const posted = JSON.parse(post.state.body)
	assert.equal(posted.ok, false)
	assert.deepEqual(posted.missing, ['wSkVaW_'])

	const status = response()
	await handleRequest(request({ url: `${API_PREFIX}/status`, headers: { [TOKEN_HEADER]: token } }), status, { token })
	const parsed = JSON.parse(status.state.body)
	assert.equal(parsed.shell.ok, false)
	assert.deepEqual(parsed.shell.missing, ['wSkVaW_'])
})
