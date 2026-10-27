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
