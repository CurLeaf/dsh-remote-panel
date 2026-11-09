import assert from 'node:assert/strict'
import { test } from 'node:test'

import { baseUrl, pairingUrls, renderQr } from '../lib/pair.js'

test('443 不写端口，避免二维码里出现 :443', () => {
	assert.equal(baseUrl({ hostname: 'Home.Example.Test', port: 443 }), 'https://home.example.test')
	assert.equal(baseUrl({ hostname: 'home.example.test' }), 'https://home.example.test')
	assert.equal(baseUrl({ hostname: 'home.example.test', port: 8443 }), 'https://home.example.test:8443')
})

test('缺域名直接报错，而不是拼出非法地址', () => {
	assert.throws(() => baseUrl({ hostname: '' }), /缺少域名/)
})

test('配对链接只有门禁口令，不带令牌', () => {
	const urls = pairingUrls({ hostname: 'home.example.test', accessKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd' })
	assert.equal(urls.combo, 'https://home.example.test/?k=K7mQ2vT9pLxR4nW8sZbY3cHd')
	assert.equal(urls.gate, urls.combo)
	assert.equal(urls.apk, 'https://home.example.test/app.apk?k=K7mQ2vT9pLxR4nW8sZbY3cHd')
	assert.equal(urls.manifest, 'https://home.example.test/manifest.webmanifest')
	assert.equal(urls.version, 'https://home.example.test/version.json')
	assert.equal('token' in urls, false)
})

test('没有口令时 APK 链接不出现', () => {
	const urls = pairingUrls({ hostname: 'home.example.test' })
	assert.equal(urls.apk, undefined)
	assert.equal(urls.combo, 'https://home.example.test/')
})

test('二维码是 SVG', async () => {
	const svg = await renderQr('https://home.example.test/?k=K7mQ2vT9pLxR4nW8sZbY3cHd')
	assert.match(svg, /^<svg/)
	assert.match(svg, /<\/svg>\s*$/)
})
