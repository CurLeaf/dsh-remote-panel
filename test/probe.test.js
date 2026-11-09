import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { probe, readApkAssets } from '../lib/probe.js'

const STATE = {
	provider: 'dsh-tunnel',
	hostname: 'home.example.test',
	port: 443,
	accessKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd',
	upstream: 3080,
	relayUrl: 'wss://relay.example.test/agent',
	consoleUrl: '',
}

function deps(overrides = {}) {
	return {
		exec: async () => ({ ok: true, out: 'active' }),
		cert: async () => ({ ok: true, hoursLeft: 1000, expiresAt: '2027-01-01T00:00:00.000Z' }),
		gate: async () => ({ ok: true, status: 401 }),
		upstream: async () => ({ ok: true, status: 401 }),
		apk: () => ({ ok: true, versionName: '0.3.5' }),
		...overrides,
	}
}

test('未部署时每一项都报未部署，且整体为红', async () => {
	const result = await probe(null, deps())
	assert.equal(result.ok, false)
	assert.equal(result.agent.reason, '未部署')
	assert.equal(result.cert.reason, '未部署')
	assert.equal(result.gate.reason, '未部署')
	assert.equal(result.upstream.reason, '未部署')
})

test('agent / 证书 / 门禁 / 上游全绿时整体为绿', async () => {
	const result = await probe(STATE, deps())
	assert.equal(result.ok, true)
	assert.equal(result.agent.ok, true)
	assert.equal(result.cert.ok, true)
	assert.equal(result.gate.ok, true)
	assert.equal(result.upstream.ok, true)
})

test('任一链路环节为红，整体就红', async () => {
	for (const key of ['cert', 'gate', 'upstream']) {
		const result = await probe(STATE, deps({ [key]: async () => ({ ok: false, reason: 'boom' }) }))
		assert.equal(result.ok, false, `${key} 红时整体应红`)
	}
})

test('agent 不是 active 时整体为红', async () => {
	const result = await probe(STATE, deps({ exec: async () => ({ ok: false, out: 'inactive' }) }))
	assert.equal(result.ok, false)
	assert.equal(result.agent.state, 'inactive')
})

test('手机壳缺包不把整条链路判红', async () => {
	const result = await probe(STATE, deps({ apk: () => ({ ok: false, reason: '缺少手机壳资源' }) }))
	assert.equal(result.ok, true)
	assert.equal(result.apk.ok, false)
})

test('readApkAssets 校验清单与包体大小', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dsh-panel-apk-'))
	writeFileSync(join(dir, 'app.apk'), Buffer.alloc(10))
	writeFileSync(
		join(dir, 'version.json'),
		JSON.stringify({ versionCode: 15, versionName: '0.3.5', size: 10, sha256: 'x' }),
	)
	const ok = readApkAssets(`${dir}/`)
	assert.equal(ok.ok, true)
	assert.equal(ok.versionName, '0.3.5')

	writeFileSync(
		join(dir, 'version.json'),
		JSON.stringify({ versionCode: 15, versionName: '0.3.5', size: 99, sha256: 'x' }),
	)
	assert.equal(readApkAssets(`${dir}/`).ok, false)

	writeFileSync(join(dir, 'version.json'), '{bad json')
	assert.equal(readApkAssets(`${dir}/`).ok, false)
})
