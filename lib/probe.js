/**
 * 数据面健康探测。
 *
 * 只读：固定单元名 + 固定路径，参数不来自用户输入（I3）。
 * 执行器与 HTTP 探测可注入，单测不依赖真实 systemd。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** 固定单元名，禁止拼接。 */
export const UNITS = { easytier: 'easytier-dsh-remote', caddy: 'dsh-proxy' }

/**
 * @param {string} unit
 * @param {{ user?: boolean }} [options]
 * @returns {Promise<{state:string, sub:string, ok:boolean}>}
 */
async function systemdState(unit, { user = false } = {}, exec = run) {
	const args = ['show', '-p', 'ActiveState', '-p', 'SubState', '--value', unit]
	if (user) args.unshift('--user')
	try {
		const { stdout } = await exec('systemctl', args, { timeout: 3000 })
		const [state = 'unknown', sub = 'unknown'] = String(stdout).trim().split('\n')
		return { state, sub, ok: state === 'active' }
	} catch (error) {
		return { state: 'unknown', sub: 'unavailable', ok: false, reason: String(error?.message ?? error) }
	}
}

/**
 * @param {number} port
 */
async function httpHealth(port, timeoutMs = 2000) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
			signal: AbortSignal.timeout(timeoutMs),
		})
		const text = (await response.text()).trim()
		return { ok: response.ok && text === 'ok', status: response.status, body: text.slice(0, 64) }
	} catch (error) {
		return { ok: false, status: 0, reason: String(error?.message ?? error) }
	}
}

/**
 * 上游是否是 DSH：未认证时应返回 401 且带特征文案。
 * @param {number} port
 */
async function upstreamCheck(port, timeoutMs = 2000) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(timeoutMs) })
		const text = (await response.text()).slice(0, 200)
		return {
			ok: response.status === 401 && text.includes('dsh web authentication required'),
			status: response.status,
		}
	} catch (error) {
		return { ok: false, status: 0, reason: String(error?.message ?? error) }
	}
}

/**
 * @param {{ port?: number } | null} state
 * @param {{ exec?: typeof run, health?: typeof httpHealth }} [deps]
 */
export async function probe(state, deps = {}) {
	const exec = deps.exec ?? run
	const health = deps.health ?? httpHealth

	const [easytier, caddy] = await Promise.all([
		systemdState(UNITS.easytier, {}, exec),
		systemdState(UNITS.caddy, { user: true }, exec),
	])

	const port = Number(state?.port)
	const upstreamPort = Number(state?.upstream ?? 3080)
	const deployed = Number.isInteger(port) && port > 0
	const healthz = deployed ? await health(port) : { ok: false, status: 0, reason: '未部署' }
	const upstream = await (deps.upstream ?? upstreamCheck)(upstreamPort)

	return {
		ok: easytier.ok && caddy.ok && healthz.ok && upstream.ok,
		easytier,
		caddy,
		healthz,
		upstream,
	}
}

/**
 * 重载用户级反代单元（走 unit 里的 ExecReload）。只用于固定单元名。
 * @param {{ exec?: typeof run }} [deps]
 */
export async function reloadProxy(deps = {}) {
	const exec = deps.exec ?? run
	try {
		await exec('systemctl', ['--user', 'reload', UNITS.caddy], { timeout: 5000 })
		return { ok: true }
	} catch (error) {
		return { ok: false, reason: String(error?.message ?? error) }
	}
}
