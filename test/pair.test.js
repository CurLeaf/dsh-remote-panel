import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findToken, pairingUrls, parseToken, renderQr } from '../lib/pair.js'

const sample = `
dsh web listening on http://127.0.0.1:3080/?token=aaaaaaaaaaaaaaaaaaaaaaaa
noise http://10.0.0.1:9999/?token=zzzzzzzzzzzzzzzzzzzzzzzz
dsh web listening on http://127.0.0.1:3080/?token=bbbbbbbbbbbbbbbbbbbbbbbb
`

test('取指定端口的最后一个令牌', () => {
	assert.equal(parseToken(sample, 3080), 'bbbbbbbbbbbbbbbbbbbbbbbb')
})

test('端口不匹配返回 undefined', () => {
	assert.equal(parseToken(sample, 4000), undefined)
})

test('令牌过短不认', () => {
	assert.equal(parseToken('http://127.0.0.1:3080/?token=short', 3080), undefined)
})

test('非字符串输入安全返回', () => {
	assert.equal(parseToken(undefined, 3080), undefined)
})

test('findToken 会调用 journalctl 并解析', async () => {
	let argv
	const token = await findToken({
		port: 3080,
		exec: async (command, args) => {
			argv = [command, ...args]
			return { stdout: sample }
		},
	})
	assert.equal(token, 'bbbbbbbbbbbbbbbbbbbbbbbb')
	assert.equal(argv[0], 'journalctl')
	assert.ok(argv.includes('--user'))
})

test('findToken 失败时返回 undefined 而不抛', async () => {
	const token = await findToken({
		port: 3080,
		exec: async () => {
			throw new Error('journalctl not available')
		},
	})
	assert.equal(token, undefined)
})

test('pairingUrls 顺序与内容', () => {
	const urls = pairingUrls({ ip: '10.140.140.223', port: 8710, accessKey: 'k'.repeat(24), token: 't'.repeat(24) })
	assert.equal(urls.gate, `http://10.140.140.223:8710/?k=${'k'.repeat(24)}`)
	assert.equal(urls.token, `http://10.140.140.223:8710/?token=${'t'.repeat(24)}`)
})

test('renderQr 输出 svg', async () => {
	const svg = await renderQr('http://10.140.140.223:8710/?token=x')
	assert.match(svg, /^<svg/)
})
