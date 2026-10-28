import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BINARIES, UNITS, execPath, parseShow, runDoctor } from '../lib/doctor.js'

const SYSTEMCTL_LOADED = (unit) =>
	unit === UNITS.caddy
		? [
				'LoadState=loaded',
				'FragmentPath=/home/yxw/.config/systemd/user/dsh-proxy.service',
				'ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run ; ignore_errors=no }',
				'',
			].join('\n')
		: [
				'LoadState=loaded',
				'FragmentPath=/etc/systemd/system/easytier-dsh-remote.service',
				'ExecStart={ path=/usr/local/bin/easytier-core ; argv[]=/usr/local/bin/easytier-core --network-name x }',
				'',
			].join('\n')

const NOT_FOUND = ['LoadState=not-found', 'FragmentPath=', 'ExecStart=', ''].join('\n')

function fakeExec({ loaded = true, help = '--tcp-whitelist <port>' } = {}) {
	return async (command, args) => {
		if (command === 'systemctl') {
			const unit = args[args.length - 1]
			return { stdout: loaded ? SYSTEMCTL_LOADED(unit) : NOT_FOUND, stderr: '' }
		}
		if (command === BINARIES.easytier[0]) return { stdout: help, stderr: '' }
		throw new Error(`unexpected command ${command}`)
	}
}

function fakeAccess(existing) {
	return async (path) => {
		if (existing.includes(path)) return
		throw new Error(`ENOENT: ${path}`)
	}
}

const ALL = ['/usr/bin/caddy', '/usr/local/bin/easytier-core', '/usr/bin/apt-get']

test('全都装好时 summary 为 ready', async () => {
	const result = await runDoctor({
		exec: fakeExec(),
		access: fakeAccess(ALL),
		isPortFree: async () => true,
	})
	assert.equal(result.summary, 'ready')
	assert.equal(result.checks.length, 7)
	assert.ok(result.checks.every((check) => check.state === 'ok'))
})

test('什么都没装时 summary 为 missing', async () => {
	const result = await runDoctor({
		exec: fakeExec({ loaded: false }),
		access: fakeAccess([]),
		isPortFree: async () => true,
	})
	assert.equal(result.summary, 'missing')
	const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]))
	assert.equal(byId['caddy.bin'].state, 'missing')
	assert.equal(byId['caddy.unit'].state, 'missing')
	assert.equal(byId['et.cap'].state, 'unknown')
})

test('单元存在但 ExecStart 指向的二进制不存在 → warn', async () => {
	const result = await runDoctor({
		exec: fakeExec(),
		// 故意不提供 /usr/bin/caddy
		access: fakeAccess(['/usr/local/bin/easytier-core', '/usr/bin/apt-get']),
		isPortFree: async () => true,
	})
	const caddyUnit = result.checks.find((check) => check.id === 'caddy.unit')
	assert.equal(caddyUnit.state, 'warn')
	assert.match(caddyUnit.detail, /\/usr\/bin\/caddy/)
	assert.equal(result.summary, 'partial')
})

test('systemctl 不可用时各项为 unknown 而非崩溃', async () => {
	const result = await runDoctor({
		exec: async () => {
			throw new Error('systemd not running')
		},
		access: fakeAccess([]),
		isPortFree: async () => true,
	})
	const unit = result.checks.find((check) => check.id === 'caddy.unit')
	assert.equal(unit.state, 'unknown')
	assert.match(unit.detail, /查询失败/)
})

test('端口被占用时给出 warn', async () => {
	const result = await runDoctor({
		exec: fakeExec(),
		access: fakeAccess(ALL),
		isPortFree: async () => false,
	})
	const port = result.checks.find((check) => check.id === 'port')
	assert.equal(port.state, 'warn')
	assert.match(port.detail, /占用/)
})

test('EasyTier 不支持 tcp-whitelist 时给出 warn', async () => {
	const result = await runDoctor({
		exec: fakeExec({ help: 'usage: easytier-core [options]' }),
		access: fakeAccess(ALL),
		isPortFree: async () => true,
	})
	const cap = result.checks.find((check) => check.id === 'et.cap')
	assert.equal(cap.state, 'warn')
	assert.match(cap.detail, /自动跳过/)
})

test('没有包管理器时给出 warn', async () => {
	const result = await runDoctor({
		exec: fakeExec(),
		access: fakeAccess(['/usr/bin/caddy', '/usr/local/bin/easytier-core']),
		isPortFree: async () => true,
	})
	const pkg = result.checks.find((check) => check.id === 'pkg')
	assert.equal(pkg.state, 'warn')
})

test('非 Linux 平台直接返回 unknown 且不执行任何命令', async () => {
	let called = false
	const result = await runDoctor({
		platform: 'win32',
		exec: async () => {
			called = true
			return { stdout: '' }
		},
	})
	assert.equal(result.summary, 'unknown')
	assert.equal(result.checks.length, 1)
	assert.equal(called, false)
})

test('parseShow 解析 Key=Value', () => {
	assert.deepEqual(parseShow('LoadState=loaded\nFragmentPath=/x\n'), { LoadState: 'loaded', FragmentPath: '/x' })
})

test('execPath 从序列化 ExecStart 里取路径', () => {
	assert.equal(execPath({ ExecStart: '{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run }' }), '/usr/bin/caddy')
	assert.equal(execPath({ ExecStart: '' }), undefined)
})
