import assert from 'node:assert/strict'
import { test } from 'node:test'

import { UNITS, probe } from '../lib/probe.js'

function execReturning(stdout) {
	return async () => ({ stdout, stderr: '' })
}

const active = execReturning('active\nrunning')
const failed = async () => {
	throw new Error('Unit not found')
}

test('两个单元都 active 且 healthz 正常时 ok', async () => {
	const result = await probe({ port: 8710 }, { exec: active, health: async () => ({ ok: true, status: 200 }) })
	assert.equal(result.ok, true)
	assert.equal(result.easytier.state, 'active')
	assert.equal(result.caddy.ok, true)
})

test('任一单元失败则 ok 为 false', async () => {
	const exec = async (_cmd, args) => {
		if (args.includes(UNITS.caddy)) throw new Error('inactive')
		return { stdout: 'active\nrunning', stderr: '' }
	}
	const result = await probe({ port: 8710 }, { exec, health: async () => ({ ok: true, status: 200 }) })
	assert.equal(result.ok, false)
	assert.equal(result.caddy.ok, false)
})

test('healthz 失败则整体不 ok', async () => {
	const result = await probe({ port: 8710 }, { exec: active, health: async () => ({ ok: false, status: 401 }) })
	assert.equal(result.ok, false)
	assert.equal(result.healthz.status, 401)
})

test('未部署时不探测 healthz', async () => {
	let called = false
	const result = await probe(null, {
		exec: active,
		health: async () => {
			called = true
			return { ok: true }
		},
	})
	assert.equal(called, false)
	assert.equal(result.healthz.ok, false)
	assert.match(result.healthz.reason, /未部署/)
})

test('caddy 探测带 --user，easytier 不带', async () => {
	const seen = []
	const exec = async (_cmd, args) => {
		seen.push(args)
		return { stdout: 'active\nrunning', stderr: '' }
	}
	await probe({ port: 8710 }, { exec, health: async () => ({ ok: true }) })
	const caddyCall = seen.find((args) => args.includes(UNITS.caddy))
	const etCall = seen.find((args) => args.includes(UNITS.easytier))
	assert.ok(caddyCall.includes('--user'))
	assert.ok(!etCall.includes('--user'))
})
