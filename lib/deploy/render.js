/**
 * 部署脚本渲染器。
 *
 * 纯函数、无 I/O 依赖（模板在模块加载时读取一次），便于单测。
 * 输出必须是「目标机 AI 能直接执行」的完整 bash，不含任何占位符。
 */

import { readFileSync } from 'node:fs'

const TEMPLATE_DIR = new URL('../../deploy/templates/', import.meta.url)

const templates = new Map()
function template(name) {
	let value = templates.get(name)
	if (value === undefined) {
		value = readFileSync(new URL(name, TEMPLATE_DIR), 'utf8')
		templates.set(name, value)
	}
	return value
}

const PLACEHOLDER = /@@([A-Z0-9_]+)@@/g

/**
 * 替换 `@@KEY@@`。
 * @param {string} text
 * @param {Record<string, string|number>} vars
 * @param {{ allowLeftover?: string[] }} [options]
 */
export function fill(text, vars, { allowLeftover = [] } = {}) {
	const out = text.replace(PLACEHOLDER, (match, key) => {
		// 放行的占位符留给下游（例如由部署脚本用 sed 二次填充）
		if (allowLeftover.includes(key)) return match
		if (!(key in vars)) {
			throw new Error(`模板占位符未提供值：${key}`)
		}
		return String(vars[key])
	})
	const leftover = [...out.matchAll(PLACEHOLDER)]
		.map((m) => m[1])
		.filter((key) => !allowLeftover.includes(key))
	if (leftover.length > 0) {
		throw new Error(`渲染后仍有未替换的占位符：${[...new Set(leftover)].join(', ')}`)
	}
	return out
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/
const NAME = /^[A-Za-z0-9._-]{1,64}$/
const USER = /^[a-z_][a-z0-9_-]{0,31}$/
const HOSTPORT = /^(?:[A-Za-z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/
const URL_PEER = /^(?:tcp|udp|ws|wss|quic):\/\/[^\s]+:\d{1,5}$/

function requireMatch(value, pattern, label) {
	if (typeof value !== 'string' || !pattern.test(value)) {
		throw new Error(`${label} 格式不合法：${String(value)}`)
	}
	return value
}

function requirePort(value, label) {
	const port = Number(value)
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`${label} 必须是 1-65535 的整数：${String(value)}`)
	}
	return port
}

/**
 * relay 接受两种写法：
 *   - "host:port"            → 自动展开为 tcp + udp 两条
 *   - "tcp://h:p;ws://h:p"   → 原样使用（分号或逗号分隔）
 * @param {string} relay
 * @returns {string[]}
 */
export function normalizeRelay(relay) {
	const trimmed = String(relay ?? '').trim()
	if (trimmed === '') throw new Error('中继地址不能为空')

	const parts = trimmed.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
	const urls = parts.every((part) => part.includes('://'))
		? parts
		: [`tcp://${trimmed}`, `udp://${trimmed}`]

	for (const url of urls) {
		if (!URL_PEER.test(url)) throw new Error(`中继地址格式不合法：${url}`)
	}
	return urls
}

/**
 * 校验并补默认值。
 * @param {Record<string, unknown>} raw
 */
export function normalizeInput(raw = {}) {
	const virtualIp = requireMatch(String(raw.virtualIp ?? ''), IPV4, '虚拟 IP')
	const port = requirePort(raw.port ?? 8710, '反代端口')
	const upstreamPort = requirePort(raw.upstreamPort ?? 3080, 'DSH 端口')
	const accessKey = requireMatch(String(raw.accessKey ?? ''), TOKEN, '访问口令')
	const networkSecret = requireMatch(String(raw.networkSecret ?? ''), TOKEN, '网络密钥')
	const networkName = requireMatch(String(raw.networkName ?? ''), NAME, '网络名')
	const user = requireMatch(String(raw.user ?? ''), USER, '用户名')
	const home = String(raw.home ?? '')

	if (!home.startsWith('/')) throw new Error(`home 必须是绝对路径：${home}`)

	const peers = normalizeRelay(raw.relay)
	const lanCidr = String(raw.lanCidr ?? '192.168.1.0/24')
	if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(lanCidr)) {
		throw new Error(`局域网 CIDR 格式不合法：${lanCidr}`)
	}

	return {
		user,
		home,
		virtualIp,
		port,
		upstreamPort,
		accessKey,
		networkSecret,
		networkName,
		hostname: String(raw.hostname ?? 'dsh-remote').replace(/[^A-Za-z0-9._-]/g, ''),
		lanCidr,
		peers,
		relayLabel: peers[0].replace(/^\w+:\/\//, ''),
		etVersion: String(raw.etVersion ?? '2.6.4'),
		version: String(raw.version ?? '0.0.0'),
	}
}

/**
 * 渲染全部产物。
 * @param {Record<string, unknown>} raw
 * @returns {{ files: Record<string,string>, install: string, summary: object }}
 */
export function renderDeploy(raw) {
	const input = normalizeInput(raw)

	const peersFlags = input.peers.map((url) => `--peers ${url}`).join(' \\\n\t')

	const env = fill(template('easytier.env.tmpl'), {
		VERSION: input.version,
		NETWORK_NAME: input.networkName,
		NETWORK_SECRET: input.networkSecret,
		VIRTUAL_IP: input.virtualIp,
		HOSTNAME: input.hostname,
	})

	const unit = fill(
		template('easytier.service.tmpl'),
		{
			VERSION: input.version,
			PEERS_FLAGS: peersFlags,
		},
		{ allowLeftover: ['TCP_WHITELIST'] },
	)

	const caddy = fill(template('Caddyfile.tmpl'), {
		VERSION: input.version,
		PORT: input.port,
		UPSTREAM_PORT: input.upstreamPort,
		VIRTUAL_IP: input.virtualIp,
		LAN_CIDR: input.lanCidr,
		ACCESS_KEY: input.accessKey,
	})

	const proxyUnit = fill(template('dsh-proxy.service.tmpl'), { VERSION: input.version })

	const install = fill(
		template('install.sh.tmpl'),
		{
			VERSION: input.version,
			USER: input.user,
			HOME: input.home,
			PORT: input.port,
			UPSTREAM_PORT: input.upstreamPort,
			VIRTUAL_IP: input.virtualIp,
			RELAY_HOST: input.relayLabel,
			ET_VERSION: input.etVersion,
			ENV_BODY: env.trimEnd(),
			UNIT_BODY: unit.trimEnd(),
			CADDY_BODY: caddy.trimEnd(),
			PROXY_UNIT_BODY: proxyUnit.trimEnd(),
		},
		{ allowLeftover: ['TCP_WHITELIST'] },
	)

	return {
		files: {
			'/etc/easytier/dsh-remote.env': env,
			'/etc/systemd/system/easytier-dsh-remote.service': unit,
			'~/.config/caddy/Caddyfile': caddy,
			'~/.config/systemd/user/dsh-proxy.service': proxyUnit,
		},
		install,
		summary: {
			urls: {
				mesh: `http://${input.virtualIp}:${input.port}/`,
				loopback: `http://127.0.0.1:${input.port}/`,
			},
			gate: `http://${input.virtualIp}:${input.port}/?k=${input.accessKey}`,
			peers: input.peers,
		},
	}
}
