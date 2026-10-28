/**
 * 环境体检（静态）。
 *
 * 和 `/probe` 的分工：
 *   /doctor  → 装没装、装的地方对不对、网络会不会撞车、系统前置条件（部署前看）
 *   /probe   → 单元跑没跑、healthz 通不通、上游是不是 DSH（部署后看）
 *
 * 只读：不安装、不改配置。所有外部调用都可注入，单测不碰真实系统。
 */

import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** 固定单元名，禁止拼接。 */
export const UNITS = { easytier: 'easytier-dsh-remote', caddy: 'dsh-proxy' }

/** 二进制候选路径（不用 which：它依赖进程 PATH，和 unit 的绝对路径可能不一致）。 */
export const BINARIES = {
	caddy: ['/usr/bin/caddy', '/usr/local/bin/caddy', '/snap/bin/caddy', '/opt/caddy/caddy'],
	easytier: ['/usr/local/bin/easytier-core', '/usr/bin/easytier-core'],
}

const PACKAGE_MANAGERS = ['/usr/bin/apt-get', '/usr/bin/dnf', '/usr/bin/pacman']
const TIMEOUT = 1200

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

function message(error) {
	return error instanceof Error ? error.message : String(error)
}

function ipToInt(ip) {
	const parts = ip.split('.').map(Number)
	return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/**
 * IPv4 是否落在某个 CIDR 内。
 * @param {string} ip
 * @param {string} cidr 形如 192.168.1.0/24
 */
export function ipInCidr(ip, cidr) {
	if (!IPV4.test(ip)) return false
	const [base, bitsRaw] = String(cidr).split('/')
	if (!IPV4.test(base)) return false
	const bits = Number(bitsRaw)
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
	return (ipToInt(ip) & mask) === (ipToInt(base) & mask)
}

/** 解析 `ip -4 -o addr show`。 */
export function parseInterfaces(stdout) {
	const rows = []
	for (const line of String(stdout).split('\n')) {
		const match = /^\d+:\s+(\S+)\s+inet\s+([\d.]+)\/(\d+)/.exec(line)
		if (match !== null) rows.push({ name: match[1], ip: match[2], cidr: `${match[2]}/${match[3]}` })
	}
	return rows
}

/** 解析 `ip route show`，挑出「抢默认路由」的虚拟网卡。 */
export function findDefaultTun(stdout) {
	const rows = []
	for (const line of String(stdout).split('\n')) {
		const trimmed = line.trim()
		if (trimmed === '') continue
		const halfDefault = /^0\.0\.0\.0\/1\s/.test(trimmed) || /^128\.0\.0\.0\/1\s/.test(trimmed)
		const defaultDev = trimmed.startsWith('default dev ')
		const dev = /(?:^|\s)dev\s+(\S+)/.exec(trimmed)?.[1]
		if ((halfDefault || defaultDev) && dev !== undefined && /^(tun|tap|utun|wg|tailscale|easy|nordlynx|karing)/i.test(dev)) {
			rows.push({ dev, line: trimmed })
		}
	}
	return rows
}

/** 解析 `systemctl show` 的 Key=Value 输出。 */
export function parseShow(stdout) {
	const props = {}
	for (const line of String(stdout).split('\n')) {
		const at = line.indexOf('=')
		if (at === -1) continue
		props[line.slice(0, at)] = line.slice(at + 1)
	}
	return props
}

/** 从 ExecStart 的序列化形式里取可执行文件路径。 */
export function execPath(props) {
	const value = props.ExecStart ?? ''
	const match = /(?:^|[\s{])path=([^;\s]+)/.exec(value)
	return match?.[1]
}

async function firstExecutable(candidates, access) {
	for (const path of candidates) {
		try {
			await access(path, constants.X_OK)
			return path
		} catch {
			/* 继续找下一个 */
		}
	}
	return undefined
}

async function showUnit(unit, user, exec) {
	const args = ['show', '-p', 'LoadState', '-p', 'FragmentPath', '-p', 'ExecStart', unit]
	if (user) args.unshift('--user')
	const { stdout } = await exec('systemctl', args, { timeout: TIMEOUT })
	return parseShow(stdout)
}

async function checkUnit({ id, unit, user, exec, access }) {
	try {
		const props = await showUnit(unit, user, exec)
		const load = props.LoadState ?? ''
		if (load === 'not-found') return { id, state: 'missing', detail: `${unit} 未安装` }
		if (load === '') return { id, state: 'unknown', detail: 'systemd 未返回 LoadState' }

		const target = execPath(props)
		if (target !== undefined) {
			try {
				await access(target, constants.X_OK)
			} catch {
				return { id, state: 'warn', detail: `单元指向 ${target}，但文件不存在` }
			}
		}
		return { id, state: 'ok', detail: target === undefined ? load : `${load} · ${target}` }
	} catch (error) {
		return { id, state: 'unknown', detail: `查询失败：${message(error)}` }
	}
}

async function checkBinary({ id, candidates, access }) {
	const found = await firstExecutable(candidates, access)
	return found === undefined
		? { id, state: 'missing', detail: `未找到：${candidates.join(' / ')}` }
		: { id, state: 'ok', detail: found }
}

async function checkCapability({ binPath, exec }) {
	if (binPath === undefined) return { id: 'et.cap', state: 'unknown', detail: 'EasyTier 未安装' }
	try {
		const { stdout } = await exec(binPath, ['--help'], { timeout: TIMEOUT })
		return String(stdout).includes('tcp-whitelist')
			? { id: 'et.cap', state: 'ok', detail: '支持 --tcp-whitelist' }
			: { id: 'et.cap', state: 'warn', detail: '该版本不支持 --tcp-whitelist，脚本会自动跳过' }
	} catch (error) {
		return { id: 'et.cap', state: 'unknown', detail: `无法执行 --help：${message(error)}` }
	}
}

async function checkNet({ exec, virtualIp, devName }) {
	const rows = []
	try {
		const { stdout } = await exec('ip', ['-4', '-o', 'addr', 'show'], { timeout: TIMEOUT })
		const interfaces = parseInterfaces(stdout)
		const tuns = interfaces.filter((row) => /^(tun|tap|utun|wg|tailscale|easy)/i.test(row.name))

		// 网卡名必须与现有网卡全都不一样，否则 EasyTier 建 TUN 会直接失败
		const taken = interfaces.some((row) => row.name === devName)
		rows.push(
			taken
				? { id: 'net.dev', state: 'warn', detail: `${devName} 已被占用，请换一个网卡名` }
				: { id: 'net.dev', state: 'ok', detail: `${devName} 可用` },
		)
		// 有 TUN 是事实，不是问题：只有它抢了默认路由才是问题（见 net.route）
		rows.push({
			id: 'net.tun',
			state: 'ok',
			detail:
				tuns.length === 0
					? '没有额外的虚拟网卡'
					: `${tuns.map((row) => `${row.name} ${row.cidr}`).join(' / ')}（注意分流规则）`,
		})

		if (virtualIp === undefined || virtualIp === '') {
			rows.push({ id: 'net.ip', state: 'unknown', detail: '未提供候选虚拟 IP' })
		} else if (!IPV4.test(virtualIp)) {
			rows.push({ id: 'net.ip', state: 'warn', detail: `${virtualIp} 不是合法 IPv4` })
		} else {
			const same = interfaces.find((row) => row.ip === virtualIp)
			const conflict = interfaces.find(
				(row) => row.ip !== virtualIp && row.name !== 'lo' && ipInCidr(virtualIp, row.cidr),
			)
			if (same !== undefined) {
				rows.push({ id: 'net.ip', state: 'warn', detail: `${virtualIp} 已经在本机 ${same.name} 上` })
			} else if (conflict !== undefined) {
				rows.push({
					id: 'net.ip',
					state: 'warn',
					detail: `${virtualIp} 落在 ${conflict.name} 的 ${conflict.cidr} 内，会与现有网络冲突`,
				})
			} else {
				rows.push({ id: 'net.ip', state: 'ok', detail: `${virtualIp} 与现有网段不冲突` })
			}
		}
	} catch (error) {
		rows.push({ id: 'net.tun', state: 'unknown', detail: message(error) })
		rows.push({ id: 'net.ip', state: 'unknown', detail: message(error) })
	}

	try {
		const { stdout } = await exec('ip', ['route', 'show'], { timeout: TIMEOUT })
		const hijack = findDefaultTun(stdout)
		rows.push(
			hijack.length === 0
				? { id: 'net.route', state: 'ok', detail: '没有 TUN 抢默认路由' }
				: {
						id: 'net.route',
						state: 'warn',
						detail: `${hijack.map((row) => row.dev).join(' / ')} 接管了默认路由，EasyTier 流量可能被代理劫持`,
					},
		)
	} catch (error) {
		rows.push({ id: 'net.route', state: 'unknown', detail: message(error) })
	}

	return rows
}

async function checkFirewall({ exec, readFile, port }) {
	try {
		const { stdout: active } = await exec('systemctl', ['is-active', 'ufw'], { timeout: TIMEOUT })
		const running = String(active).trim() === 'active'
		let config = ''
		try {
			config = String(await readFile('/etc/ufw/ufw.conf', 'utf8'))
		} catch {
			/* 读不到就只看服务状态 */
		}
		const persisted = /^ENABLED=yes$/m.test(config)
		if (running && persisted) {
			return { id: 'net.fw', state: 'warn', detail: `ufw 已启用，需要放行 ${port}/tcp 与 EasyTier 的中继端口` }
		}
		return {
			id: 'net.fw',
			state: 'ok',
			detail: running ? 'ufw 服务在跑但未启用（不拦流量）' : 'ufw 未启用',
		}
	} catch (error) {
		return { id: 'net.fw', state: 'unknown', detail: message(error) }
	}
}

async function checkUserSystemd({ exec, user }) {
	try {
		await exec('systemctl', ['--user', 'show-environment'], { timeout: TIMEOUT })
	} catch (error) {
		return { id: 'sysd.user', state: 'unknown', detail: `用户级 systemd 不可用：${message(error)}` }
	}
	try {
		const { stdout } = await exec('loginctl', ['show-user', user, '-p', 'Linger'], { timeout: TIMEOUT })
		return /Linger=yes/.test(String(stdout))
			? { id: 'sysd.user', state: 'ok', detail: '用户级 systemd 可用，linger 已开' }
			: { id: 'sysd.user', state: 'warn', detail: 'linger 未开：注销后反代会停（部署脚本会打开）' }
	} catch (error) {
		return { id: 'sysd.user', state: 'unknown', detail: `无法查询 linger：${message(error)}` }
	}
}

function summarize(checks) {
	// 只按「能不能开始用」判：端口与包管理器是建议项，不该把 missing 抬成 partial
	const install = checks.filter((check) => /\.(bin|unit)$/.test(check.id)).map((check) => check.state)
	if (install.every((state) => state === 'missing' || state === 'unknown')) return 'missing'
	const blocking = checks
		.filter((check) => /\.(bin|unit|cap)$/.test(check.id) || check.id.startsWith('net.'))
		.map((check) => check.state)
	if (blocking.every((state) => state === 'ok')) return 'ready'
	return 'partial'
}

/**
 * 跑一遍体检。
 * @param {{
 *   port?: number,
 *   virtualIp?: string,
 *   devName?: string,
 *   home?: string,
 *   user?: string,
 *   platform?: string,
 *   exec?: Function,
 *   access?: Function,
 *   readFile?: Function,
 *   isPortFree?: (port: number) => Promise<boolean>,
 * }} [options]
 */
export async function runDoctor(options = {}) {
	const platform = options.platform ?? process.platform
	const exec = options.exec ?? run
	const access = options.access ?? fsAccess
	const readFile = options.readFile ?? fsReadFile
	const isPortFree = options.isPortFree
	const port = Number(options.port ?? 8710)
	const home = options.home ?? homedir()
	const user = options.user ?? userInfo().username

	if (platform !== 'linux') {
		return {
			ok: true,
			summary: 'unknown',
			checks: [{ id: 'platform', state: 'unknown', detail: `v1 只体检 Linux，当前 ${platform}` }],
		}
	}

	const caddyCandidates = [...BINARIES.caddy, `${home}/.local/bin/caddy`]
	const etCandidates = [...BINARIES.easytier, `${home}/.local/bin/easytier-core`]

	const [caddyBin, etBin, caddyUnit, etUnit, net, firewall, sysd] = await Promise.all([
		checkBinary({ id: 'caddy.bin', candidates: caddyCandidates, access }),
		checkBinary({ id: 'et.bin', candidates: etCandidates, access }),
		checkUnit({ id: 'caddy.unit', unit: UNITS.caddy, user: true, exec, access }),
		checkUnit({ id: 'et.unit', unit: UNITS.easytier, user: false, exec, access }),
		checkNet({ exec, virtualIp: options.virtualIp, devName: options.devName ?? 'dshmesh0' }),
		checkFirewall({ exec, readFile, port }),
		checkUserSystemd({ exec, user }),
	])

	const cap = await checkCapability({ binPath: etBin.state === 'ok' ? etBin.detail : undefined, exec })

	let portCheck = { id: 'port', state: 'unknown', detail: '未提供端口探测' }
	if (typeof isPortFree === 'function') {
		try {
			const free = await isPortFree(port)
			portCheck = free
				? { id: 'port', state: 'ok', detail: `${port} 空闲` }
				: { id: 'port', state: 'warn', detail: `${port} 已被占用，向导会另选端口` }
		} catch (error) {
			portCheck = { id: 'port', state: 'unknown', detail: message(error) }
		}
	}

	const managers = []
	for (const candidate of PACKAGE_MANAGERS) {
		try {
			await access(candidate, constants.X_OK)
			managers.push(candidate.split('/').pop())
		} catch {
			/* 忽略 */
		}
	}
	const pkg =
		managers.length > 0
			? { id: 'pkg', state: 'ok', detail: managers.join(' / ') }
			: { id: 'pkg', state: 'warn', detail: '未找到 apt-get / dnf / pacman，Caddy 可能需要手动安装' }

	const checks = [caddyBin, caddyUnit, etBin, etUnit, cap, ...net, firewall, sysd, portCheck, pkg]
	return { ok: true, summary: summarize(checks), checks }
}
