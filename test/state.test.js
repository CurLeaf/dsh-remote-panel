import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { applyBackfill, parseBackfill, readState, statePath } from '../lib/state.js'

function encode(payload) {
	return `DSH_REMOTE_OK ${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`
}

test('解析带前缀的回填码', () => {
	const parsed = parseBackfill(encode({ version: '0.1.0', port: 8710, ip: '10.140.140.223', upstream: 3080 }))
	assert.equal(parsed.port, 8710)
	assert.equal(parsed.ip, '10.140.140.223')
	assert.equal(parsed.upstream, 3080)
})

test('解析不带前缀的裸 base64', () => {
	const code = encode({ port: 8710, ip: '10.0.0.1' }).replace('DSH_REMOTE_OK ', '')
	assert.equal(parseBackfill(code).port, 8710)
})

test('空回填码被拒', () => {
	assert.throws(() => parseBackfill('   '), /为空/)
})

test('端口非法被拒', () => {
	assert.throws(() => parseBackfill(encode({ port: 70000, ip: '10.0.0.1' })), /端口非法/)
})

test('IP 非法被拒', () => {
	assert.throws(() => parseBackfill(encode({ port: 8710, ip: '10.0.0.999' })), /虚拟 IP 非法/)
})

test('被截断的回填码被拒', () => {
	const truncated = encode({ port: 8710, ip: '10.0.0.1' }).slice(0, 20)
	assert.throws(() => parseBackfill(truncated), /JSON|base64/)
})

test('applyBackfill 落盘且权限 0600', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-state-'))
	try {
		const { state, path } = applyBackfill(encode({ port: 8710, ip: '10.0.0.1' }), { version: '0.1.0', home })
		assert.equal(path, statePath(home))
		assert.equal(state.port, 8710)
		assert.equal(statSync(path).mode & 0o777, 0o600)

		const loaded = readState(home)
		assert.equal(loaded.ip, '10.0.0.1')
		assert.equal(loaded.schema, 1)
		assert.equal(loaded.panelVersion, '0.1.0')
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

test('状态文件损坏时返回 null', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-state-'))
	try {
		writeFileSync(join(home, 'remote-panel.json'), '{broken')
		assert.equal(readState(home), null)
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

test('落盘文件是合法 JSON 且不含 BOM', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-state-'))
	try {
		applyBackfill(encode({ port: 8710, ip: '10.0.0.1' }), { version: '0.1.0', home })
		const raw = readFileSync(join(home, 'remote-panel.json'), 'utf8')
		assert.doesNotThrow(() => JSON.parse(raw))
		assert.ok(!raw.startsWith('\uFEFF'))
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})
