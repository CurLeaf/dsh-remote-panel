import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
	BINARIES,
	UNITS,
	execPath,
	findDefaultTun,
	ipInCidr,
	parseInterfaces,
	parseShow,
	runDoctor,
} from '../lib/doctor.js'

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

const ADDR = [
	'1: lo    inet 127.0.0.1/8 scope host lo',
	'2: enp3s0    inet 192.168.1.94/24 brd 192.168.1.255 scope global dynamic enp3s0',
	'3: tun0    inet 10.20.0.1/30 scope global tun0',
	'4: tailscale0    inet 100.104.207.100/32 scope global tailscale0',
].join('\n')

const ROUTE_CLEAN = [
	'default via 192.168.1.1 dev enp3s0 proto dhcp src 192.168.1.94 metric 100',
	'10.20.0.0/30 dev tun0 proto kernel scope link src 10.20.0.1',
	'192.168.1.0/24 dev enp3s0 proto kernel scope link src 192.168.1.94',
].join('\n')

const ROUTE_HIJACK = ['0.0.0.0/1 dev tun0 scope link', '128.0.0.0/1 dev tun0 scope link'].join('\n')

function fakeExec({ loaded = true, help = '--tcp-whitelist <port>', route = ROUTE_CLEAN, ufw = 'inactive' } = {}) {
	return async (command, args) => {
		if (command === 'systemctl') {
			if (args[0] === 'is-active') return { stdout: `${ufw}\n`, stderr: '' }
			if (args[0] === '--user' && args[1] === 'show-environment') return { stdout: 'PATH=/usr/bin\n', stderr: '' }
			const unit = args[args.length - 1]
			return { stdout: loaded ? SYSTEMCTL_LOADED(unit) : NOT_FOUND, stderr: '' }
		}
		if (command === 'loginctl') return { stdout: 'Linger=yes\n', stderr: '' }
		if (command === 'ip') return { stdout: args.includes('route') ? route : ADDR, stderr: '' }
		if (command === BINARIES.easytier[0]) return { stdout: help, stderr: '' }
		throw new Error(`unexpected command ${command} ${args.join(' ')}`)
	}
}

function fakeAccess(existing) {
	return async (path) => {
		if (existing.includes(path)) return
		throw new Error(`ENOENT: ${path}`)
	}
}

const readFile = async (path) => {
	if (path === '/etc/ufw/ufw.conf') return 'ENABLED=no\n'
	throw new Error(`ENOENT: ${path}`)
}

const base = {
	exec: fakeExec(),
	access: fakeAccess(['/usr/bin/caddy', '/usr/local/bin/easytier-core', '/usr/bin/apt-get']),
	readFile,
	isPortFree: async () => true,
	virtualIp: '10.140.140.223',
	user: 'yxw',
	home: '/home/yxw',
}

const ALL = ['/usr/bin/caddy', '/usr/local/bin/easytier-core', '/usr/bin/apt-get']

test('本机真实形态下体检结果', async () => {
	const result = await runDoctor(base)
	assert.equal(result.summary, 'ready')
	const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]))
	assert.equal(byId['net.tun'].state, 'ok')
	assert.match(byId['net.tun'].detail, /tun0 10\.20\.0\.1\/30/)
	assert.match(byId['net.tun'].detail, /tailscale0/)
	assert.equal(byId['net.ip'].state, 'ok')
	assert.equal(byId['net.route'].state, 'ok')
	assert.equal(byId['net.fw'].state, 'ok')
	assert.equal(byId['sysd.user'].state, 'ok')
})

test('候选虚拟 IP 落在现有网段内 → warn', async () => {
	const result = await runDoctor({ ...base, virtualIp: '10.20.0.2' })
	const ip = result.checks.find((check) => check.id === 'net.ip')
	assert.equal(ip.state, 'warn')
	assert.match(ip.detail, /tun0/)
})

test('候选虚拟 IP 已被本机占用 → warn', async () => {
	const result = await runDoctor({ ...base, virtualIp: '192.168.1.94' })
	const ip = result.checks.find((check) => check.id === 'net.ip')
	assert.equal(ip.state, 'warn')
	assert.match(ip.detail, /已经在本机 enp3s0/)
})

test('TUN 抢默认路由 → warn', async () => {
	const result = await runDoctor({ ...base, exec: fakeExec({ route: ROUTE_HIJACK }) })
	const route = result.checks.find((check) => check.id === 'net.route')
	assert.equal(route.state, 'warn')
	assert.match(route.detail, /tun0/)
})

test('ufw 未启用时不算问题', async () => {
	const result = await runDoctor(base)
	assert.equal(result.checks.find((check) => check.id === 'net.fw').state, 'ok')
})

test('ufw 真正启用时给出放行提示', async () => {
	const result = await runDoctor({
		...base,
		exec: fakeExec({ ufw: 'active' }),
		readFile: async () => 'ENABLED=yes\n',
	})
	const fw = result.checks.find((check) => check.id === 'net.fw')
	assert.equal(fw.state, 'warn')
	assert.match(fw.detail, /8710\/tcp/)
})

test('什么都没装时 summary 为 missing', async () => {
	const result = await runDoctor({
		...base,
		exec: fakeExec({ loaded: false }),
		access: fakeAccess([]),
	})
	assert.equal(result.summary, 'missing')
	const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]))
	assert.equal(byId['caddy.bin'].state, 'missing')
	assert.equal(byId['caddy.unit'].state, 'missing')
	assert.equal(byId['et.cap'].state, 'unknown')
})

test('单元指向的二进制不存在 → warn', async () => {
	const result = await runDoctor({ ...base, access: fakeAccess(['/usr/local/bin/easytier-core', '/usr/bin/apt-get']) })
	const unit = result.checks.find((check) => check.id === 'caddy.unit')
	assert.equal(unit.state, 'warn')
	assert.match(unit.detail, /\/usr\/bin\/caddy/)
})

test('systemctl 不可用时各项 unknown 而非崩溃', async () => {
	const result = await runDoctor({
		...base,
		exec: async () => {
			throw new Error('systemd not running')
		},
		access: fakeAccess([]),
	})
	const unit = result.checks.find((check) => check.id === 'caddy.unit')
	assert.equal(unit.state, 'unknown')
	assert.match(unit.detail, /查询失败/)
})

test('端口被占用 → warn', async () => {
	const result = await runDoctor({ ...base, isPortFree: async () => false })
	assert.equal(result.checks.find((check) => check.id === 'port').state, 'warn')
})

test('EasyTier 不支持 tcp-whitelist → warn', async () => {
	const result = await runDoctor({ ...base, exec: fakeExec({ help: 'usage: easytier-core' }) })
	assert.equal(result.checks.find((check) => check.id === 'et.cap').state, 'warn')
})

test('非 Linux 直接 unknown 且不执行命令', async () => {
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

test('解析与判定小工具', () => {
	assert.deepEqual(parseShow('LoadState=loaded\nFragmentPath=/x\n'), { LoadState: 'loaded', FragmentPath: '/x' })
	assert.equal(execPath({ ExecStart: '{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run }' }), '/usr/bin/caddy')
	assert.equal(execPath({ ExecStart: '' }), undefined)
	assert.equal(parseInterfaces('2: enp3s0    inet 192.168.1.94/24 brd x')[0].cidr, '192.168.1.94/24')
	assert.equal(findDefaultTun(ROUTE_HIJACK).length, 2)
	assert.equal(findDefaultTun(ROUTE_CLEAN).length, 0)
	assert.equal(ipInCidr('10.20.0.2', '10.20.0.0/30'), true)
	assert.equal(ipInCidr('10.20.0.5', '10.20.0.0/30'), false)
})
