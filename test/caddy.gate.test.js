import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { renderDeploy } from '../lib/deploy/render.js'

/**
 * 用真实 Caddy 二进制验证门禁语义。
 * 只在设置了 CADDY_BIN 时运行，避免 CI 依赖外部下载：
 *   CADDY_BIN=/path/to/caddy npm test
 */

const CADDY = process.env.CADDY_BIN

function freePort() {
	return new Promise((resolve, reject) => {
		const server = createTcpServer()
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address()
			server.close(() => resolve(port))
		})
	})
}

async function waitFor(url, attempts = 40) {
	for (let i = 0; i < attempts; i += 1) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(500) })
			if (response.status > 0) return true
		} catch {
			/* 还没起来 */
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	return false
}

const KEY = 'MwcufbMjggfe3b8wYm8Rxykm'

test('真实 Caddy 下的门禁语义', { skip: CADDY === undefined && '未设置 CADDY_BIN' }, async (t) => {
	const proxyPort = await freePort()
	const upstreamPort = await freePort()
	const dir = mkdtempSync(join(tmpdir(), 'panel-caddy-'))

	const upstream = createServer((_req, res) => {
		res.writeHead(401, { 'content-type': 'text/plain' })
		res.end('dsh web authentication required; reopen the URL printed by dsh web.')
	})
	await new Promise((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve))

	const { files } = renderDeploy({
		version: '0.1.0',
		user: 'tester',
		home: dir,
		virtualIp: '10.140.140.223',
		port: proxyPort,
		upstreamPort,
		accessKey: KEY,
		networkSecret: 'abcdefghijklmnop1234',
		networkName: 'test',
		relay: '1.2.3.4:14010',
	})
	const config = join(dir, 'Caddyfile')
	writeFileSync(config, files['~/.config/caddy/Caddyfile'])

	const child = spawn(CADDY, ['run', '--config', config, '--adapter', 'caddyfile'], {
		stdio: 'ignore',
		env: { ...process.env, XDG_DATA_HOME: join(dir, 'data'), XDG_CONFIG_HOME: join(dir, 'config') },
	})

	t.after(async () => {
		child.kill('SIGTERM')
		await new Promise((resolve) => upstream.close(resolve))
		rmSync(dir, { recursive: true, force: true })
	})

	const base = `http://127.0.0.1:${proxyPort}`
	assert.ok(await waitFor(`${base}/healthz`), 'caddy 未在预期时间内就绪')

	const health = await fetch(`${base}/healthz`)
	assert.equal(health.status, 200)

	const denied = await fetch(`${base}/`)
	assert.equal(denied.status, 401)
	assert.match(await denied.text(), /access key required/)

	const wrongKey = await fetch(`${base}/?k=wrongwrongwrongwrong`)
	assert.equal(wrongKey.status, 401)

	const ok = await fetch(`${base}/?k=${KEY}`, { redirect: 'manual' })
	assert.equal(ok.status, 303)
	assert.equal(ok.headers.get('location'), '/')
	assert.ok(ok.headers.get('set-cookie')?.includes(`dsh_gate=${KEY}`))

	const paired = await fetch(`${base}/`, { headers: { cookie: `dsh_gate=${KEY}` } })
	assert.equal(paired.status, 401)
	assert.match(await paired.text(), /dsh web authentication required/)
})
