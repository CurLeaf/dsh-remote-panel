import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { publicState, readAgentConfig, readState } from '../lib/state.js'

function homeWith(config) {
	const home = mkdtempSync(join(tmpdir(), 'dsh-panel-state-'))
	mkdirSync(join(home, '.config', 'dsh-tunnel'), { recursive: true })
	writeFileSync(join(home, '.config', 'dsh-tunnel', 'agent.json'), JSON.stringify(config))
	return home
}

const CONFIG = {
	relayUrl: 'wss://relay.example.test/agent',
	hostname: 'home.example.test',
	gateKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd',
	targetPort: 3080,
	consoleUrl: 'https://admin.example.test/',
	nodeBin: '/usr/bin/node',
}

test('没有 agent.json 就是未部署', () => {
	const home = mkdtempSync(join(tmpdir(), 'dsh-panel-empty-'))
	assert.equal(readAgentConfig(home), null)
	assert.equal(readState(home), null)
})

test('损坏的 JSON 按未部署处理，不抛异常', () => {
	const home = mkdtempSync(join(tmpdir(), 'dsh-panel-broken-'))
	mkdirSync(join(home, '.config', 'dsh-tunnel'), { recursive: true })
	writeFileSync(join(home, '.config', 'dsh-tunnel', 'agent.json'), '{not json')
	assert.equal(readAgentConfig(home), null)
	assert.equal(readState(home), null)
})

test('readState 从 agent.json 映射出面板状态', () => {
	const home = homeWith(CONFIG)
	const state = readState(home)
	assert.equal(state.provider, 'dsh-tunnel')
	assert.equal(state.hostname, 'home.example.test')
	assert.equal(state.port, 443)
	assert.equal(state.accessKey, CONFIG.gateKey)
	assert.equal(state.upstream, 3080)
	assert.equal(state.relayUrl, CONFIG.relayUrl)
	assert.equal(typeof state.deployedAt, 'number')
})

test('缺 hostname / gateKey / relayUrl 都算未部署', () => {
	for (const key of ['hostname', 'gateKey', 'relayUrl']) {
		const home = homeWith({ ...CONFIG, [key]: '' })
		assert.equal(readAgentConfig(home), null, `${key} 为空时应返回 null`)
	}
})

test('publicState 不丢业务字段，但绝不带门禁口令', () => {
	const state = readState(homeWith(CONFIG))
	const pub = publicState(state)
	assert.equal(pub.hostname, 'home.example.test')
	assert.equal(pub.upstream, 3080)
	assert.equal('accessKey' in pub, false)
})
