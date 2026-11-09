import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appHeadInjections, withAppViewport } from '../lib/index.js'

test('head 注入指向边缘直出的 manifest 与图标', () => {
	const html = appHeadInjections().map((entry) => entry.html)
	assert.ok(html.some((line) => line.includes('rel="manifest" href="/manifest.webmanifest"')))
	assert.ok(html.some((line) => line.includes('href="/icon-192.png"')))
	assert.ok(html.some((line) => line.includes('apple-mobile-web-app-capable')))
	assert.ok(appHeadInjections().every((entry) => entry.kind === 'html' && entry.placement === 'head'))
})

test('viewport 补上安全区与键盘行为，且只补一次', () => {
	const source = '<meta name="viewport" content="width=device-width, initial-scale=1">'
	const once = withAppViewport(source)
	assert.match(once, /viewport-fit=cover/)
	assert.match(once, /interactive-widget=resizes-content/)
	assert.equal(withAppViewport(once), once)
})

test('没有 viewport 的页面原样返回', () => {
	assert.equal(withAppViewport('<html></html>'), '<html></html>')
})
