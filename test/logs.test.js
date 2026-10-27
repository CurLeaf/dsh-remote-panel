import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseRejects, recentRejects } from '../lib/logs.js'

const forbidden = JSON.stringify({
	level: 'info',
	ts: 1730000000,
	logger: 'http.log.access',
	request: { remote_ip: '10.140.140.99', host: '10.140.140.223:8710', uri: '/' },
	status: 403,
})
const unauthorized = JSON.stringify({
	level: 'info',
	ts: 1730000100,
	request: { remote_ip: '10.140.140.98', host: '10.140.140.223:8710', uri: '/?k=x' },
	status: 401,
})
const ok = JSON.stringify({ level: 'info', ts: 1730000200, request: { remote_ip: '1.1.1.1', uri: '/' }, status: 200 })

test('只挑 401/403', () => {
	const rows = parseRejects(`${ok}\n${forbidden}\n${unauthorized}\n`)
	assert.equal(rows.length, 2)
	assert.deepEqual(rows.map((row) => row.status), [401, 403])
})

test('最新的排在最前', () => {
	const rows = parseRejects(`${forbidden}\n${unauthorized}\n`)
	assert.equal(rows[0].status, 401)
})

test('行数上限生效', () => {
	const lines = Array.from({ length: 10 }, () => forbidden).join('\n')
	assert.equal(parseRejects(lines, 3).length, 3)
})

test('坏行与非 JSON 行被跳过', () => {
	const rows = parseRejects(`garbage\n{broken\n${forbidden}\n`)
	assert.equal(rows.length, 1)
})

test('时间戳转 ISO', () => {
	const rows = parseRejects(forbidden)
	assert.match(rows[0].at, /^\d{4}-\d{2}-\d{2}T/)
})

test('recentRejects 不带日志时返回空数组', async () => {
	const rows = await recentRejects({
		exec: async () => {
			throw new Error('no logs')
		},
	})
	assert.deepEqual(rows, [])
})

test('recentRejects 解析注入的输出', async () => {
	const rows = await recentRejects({ exec: async () => ({ stdout: forbidden }) })
	assert.equal(rows.length, 1)
	assert.equal(rows[0].ip, '10.140.140.99')
})
