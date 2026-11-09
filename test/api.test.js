import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'

import { BadRequest, defaults, readJson, renderDeploy, suggestToken } from '../lib/api.js'

function stream(text) {
	return {
		async *[Symbol.asyncIterator]() {
			if (text !== '') yield Buffer.from(text)
		},
	}
}

test('readJson 解析对象，空体/数组/坏 JSON 都是 400', async () => {
	assert.deepEqual(await readJson(stream('{"a":1}')), { a: 1 })
	await assert.rejects(() => readJson(stream('')), BadRequest)
	await assert.rejects(() => readJson(stream('[1,2]')), BadRequest)
	await assert.rejects(() => readJson(stream('{oops')), BadRequest)
})

test('readJson 超过 64KB 直接拒绝', async () => {
	await assert.rejects(() => readJson(stream(JSON.stringify({ a: 'x'.repeat(70 * 1024) }))), /请求体过大/)
})

test('suggestToken 长度与字符集符合门禁口令校验', () => {
	for (const length of [16, 24, 32]) {
		const value = suggestToken(length)
		assert.equal(value.length, length)
		assert.match(value, /^[A-Za-z0-9_-]+$/)
	}
})

test('defaults 带出门禁口令与安装所需字段', () => {
	const value = defaults()
	assert.equal(value.ok, true)
	assert.equal(typeof value.version, 'string')
	assert.match(value.gateKey, /^[A-Za-z0-9_-]{16,}$/)
	assert.equal(value.targetPort, 3080)
	assert.match(value.nodeBin, /^\//, 'nodeBin 必须是绝对路径')
})

test('renderDeploy 产出可执行脚本，并写入 agent.json', () => {
	const result = renderDeploy({
		relayUrl: 'wss://relay.example.test/agent',
		hostname: 'home.example.test',
		gateKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd',
		targetPort: 3080,
		nodeBin: '/usr/bin/node',
		consoleUrl: '',
	})
	assert.match(result.install, /systemctl --user daemon-reload/)
	assert.match(result.install, /\.config\/dsh-tunnel/)
	assert.match(result.install, /agent\.json/)
	assert.equal(result.summary.urls.public, 'https://home.example.test/')
})

test('renderDeploy 输入非法时抛 BadRequest', () => {
	assert.throws(
		() =>
			renderDeploy({
				relayUrl: 'not-a-url',
				hostname: 'home.example.test',
				gateKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd',
				nodeBin: '/usr/bin/node',
			}),
		BadRequest,
	)
})
