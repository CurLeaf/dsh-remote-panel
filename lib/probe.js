/**
 * 隧道模式的状态探测：只探真实在跑的那条链路。
 *
 * 旧版的 EasyTier / Caddy / healthz 探针已随旧部署形态一起删除；
 * 这里每一项都对应隧道链路上的一个真实环节：
 *
 *   agent    本机 `dsh-remote-panel-tunnel.service` 是否 active
 *   cert     公网域名上的 TLS 证书（Let's Encrypt，浏览器是否信任、SAN 是否覆盖、还剩多久）
 *   gate     中继边缘的门禁（不带口令应为 401 + `access key required`）
 *   upstream 本机 DSH 是否在 3080 上应答（未认证应为 401 + `dsh web authentication required`）
 *   apk      手机壳安装包与版本清单是否就位（/app.apk、/version.json 由边缘直出）
 */

import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect as tlsConnect } from 'node:tls'

/** 与 lib/deploy/tunnel.js 保持一致；周期探测不能因为一处改名就静默变绿。 */
export const UNIT_NAME = 'dsh-remote-panel-tunnel.service'

/** 证书剩余不足 2 小时视为异常（Let's Encrypt 提前 30 天续，正常远高于此）。 */
export const CERT_WARN_HOURS = 2

const run = (cmd, args) =>
	new Promise((resolve) => {
		execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
			resolve({ ok: error === null, out: String(stdout ?? '').trim(), error })
		})
	})

/**
 * @param {string} [unit]
 * @returns {Promise<{ok:boolean, state:string, reason?:string}>}
 */
export async function unitState(unit = UNIT_NAME, exec = run) {
	const result = await exec('systemctl', ['--user', 'is-active', unit])
	const state = result.out === '' ? 'unknown' : result.out
	return { ok: state === 'active', state }
}

function sanCovers(san, host) {
	if (typeof san !== 'string' || san === '') return false
	for (const entry of san.split(/,\s*/)) {
		const value = entry.replace(/^DNS:/i, '').replace(/^IP Address:/i, '').trim().toLowerCase()
		if (value === '') continue
		if (value === host) return true
		if (value.startsWith('*.')) {
			const suffix = value.slice(1)
			if (host.endsWith(suffix) && host.slice(0, -suffix.length).includes('.') === false) return true
		}
	}
	return false
}

/**
 * 对域名做一次真实 TLS 握手，按浏览器同样的信任链校验。
 *
 * @param {{host:string, port?:number, timeoutMs?:number, now?:number, warnHours?:number}} options
 */
export function probeCertificate({ host, port = 443, timeoutMs = 4000, now = Date.now(), warnHours = CERT_WARN_HOURS }) {
	return new Promise((resolve) => {
		const socket = tlsConnect(
			{
				host,
				port,
				servername: host,
				// 浏览器会校验证书链；这里必须同样严格，否则「证书没装好」会被探活掩盖
				rejectUnauthorized: true,
				timeout: timeoutMs,
			},
			() => {
				const cert = socket.getPeerCertificate() ?? {}
				socket.end()
				const expiresAt = cert.valid_to ? new Date(cert.valid_to) : null
				const hoursLeft = expiresAt === null ? null : Math.round(((expiresAt.getTime() - now) / 3600000) * 10) / 10
				const san = cert.subjectaltname ?? ''
				const covered = sanCovers(san, host)
				const ok = covered && hoursLeft !== null && hoursLeft > warnHours
				resolve({
					ok,
					host,
					expiresAt: expiresAt === null ? null : expiresAt.toISOString(),
					hoursLeft,
					subject: cert.subject?.CN ?? '',
					san,
					issuer: cert.issuer?.O ?? '',
					reason: ok ? undefined : !covered ? `证书 SAN 不覆盖 ${host}` : `证书剩余不足 ${warnHours} 小时`,
				})
			},
		)
		socket.once('timeout', () => {
			socket.destroy()
			resolve({ ok: false, host, hoursLeft: null, reason: `TLS 握手超时（${timeoutMs}ms）` })
		})
		socket.once('error', (error) => {
			resolve({ ok: false, host, hoursLeft: null, reason: `TLS 握手失败：${error.message}` })
		})
	})
}

/** 中继边缘的门禁：不带 cookie 必须 401 且给出 `access key required`。 */
export function probeGate({ hostname, gateKey, timeoutMs = 4000, scheme = 'https' }) {
	return new Promise((resolve) => {
		const req = httpsRequest(
			{
				host: hostname,
				port: 443,
				path: '/',
				method: 'GET',
				headers: { accept: 'text/plain' },
				timeout: timeoutMs,
			},
			(res) => {
				let body = ''
				res.setEncoding('utf8')
				res.on('data', (chunk) => {
					body += chunk
				})
				res.on('end', () => {
					const text = body.trim()
					const required = res.statusCode === 401 && text.includes('access key required')
					// 口令本身不打印；只确认「没带口令时确实被挡住」
					const gateKeyOk = typeof gateKey === 'string' && gateKey.length >= 16
					resolve({
						ok: required && gateKeyOk,
						status: res.statusCode ?? 0,
						reason: required
							? gateKeyOk
								? undefined
								: '门禁口令缺失'
							: `未带口令应返回 401，实际 ${res.statusCode ?? 0}`,
					})
				})
			},
		)
		req.once('timeout', () => {
			req.destroy()
			resolve({ ok: false, status: 0, reason: `门禁探测超时（${timeoutMs}ms）` })
		})
		req.once('error', (error) => resolve({ ok: false, status: 0, reason: `门禁探测失败：${error.message}` }))
		req.end()
	})
}

/** 本机 DSH：未认证应返回 401 且带特征文案。 */
export function upstreamCheck(port = 3080, timeoutMs = 2000) {
	return new Promise((resolve) => {
		const req = httpRequest(
			{ host: '127.0.0.1', port, path: '/', method: 'GET', timeout: timeoutMs },
			(res) => {
				let body = ''
				res.setEncoding('utf8')
				res.on('data', (chunk) => {
					body += chunk
				})
				res.on('end', () => {
					const text = body.slice(0, 300)
					const ok = res.statusCode === 401 && text.includes('dsh web authentication required')
					resolve({ ok, status: res.statusCode ?? 0 })
				})
			},
		)
		req.once('timeout', () => {
			req.destroy()
			resolve({ ok: false, status: 0, reason: 'DSH 未应答（2s 超时）' })
		})
		req.once('error', (error) => resolve({ ok: false, status: 0, reason: error.message }))
		req.end()
	})
}

/**
 * 手机壳安装包 + 版本清单。边缘直接读 `lib/assets/`，所以这里也读同一份。
 * @param {string} [dir]
 */
export function readApkAssets(dir = new URL('./assets/', import.meta.url).pathname) {
	try {
		const version = JSON.parse(readFileSync(`${dir}version.json`, 'utf8'))
		const apk = statSync(`${dir}app.apk`)
		return {
			ok: apk.size === Number(version.size),
			versionCode: Number(version.versionCode ?? 0),
			versionName: String(version.versionName ?? ''),
			size: apk.size,
			sha256: String(version.sha256 ?? ''),
			reason: apk.size === Number(version.size) ? undefined : `app.apk 大小 ${apk.size} 与清单 ${version.size} 不一致`,
		}
	} catch (error) {
		return { ok: false, reason: `缺少手机壳资源：${error instanceof Error ? error.message : String(error)}` }
	}
}

/**
 * @param {object|null} state
 * @param {{
 *   exec?: Function, cert?: Function, gate?: Function, upstream?: Function, apk?: Function,
 * }} [deps]
 */
export async function probe(state, deps = {}) {
	if (state === null) {
		const missing = { ok: false, reason: '未部署' }
		return { ok: false, agent: missing, cert: missing, gate: missing, upstream: missing, apk: missing }
	}
	const upstreamPort = Number.isInteger(Number(state.upstream)) ? Number(state.upstream) : 3080
	const [agent, cert, gate, upstream, apk] = await Promise.all([
		(deps.exec ? (unit = UNIT_NAME) => unitState(unit, deps.exec) : unitState)(),
		(deps.cert ?? probeCertificate)({ host: state.hostname, port: state.port ?? 443 }),
		(deps.gate ?? probeGate)({ hostname: state.hostname, gateKey: state.accessKey }),
		(deps.upstream ?? upstreamCheck)(upstreamPort),
		Promise.resolve((deps.apk ?? readApkAssets)()),
	])
	// 手机壳不是连通性的一环，缺包不应该把整条链路判红
	const ok = agent.ok && cert.ok && gate.ok && upstream.ok
	return { ok, agent, cert, gate, upstream, apk }
}

/** 最近一次 /probe 的证书结果缓存，供 /status 秒回。 */
let lastCert = null

export function rememberCert(result) {
	lastCert = result?.cert ?? null
}

export function lastCertSnapshot() {
	return lastCert
}
