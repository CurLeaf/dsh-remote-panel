import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertIpv4, pingHost } from '../lib/netcheck.js'

test('合法 IPv4 通过', () => {
	assert.equal(assertIpv4('10.140.140.223'), '10.140.140.223')
})

test('非法 IPv4 被拒', () => {
	assert.throws(() => assertIpv4('10.0.0.999'), /合法 IPv4/)
	assert.throws(() => assertIpv4('10.0.0.1; rm -rf /'), /合法 IPv4/)
	assert.throws(() => assertIpv4(''), /合法 IPv4/)
})

test('有应答判定为已占用', async () => {
	const result = await pingHost('10.0.0.1', { exec: async () => ({ stdout: '', stderr: '' }) })
	assert.equal(result.reachable, true)
})

test('无应答判定为可用', async () => {
	const result = await pingHost('10.0.0.1', {
		exec: async () => {
			const error = new Error('exit 1')
			error.code = 1
			throw error
		},
	})
	assert.equal(result.reachable, false)
	assert.match(result.detail, /无应答/)
})

test('缺 ping 时给出明确说明', async () => {
	const result = await pingHost('10.0.0.1', {
		exec: async () => {
			const error = new Error('not found')
			error.code = 'ENOENT'
			throw error
		},
	})
	assert.equal(result.reachable, false)
	assert.match(result.detail, /未安装 ping/)
})

test('参数不会注入到命令里', async () => {
	let argv
	await pingHost('10.0.0.1', {
		exec: async (command, args) => {
			argv = [command, ...args]
			return { stdout: '' }
		},
	})
	assert.equal(argv[0], 'ping')
	assert.deepEqual(argv.slice(-1), ['10.0.0.1'])
	assert.ok(!argv.join(' ').includes(';'))
})
