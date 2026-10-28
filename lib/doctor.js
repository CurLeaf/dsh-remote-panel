/**
 * 环境体检（静态）。
 *
 * 和 `/probe` 的分工：
 *   /doctor  → 装没装、装的地方对不对、端口与包管理器（部署前看）
 *   /probe   → 单元跑没跑、healthz 通不通、上游是不是 DSH（部署后看）
 *
 * 只读：不安装、不改配置。所有外部调用都可注入，单测不碰真实系统。
 */

import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access as fsAccess } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** 固定单元名，禁止拼接。 */
export const UNITS = { easytier: 'easytier-dsh-remote', caddy: 'dsh-proxy' }

/** 二进制候选路径（不用 which：它依赖进程 PATH，和 unit 的绝对路径可能不一致）。 */
export const BINARIES = {
	caddy: ['/usr/bin/caddy', '/usr/local/bin/caddy'],
	easytier: ['/usr/local/bin/easytier-core'],
}

const PACKAGE_MANAGERS = ['/usr/bin/apt-get', '/usr/bin/dnf', '/usr/bin/pacman']
const TIMEOUT = 1200

function message(error) {
	return error instanceof Error ? error.message : String(error)
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

function summarize(checks) {
	// 只按「装没装」判：端口与包管理器是建议项，不该把 missing 抬成 partial
	const installed = checks.filter((check) => check.id.endsWith('.bin') || check.id.endsWith('.unit'))
	const states = installed.map((check) => check.state)
	if (states.length > 0 && states.every((state) => state === 'ok')) return 'ready'
	if (states.every((state) => state === 'missing' || state === 'unknown')) return 'missing'
	return 'partial'
}

/**
 * 跑一遍体检。
 * @param {{
 *   port?: number,
 *   platform?: string,
 *   exec?: Function,
 *   access?: Function,
 *   isPortFree?: (port: number) => Promise<boolean>,
 * }} [options]
 */
export async function runDoctor(options = {}) {
	const platform = options.platform ?? process.platform
	const exec = options.exec ?? run
	const access = options.access ?? fsAccess
	const isPortFree = options.isPortFree
	const port = Number(options.port ?? 8710)

	if (platform !== 'linux') {
		return {
			ok: true,
			summary: 'unknown',
			checks: [{ id: 'platform', state: 'unknown', detail: `v1 只体检 Linux，当前 ${platform}` }],
		}
	}

	const [caddyBin, etBin, caddyUnit, etUnit] = await Promise.all([
		checkBinary({ id: 'caddy.bin', candidates: BINARIES.caddy, access }),
		checkBinary({ id: 'et.bin', candidates: BINARIES.easytier, access }),
		checkUnit({ id: 'caddy.unit', unit: UNITS.caddy, user: true, exec, access }),
		checkUnit({ id: 'et.unit', unit: UNITS.easytier, user: false, exec, access }),
	])

	const etBinPath = etBin.state === 'ok' ? etBin.detail : undefined
	const cap = await checkCapability({ binPath: etBinPath, exec })

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
	const pkgCheck = managers.length > 0
		? { id: 'pkg', state: 'ok', detail: managers.join(' / ') }
		: { id: 'pkg', state: 'warn', detail: '未找到 apt-get / dnf / pacman，Caddy 可能需要手动安装' }

	const checks = [caddyBin, caddyUnit, etBin, etUnit, cap, portCheck, pkgCheck]
	return { ok: true, summary: summarize(checks), checks }
}
