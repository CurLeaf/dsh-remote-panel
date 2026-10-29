import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
	CERT_WARN_HOURS,
	certCheck,
	lastCertSnapshot,
	probe,
	probeCertificate,
	probeHealth,
	sanCovers,
	UNITS,
} from '../lib/probe.js'

function execReturning(stdout) {
	return async () => ({ stdout, stderr: '' })
}

const active = execReturning('active\nrunning')
const failed = async () => {
	throw new Error('Unit not found')
}

const SITE_IP = '10.140.140.223'
/** 固定的「现在」：对应本地 2026-10-29 17:40 +08:00（= 09:40 UTC）。 */
const NOW = Date.parse('2026-10-29T17:40:00+08:00')

/** 造一张假证书（valid_to 用 Date 能解析的 UTC 字符串；真实 Caddy 格式另有专门测试）。 */
function fakeCert(hoursLeft, { san = `IP Address:${SITE_IP}`, subject = { CN: 'Caddy Local Authority' } } = {}) {
	const at = new Date(NOW + hoursLeft * 3600000)
	return { subject, subjectaltname: san, valid_from: new Date(NOW).toUTCString(), valid_to: at.toUTCString() }
}

function peerReturning(cert) {
	return async () => cert
}

test('两个单元都 active 且 healthz 正常时 ok', async () => {
	const result = await probe({ port: 8710 }, { exec: active, health: async () => ({ ok: true, status: 200 }), upstream: async () => ({ ok: true, status: 401 }) })
	assert.equal(result.ok, true)
	assert.equal(result.easytier.state, 'active')
	assert.equal(result.caddy.ok, true)
})

test('任一单元失败则 ok 为 false', async () => {
	const exec = async (_cmd, args) => {
		if (args.includes(UNITS.caddy)) throw new Error('inactive')
		return { stdout: 'active\nrunning', stderr: '' }
	}
	const result = await probe({ port: 8710 }, { exec, health: async () => ({ ok: true, status: 200 }), upstream: async () => ({ ok: true, status: 401 }) })
	assert.equal(result.ok, false)
	assert.equal(result.caddy.ok, false)
})

test('healthz 失败则整体不 ok', async () => {
	const result = await probe({ port: 8710 }, { exec: active, health: async () => ({ ok: false, status: 401 }), upstream: async () => ({ ok: true }) })
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
		upstream: async () => ({ ok: true }),
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
	await probe({ port: 8710 }, { exec, health: async () => ({ ok: true }), upstream: async () => ({ ok: true }) })
	const caddyCall = seen.find((args) => args.includes(UNITS.caddy))
	const etCall = seen.find((args) => args.includes(UNITS.easytier))
	assert.ok(caddyCall.includes('--user'))
	assert.ok(!etCall.includes('--user'))
})

test('上游不是 DSH 时 ok 为 false', async () => {
	const result = await probe(
		{ port: 8710 },
		{ exec: active, health: async () => ({ ok: true }), upstream: async () => ({ ok: false, status: 200 }) },
	)
	assert.equal(result.ok, false)
	assert.equal(result.upstream.status, 200)
})

test('probeHealth 先试 https，失败再退回 http', async () => {
	const down = { ok: false, status: 0, body: '' }
	const up = { ok: true, status: 200, body: 'ok' }
	const plain = await probeHealth(8710, { https: async () => down, http: async () => up })
	assert.equal(plain.scheme, 'http')
	assert.equal(plain.ok, true)
	const secure = await probeHealth(8710, { https: async () => up, http: async () => down })
	assert.equal(secure.scheme, 'https')
	assert.equal(secure.ok, true)
	const dead = await probeHealth(8710, { https: async () => down, http: async () => down })
	assert.equal(dead.ok, false)
})

// ── M3：证书有效期自检 ────────────────────────────────────────────────

test('证书剩余 > 2 小时且 SAN 覆盖站点 IP 时 ok（真实 Caddy 的 GMT 格式）', async () => {
	const result = await probeCertificate({
		host: SITE_IP,
		port: 8710,
		now: NOW,
		peer: peerReturning({
			subject: {},
			subjectaltname: `IP Address:${SITE_IP}`,
			valid_from: 'Oct 29 08:16:40 2026 GMT',
			valid_to: 'Oct 29 20:16:40 2026 GMT',
		}),
	})
	assert.equal(result.ok, true)
	assert.equal(result.hoursLeft, 10.6) // 09:40 UTC → 20:16:40 UTC
	assert.equal(result.expiresAt, '2026-10-29T20:16:40.000Z')
	assert.equal(result.san, `IP Address:${SITE_IP}`)
	assert.equal(result.reason, undefined)
})

test('证书剩余 < 2 小时时 ok 为 false 并带剩余小时数', async () => {
	const result = await probeCertificate({ host: SITE_IP, port: 8710, now: NOW, peer: peerReturning(fakeCert(1.5)) })
	assert.equal(result.ok, false)
	assert.equal(result.hoursLeft, 1.5)
	assert.match(result.reason, /低于 2 小时/)
	assert.equal(CERT_WARN_HOURS, 2)
})

test('证书已过期时 ok 为 false 且 reason 说明过期', async () => {
	const result = await probeCertificate({ host: SITE_IP, port: 8710, now: NOW, peer: peerReturning(fakeCert(-1)) })
	assert.equal(result.ok, false)
	assert.equal(result.hoursLeft, -1)
	assert.match(result.reason, /已过期/)
})

test('SAN 不覆盖站点 IP 时 ok 为 false（即使还有效）', async () => {
	const result = await probeCertificate({
		host: SITE_IP,
		port: 8710,
		now: NOW,
		peer: peerReturning(fakeCert(5, { san: 'IP Address:10.0.0.1' })),
	})
	assert.equal(result.ok, false)
	assert.equal(result.hoursLeft, 5)
	assert.match(result.reason, /SAN/)
	assert.match(result.reason, /10\.140\.140\.223/)
})

test('握手失败时不抛异常，返回 ok=false 与原因', async () => {
	const result = await probeCertificate({
		host: SITE_IP,
		port: 8710,
		now: NOW,
		peer: async () => {
			throw new Error('connect ECONNREFUSED 10.140.140.223:8710')
		},
	})
	assert.equal(result.ok, false)
	assert.equal(result.expiresAt, null)
	assert.equal(result.hoursLeft, null)
	assert.equal(result.subject, '')
	assert.equal(result.san, '')
	assert.match(result.reason, /TLS 握手失败/)
})

test('probe() 把证书结果挂在 cert 字段，并写入 /status 缓存', async () => {
	const fake = { ok: true, expiresAt: '2026-10-29T20:16:40.000Z', hoursLeft: 9.9, subject: '', san: `IP Address:${SITE_IP}` }
	const result = await probe(
		{ port: 8710, ip: SITE_IP },
		{
			exec: active,
			health: async () => ({ ok: true, status: 200 }),
			upstream: async () => ({ ok: true, status: 401 }),
			certProbe: async ({ host, port }) => {
				assert.equal(host, SITE_IP)
				assert.equal(port, 8710)
				return fake
			},
		},
	)
	assert.deepEqual(result.cert, fake)
	assert.equal(result.ok, true)
	assert.deepEqual(lastCertSnapshot(), fake)
})

test('缺少站点 IP 时不发 TLS 请求，cert 说明原因', async () => {
	let called = false
	const result = await probe(
		{ port: 8710 },
		{
			exec: active,
			health: async () => ({ ok: true }),
			upstream: async () => ({ ok: true }),
			certProbe: async () => {
				called = true
				return { ok: true }
			},
		},
	)
	assert.equal(called, false)
	assert.equal(result.cert.ok, false)
	assert.match(result.cert.reason, /IP/)
})

test('未启用 TLS 时不发握手，cert 说明原因', async () => {
	let called = false
	const result = await probe(
		{ port: 8710, ip: SITE_IP },
		{
			exec: active,
			health: async () => ({ ok: true }),
			upstream: async () => ({ ok: true }),
			tls: false,
			certProbe: async () => {
				called = true
				return { ok: true }
			},
		},
	)
	assert.equal(called, false)
	assert.equal(result.cert.ok, false)
	assert.match(result.cert.reason, /未启用 TLS/)
})

test('未部署时 cert 说明未部署，并清空缓存', async () => {
	await probe(
		{ port: 8710, ip: SITE_IP },
		{
			exec: active,
			health: async () => ({ ok: true }),
			upstream: async () => ({ ok: true }),
			certProbe: async () => ({ ok: true, expiresAt: 'x', hoursLeft: 3 }),
		},
	)
	assert.notEqual(lastCertSnapshot(), undefined)
	const result = await probe(null, {
		exec: active,
		health: async () => ({ ok: true }),
		upstream: async () => ({ ok: true }),
	})
	assert.equal(result.cert.ok, false)
	assert.match(result.cert.reason, /未部署/)
	assert.equal(lastCertSnapshot(), undefined)
})

test('sanCovers 认 IP 条目、DNS 条目与单层通配符', () => {
	assert.equal(sanCovers(`IP Address:${SITE_IP}`, SITE_IP), true)
	assert.equal(sanCovers(`IP Address:${SITE_IP}`, '10.140.140.224'), false)
	assert.equal(sanCovers('DNS:example.com, IP Address:10.0.0.1', 'example.com'), true)
	assert.equal(sanCovers('DNS:*.example.com', 'a.example.com'), true)
	assert.equal(sanCovers('DNS:*.example.com', 'a.b.example.com'), false)
	assert.equal(sanCovers('', SITE_IP), false)
})

test('certCheck 折成 doctor 行：ok / warn 带小时数 / 未部署 unknown', () => {
	const ok = certCheck({ ok: true, hoursLeft: 5, expiresAt: '2026-10-29T20:16:40.000Z' })
	assert.equal(ok.id, 'tls.cert')
	assert.equal(ok.label, '证书有效期')
	assert.equal(ok.state, 'ok')
	assert.match(ok.detail, /剩余 5 小时/)

	const warn = certCheck({ ok: false, hoursLeft: 1.5, reason: '证书剩余时间低于 2 小时' })
	assert.equal(warn.state, 'warn')
	assert.match(warn.detail, /剩余 1\.5 小时/)

	assert.equal(certCheck(undefined, { deployed: false }).state, 'unknown')
	assert.equal(certCheck(undefined).state, 'unknown')
})
