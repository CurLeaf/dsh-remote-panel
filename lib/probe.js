/**
 * 数据面健康探测。
 *
 * 只读：固定单元名 + 固定路径，参数不来自用户输入（I3）。
 * 执行器与 HTTP 探测可注入，单测不依赖真实 systemd。
 */

import { execFile } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
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
 * 探测「这台机器上的反代」是 http 还是 https。
 *
 * 切了 TLS 之后 http 探活会拿到 400（TLS 端口不接受明文），面板会误报不健康；
 * 所以先试 https（内部 CA 不在本机信任链里，只探活不校验证书），失败再退回 http。
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok:boolean,status:number,body:string,scheme:'https'|'http'}>}
 */
export async function probeHealth(port, { https = httpsHealth, http = httpHealth, timeoutMs, host } = {}) {
	const secure = await https(port, { host, timeoutMs })
	if (secure.ok) return { ...secure, scheme: 'https' }
	const plain = await http(port, timeoutMs)
	return plain.ok ? { ...plain, scheme: 'http' } : { ...plain, scheme: 'http', httpsAttempt: secure }
}

/**
 * @param {number} port
 * @param {number} [timeoutMs]
 */
function httpsHealth(port, { host = '127.0.0.1', timeoutMs = 2000 } = {}) {
	return new Promise((resolve) => {
		// 连站点自己的地址（拿任务机 IP），不要绕 127.0.0.1：
		// Caddy 按 SNI 选站点，绕回环时握手会拿不到证书（tlsv1 alert internal error）。
		const req = httpsRequest(
			{
				host,
				port,
				path: '/healthz',
				rejectUnauthorized: false,
				timeout: timeoutMs,
			},
			(res) => {
				let body = ''
				res.setEncoding('utf8')
				res.on('data', (chunk) => {
					body += chunk
				})
				res.on('end', () =>
					resolve({
						ok: res.statusCode === 200 && body.trim() === 'ok',
						status: res.statusCode ?? 0,
						body: body.trim().slice(0, 64),
					}),
				)
			},
		)
		req.on('timeout', () => req.destroy(new Error('timeout')))
		req.on('error', (error) => resolve({ ok: false, status: 0, body: '', reason: String(error?.message ?? error) }))
		req.end()
	})
}

/**
 * @param {number} port
 * @param {number} [timeoutMs]
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
 * 证书有效期自检。
 *
 * 背景：Caddy 用内部 CA 给站点签 12 小时的叶子证书，到期前自动续。
 * 续签失败（磁盘满 / admin 接口挂了 / 配置改坏）时手机端会整段失联；
 * 而探活用的是 `rejectUnauthorized:false`，过期证书照样「握手成功」，面板因此毫无感知。
 * 这里单独把「实际发出的那张证书」取回来，看 SAN 与剩余时间。
 *
 * 只读：不触发续签、不碰 Caddy admin API，只做一次 TLS 握手。
 */

/** 剩余时间低于该阈值即视为不健康（小时）。 */
export const CERT_WARN_HOURS = 2

/** 最近一次 probe() 的证书结果；/status 只读这份缓存，不发网络请求。 */
let lastCert

/**
 * 最近一次证书探测结果（副本）。没探测过返回 undefined。
 * @returns {{ok:boolean, expiresAt:string|null, hoursLeft:number|null, subject:string, san:string, reason?:string}|undefined}
 */
export function lastCertSnapshot() {
	return lastCert === undefined ? undefined : { ...lastCert }
}

/** SAN 里一条 `IP Address:1.2.3.4` / `DNS:example.com` 是否覆盖 host。 */
export function sanCovers(san, host) {
	const target = String(host ?? '').trim()
	if (target === '') return false
	const ipv = isIP(target) !== 0
	for (const raw of String(san ?? '').split(',')) {
		const entry = raw.trim()
		if (entry === '') continue
		if (ipv) {
			// 证书里 IP 条目写成 `IP Address:<ip>`
			if (entry === `IP Address:${target}`) return true
			continue
		}
		if (!entry.startsWith('DNS:')) continue
		const name = entry.slice(4)
		if (name === target) return true
		// 通配符只匹配一个标签：*.example.com 覆盖 a.example.com，不覆盖 a.b.example.com
		if (name.startsWith('*.')) {
			const suffix = name.slice(1)
			const prefix = target.slice(0, target.length - suffix.length)
			if (target.endsWith(suffix) && prefix !== '' && !prefix.includes('.')) return true
		}
	}
	return false
}

/**
 * 把对端证书折算成面板要的结论。
 *
 * ok = 剩余时间 > warnHours 且 SAN 覆盖 host（握手是否成功由调用方保证）。
 * @param {{
 *   cert?: {valid_to?: string, subjectaltname?: string, subject?: {CN?: string}},
 *   host?: string,
 *   now?: number,
 *   warnHours?: number,
 * }} [input]
 */
export function evaluateCertificate({ cert, host, now = Date.now(), warnHours = CERT_WARN_HOURS } = {}) {
	const subject = typeof cert?.subject?.CN === 'string' ? cert.subject.CN : ''
	const san = typeof cert?.subjectaltname === 'string' ? cert.subjectaltname : ''
	const expires = Date.parse(String(cert?.valid_to ?? ''))
	if (!Number.isFinite(expires)) {
		return { ok: false, expiresAt: null, hoursLeft: null, subject, san, reason: '证书缺少 valid_to' }
	}
	// 保留一位小数：面板只用来判断「还剩几小时」，不需要毫秒级
	const hoursLeft = Math.round(((expires - now) / 3600000) * 10) / 10
	const result = { expiresAt: new Date(expires).toISOString(), hoursLeft, subject, san }
	if (hoursLeft <= 0) return { ok: false, ...result, reason: `证书已过期（${result.expiresAt}）` }
	if (!sanCovers(san, host)) return { ok: false, ...result, reason: `证书 SAN 不覆盖 ${host || '(空)'}` }
	if (hoursLeft <= warnHours) {
		return { ok: false, ...result, reason: `证书剩余时间低于 ${warnHours} 小时` }
	}
	return { ok: true, ...result }
}

/**
 * 对 host:port 做一次 TLS 握手，拿对端证书。
 *
 * 必须连站点自己的地址并带 SNI：Caddy 按 SNI 选站点，
 * 绕 127.0.0.1 或 SNI 写错都会拿到别的证书（甚至 tlsv1 alert internal error）。
 * 内部 CA 不在本机信任链里，所以不校验证书链；有效期与 SAN 由 evaluateCertificate 自己判。
 *
 * @param {{ host: string, port: number, timeoutMs?: number }} options
 */
function tlsPeerCertificate({ host, port, timeoutMs = 2000 } = {}) {
	return new Promise((resolve, reject) => {
		let settled = false
		const finish = (error, cert) => {
			if (settled) return
			settled = true
			if (error) reject(error)
			else resolve(cert)
		}
		let socket
		try {
			socket = tlsConnect(
				{ host, port: Number(port), servername: host, rejectUnauthorized: false, timeout: timeoutMs },
				() => {
					try {
						const cert = socket.getPeerCertificate()
						finish(null, cert)
						socket.end()
					} catch (error) {
						finish(error)
						socket.destroy()
					}
				},
			)
		} catch (error) {
			finish(error)
			return
		}
		// 超时与错误都必须收敛成结果，不能把异常抛回 probe()
		socket.on('timeout', () => {
			finish(new Error(`TLS 握手超时（${timeoutMs}ms）`))
			socket.destroy()
		})
		socket.on('error', (error) => finish(error))
	})
}

/**
 * 探测站点证书。任何失败都折算成结果对象，不抛异常。
 *
 * @param {{
 *   host?: string,
 *   port?: number,
 *   timeoutMs?: number,
 *   now?: number,
 *   warnHours?: number,
 *   peer?: typeof tlsPeerCertificate,
 * }} [options]
 * @returns {Promise<{ok:boolean, expiresAt:string|null, hoursLeft:number|null, subject:string, san:string, reason?:string}>}
 */
export async function probeCertificate({
	host,
	port,
	timeoutMs = 2000,
	now = Date.now(),
	warnHours = CERT_WARN_HOURS,
	peer = tlsPeerCertificate,
} = {}) {
	try {
		const cert = await peer({ host, port, timeoutMs })
		return evaluateCertificate({ cert, host, now, warnHours })
	} catch (error) {
		return {
			ok: false,
			expiresAt: null,
			hoursLeft: null,
			subject: '',
			san: '',
			reason: `TLS 握手失败：${String(error?.message ?? error)}`,
		}
	}
}

/** 没做握手时的占位结果（未部署 / 缺 IP / 未启用 TLS）。 */
function offlineCert(reason) {
	return { ok: false, expiresAt: null, hoursLeft: null, subject: '', san: '', reason }
}

/**
 * 把证书结果折成一条 doctor check（doctor.js 不在本次改动范围，由接口层追加）。
 * @param {{ok?:boolean, expiresAt?:string|null, hoursLeft?:number|null, reason?:string}|null} [cert]
 * @param {{ deployed?: boolean }} [options]
 */
export function certCheck(cert, { deployed = true } = {}) {
	const base = { id: 'tls.cert', label: '证书有效期' }
	if (!deployed) return { ...base, state: 'unknown', detail: '尚未部署，没有证书可查' }
	if (cert === undefined || cert === null) return { ...base, state: 'unknown', detail: '还没有证书探测结果' }
	if (cert.ok === true) {
		return { ...base, state: 'ok', detail: `剩余 ${cert.hoursLeft} 小时（${cert.expiresAt} 到期）` }
	}
	const hours = typeof cert.hoursLeft === 'number' ? `；剩余 ${cert.hoursLeft} 小时` : ''
	return { ...base, state: 'warn', detail: `${cert.reason ?? '证书不可用'}${hours}` }
}

/**
 * @param {{ port?: number } | null} state
 * @param {{ exec?: typeof run, health?: typeof httpHealth, upstream?: Function, certProbe?: Function, tls?: boolean, certTimeoutMs?: number }} [deps]
 */
export async function probe(state, deps = {}) {
	const exec = deps.exec ?? run
	const health = deps.health ?? probeHealth
	const certProbe = deps.certProbe ?? probeCertificate

	const [easytier, caddy] = await Promise.all([
		systemdState(UNITS.easytier, {}, exec),
		systemdState(UNITS.caddy, { user: true }, exec),
	])

	const port = Number(state?.port)
	const upstreamPort = Number(state?.upstream ?? 3080)
	const deployed = Number.isInteger(port) && port > 0
	const host = typeof state?.ip === 'string' ? state.ip.trim() : ''

	// 证书探测与 healthz/上游并行，最多多等 2s；失败只影响 cert 字段
	let certPromise
	if (!deployed) certPromise = Promise.resolve(offlineCert('未部署'))
	else if (host === '') certPromise = Promise.resolve(offlineCert('缺少站点 IP'))
	else if (deps.tls === false) certPromise = Promise.resolve(offlineCert('未启用 TLS'))
	else certPromise = Promise.resolve(certProbe({ host, port, timeoutMs: deps.certTimeoutMs ?? 2000 }))

	const healthz = deployed ? await health(port, { host: state.ip }) : { ok: false, status: 0, reason: '未部署' }
	const upstream = await (deps.upstream ?? upstreamCheck)(upstreamPort)
	const cert = await certPromise
	// /status 只读这份缓存：未部署时清空，避免面板拿旧证书
	lastCert = deployed ? cert : undefined

	return {
		ok: easytier.ok && caddy.ok && healthz.ok && upstream.ok,
		easytier,
		caddy,
		healthz,
		upstream,
		cert,
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
