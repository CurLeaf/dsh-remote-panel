#!/usr/bin/env node
/**
 * 一条命令跑完 tunnel 的验收：结构 → 健康 → 协议 → 会话列表 → 稳定性 → 重启恢复。
 *
 *   npm run tunnel:accept
 *   HOSTNAME_OVERRIDE=... npm run tunnel:accept      # 懒得读配置时直接指定
 *
 * 参数默认从 ~/.config/dsh-tunnel/agent.json 读（tunnel:install 写的），
 * 所以装过就能直接跑。门槛是门禁口令——脚本自己用它换 Cookie，不需要人工准备。
 *
 * 退出码 0 = 全过；1 = 有用例失败。
 */

import http from 'node:http'
import https from 'node:https'
import http2 from 'node:http2'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'

const HOME = process.env.HOME || homedir()
const CONFIG = join(HOME, '.config', 'dsh-tunnel', 'agent.json')
const UNIT = 'dsh-remote-panel-tunnel.service'
const TIMEOUT = Number(process.env.TIMEOUT || 40000)

const results = []
function ok(name, extra = '') { results.push(['PASS', name, extra]) }
function bad(name, why) { results.push(['FAIL', name, why]) }

function sh(cmd, args) {
	try {
		return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
	} catch (e) {
		return { ok: false, out: String(e.stderr || e.stdout || e.message).trim() }
	}
}

function loadConfig() {
	const fallback = { hostname: process.env.HOSTNAME_OVERRIDE || '', gateKey: process.env.GATE_KEY || '', relayUrl: '' }
	if (!existsSync(CONFIG)) return fallback
	try {
		const parsed = JSON.parse(readFileSync(CONFIG, 'utf8'))
		return { ...fallback, ...parsed }
	} catch {
		return fallback
	}
}

const cfg = loadConfig()
const HOST = cfg.hostname
if (!HOST || !cfg.gateKey) {
	console.error(`缺少配置：${CONFIG} 里没有 hostname/gateKey，先跑 npm run tunnel:install`)
	process.exit(2)
}
const BASE = `https://${HOST}/`

// ---------------------------------------------------------------- HTTP
function request(path, { cookie, method = 'GET', body, stream = false, headers: extra = {} } = {}) {
	return new Promise((resolve, reject) => {
		const req = https.request({
			host: HOST, port: 443, path, method, servername: HOST, rejectUnauthorized: false,
			headers: {
				host: HOST,
				'user-agent': 'tunnel-accept',
				'accept-encoding': 'br, gzip',
				...(cookie ? { cookie } : {}),
				...(body !== undefined ? { 'content-type': 'application/json' } : {}),
				...extra,
			},
			timeout: TIMEOUT,
		}, (res) => {
			if (stream) { resolve({ status: res.statusCode, headers: res.headers, res }); return }
			const chunks = []
			res.on('data', (c) => chunks.push(c))
			res.on('end', () => {
				let buf = Buffer.concat(chunks)
				const enc = String(res.headers['content-encoding'] || '').toLowerCase()
				try {
					if (enc === 'br') buf = zlib.brotliDecompressSync(buf)
					else if (enc === 'gzip') buf = zlib.gunzipSync(buf)
					else if (enc === 'deflate') buf = zlib.inflateSync(buf)
				} catch { /* 保持原始字节，交给断言去报 */ }
				resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8'), raw: buf })
			})
		})
		req.on('timeout', () => req.destroy(new Error('timeout')))
		req.on('error', reject)
		req.end(body)
	})
}

async function follow(path, cookie, hops = 0) {
	const r = await request(path, { cookie })
	const sc = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0])
	const merged = [cookie, ...sc].filter(Boolean).join('; ')
	const loc = r.headers.location
	if (loc && r.status >= 300 && r.status < 400 && hops < 5) {
		const next = new URL(loc, BASE)
		return follow(next.pathname + next.search, merged, hops + 1)
	}
	return { ...r, cookie: merged }
}

// ---------------------------------------------------------------- 1. 结构
function checkStructure() {
	const tunnelSrc = join(HOME, 'WorkSpace', 'dsh-tunnel', 'src')
	if (existsSync(tunnelSrc)) {
		const files = sh('ls', [tunnelSrc]).out.split('\n')
		const stale = ['agent.mjs', 'edge.mjs'].filter((f) => files.includes(f))
		if (stale.length === 0) ok('中继仓不再持有 agent', `${files.length} 个文件，全是中继侧`)
		else bad('中继仓不再持有 agent', `仍有 ${stale.join(', ')}`)
	}

	const pluginTunnel = join(HOME, 'WorkSpace', 'dsh-remote-panel', 'lib', 'tunnel')
	const need = ['agent.mjs', 'edge.mjs', 'archive.mjs', 'config.mjs', 'protocol.mjs']
	const missing = need.filter((f) => !existsSync(join(pluginTunnel, f)))
	if (missing.length === 0) ok('插件内 agent 源码完整', need.join(' '))
	else bad('插件内 agent 源码完整', `缺 ${missing.join(', ')}`)

	const unit = sh('systemctl', ['--user', 'cat', UNIT])
	const exec = (unit.out.split('\n').find((l) => l.startsWith('ExecStart=')) || '')
	if (/dsh-remote-panel[\\/]lib[\\/]tunnel[\\/]agent\.mjs/.test(exec)) ok('单元指向插件内 agent')
	else bad('单元指向插件内 agent', exec || '(没有 ExecStart)')

	const units = sh('systemctl', ['--user', 'list-units', '--type=service', '--all', '--no-legend']).out
	const oldOnes = units.split('\n').filter((l) => /dsh-tunnel-agent/.test(l) && /loaded/.test(l))
	if (oldOnes.length === 0) ok('旧单元已消失')
	else bad('旧单元已消失', oldOnes[0].trim())

	const health = sh('systemctl', ['--user', 'show', UNIT, '-p', 'ActiveState', '-p', 'NRestarts', '--value']).out.split('\n')
	if (health[0] === 'active') ok('单元 active', `NRestarts=${health[1]}`)
	else bad('单元 active', health.join(' '))
	if (health[1] === '0') ok('自部署以来没有崩溃重启')
	else bad('自部署以来没有崩溃重启', `NRestarts=${health[1]}`)
}

// ---------------------------------------------------------------- 2. 协议与功能
async function checkProtocol() {
	let cookie = ''

	const r401 = await request('/')
	if (r401.status === 401) ok('门禁：无口令 401')
	else bad('门禁：无口令 401', `实得 ${r401.status}`)

	const rk = await request(`/?k=${encodeURIComponent(cfg.gateKey)}`)
	const setCookie = (rk.headers['set-cookie'] || []).join('; ')
	if (rk.status === 303 && setCookie.includes('dsh_gate=')) ok('口令换 Cookie')
	else bad('口令换 Cookie', `${rk.status} / ${setCookie.slice(0, 40)}`)

	const home = await follow('/', (rk.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '))
	cookie = home.cookie || ''
	if (home.status === 200 && /DeepSeek Harness/i.test(home.body)) ok('首页 200', `${home.body.length} 字节`)
	else bad('首页 200', `${home.status}`)

	const h2 = await new Promise((resolve, reject) => {
		const client = http2.connect(BASE, { servername: HOST, rejectUnauthorized: false })
		client.on('error', reject)
		const req = client.request({ ':path': '/', ':method': 'GET', ':authority': HOST, cookie, accept: 'text/html' })
		let status = 0
		let bytes = 0
		req.on('response', (h) => { status = h[':status'] })
		req.on('data', (c) => { bytes += c.length })
		req.on('end', () => { client.close(); resolve({ status, bytes }) })
		req.on('error', (e) => { client.close(); reject(e) })
		req.end()
	})
	if (h2.status === 200 && h2.bytes > 1000) ok('HTTP/2 协商', `${h2.bytes} 字节`)
	else bad('HTTP/2 协商', `${h2.status} / ${h2.bytes}`)

	const asset = await request('/assets/index-BXV-oxvX.js', { cookie })
	if (/immutable/.test(String(asset.headers['cache-control'] || ''))) ok('静态资源 immutable')
	else bad('静态资源 immutable', String(asset.headers['cache-control']))

	const g1 = await request('/dsh-genui/runtime.js', { cookie })
	const etag = String(g1.headers.etag || '')
	if (etag === '') bad('genui 强 ETag', '没有 ETag')
	else {
		const g2 = await request('/dsh-genui/runtime.js', { cookie, headers: { 'if-none-match': etag } })
		if (g2.status === 304) ok('genui 条件请求 304', etag.slice(0, 16) + '…')
		else bad('genui 条件请求 304', `实得 ${g2.status}`)
	}

	try {
		const r = await request('/plugins/events', { cookie, stream: true })
		r.res.on('error', () => {})
		const got = await new Promise((resolve) => {
			let bytes = 0
			const t = setTimeout(() => { r.res.destroy(); resolve(bytes) }, 4000)
			r.res.on('data', (c) => { bytes += c.length; if (bytes > 8) { clearTimeout(t); r.res.destroy(); resolve(bytes) } })
			r.res.on('error', () => { clearTimeout(t); resolve(bytes) })
		})
		if (got > 0) ok('SSE 流式转发', `${got} 字节`)
		else bad('SSE 流式转发', '4 秒内没有字节')
	} catch (e) { bad('SSE 流式转发', e.message) }

	try {
		await new Promise((resolve, reject) => {
			const ws = new WebSocket(`wss://${HOST}/api/remote.mux`, {
				headers: { host: HOST, cookie, origin: BASE }, rejectUnauthorized: false, handshakeTimeout: TIMEOUT,
			})
			const t = setTimeout(() => { try { ws.terminate() } catch {} ; reject(new Error('10s 没连上')) }, 10000)
			ws.on('open', () => { clearTimeout(t); try { ws.close() } catch {} ; resolve() })
			ws.on('error', (e) => { clearTimeout(t); reject(e) })
		})
		ok('WebSocket 升级')
	} catch (e) { bad('WebSocket 升级', e.message) }

	return cookie
}

// ---------------------------------------------------------------- 3. 会话列表
async function checkSessionList(cookie) {
	const body = JSON.stringify({ type: 'client-request', rpcId: 'accept', method: 'session/list', payload: { args: { _request: {} } } })
	const [edge, direct] = await Promise.all([
		request('/api/session/list', { cookie, method: 'POST', body }),
		new Promise((resolve, reject) => {
			const req = http.request({
				host: '127.0.0.1', port: 3080, path: '/api/session/list', method: 'POST',
				headers: { host: HOST, cookie, 'content-type': 'application/json', 'accept-encoding': 'identity' },
			}, (res) => {
				res.resume()
				res.on('end', () => resolve({ status: res.statusCode }))
			})
			req.on('error', reject)
			req.end(body)
		}).then((r) => r.status),
	])
	if (edge.status !== 200) { bad('会话列表可用', `status=${edge.status}`); return }
	let items = []
	try { items = JSON.parse(edge.body)?.result?.value?.items ?? [] } catch { /* 交给下面断言 */ }

	const archived = new Set()
	try {
		const ws = JSON.parse(readFileSync(join(HOME, '.dsh', 'storages', 'workspace.json'), 'utf8'))
		for (const id of ws?.global?.archivedSessionIds ?? []) archived.add(id)
	} catch { /* 没有归档文件就不校验这条 */ }

	const leaked = archived.size > 0 ? items.filter((i) => archived.has(i.sessionId)) : []
	if (items.length > 0 && leaked.length === 0) ok('会话列表剔除归档', `${items.length} 条，归档 ${archived.size} 条未漏出`)
	else bad('会话列表剔除归档', `items=${items.length} 漏出=${leaked.length}`)

	const kb = Buffer.byteLength(JSON.stringify(JSON.parse(edge.body))) / 1024
	if (kb < 400) ok('会话列表体积', `${kb.toFixed(0)}KB（未裁剪时约 1600KB）`)
	else bad('会话列表体积', `${kb.toFixed(0)}KB，裁剪可能没生效`)

	if (direct === 200) ok('上游本身可用', '直连 DSH 200')
	else bad('上游本身可用', `直连返回 ${direct}`)
}

// ---------------------------------------------------------------- 4. 稳定性
async function checkStability(cookie) {
	const burst = await Promise.all(Array.from({ length: 12 }, () => request('/', { cookie }).catch((e) => ({ status: 'ERR:' + e.message }))))
	const good = burst.filter((r) => r.status === 200).length
	if (good === burst.length) ok('并发 12 条', `${good}/${burst.length}`)
	else bad('并发 12 条', `${good}/${burst.length}`)

	// 中途取消 3 条大响应，模拟手机切后台 / 划走页面
	for (let i = 0; i < 3; i += 1) {
		await new Promise((resolve) => {
			const req = https.request({ host: HOST, port: 443, path: '/dsh-genui/runtime.js', servername: HOST, rejectUnauthorized: false, headers: { host: HOST, cookie } }, (res) => {
				res.on('error', () => {})
				res.destroy()
				resolve()
			})
			req.on('error', () => resolve())
			setTimeout(() => { req.destroy(); resolve() }, 250)
			req.end()
		})
	}
	const after = await request('/', { cookie })
	if (after.status === 200) ok('中途取消后仍可用', '3 次取消后首页 200')
	else bad('中途取消后仍可用', `${after.status}`)

	const restarts = sh('systemctl', ['--user', 'show', UNIT, '-p', 'NRestarts', '--value']).out
	if (restarts === '0') ok('压力后没有崩溃重启')
	else bad('压力后没有崩溃重启', `NRestarts=${restarts}`)
}

// ---------------------------------------------------------------- 5. 重启恢复
async function checkRestart() {
	const before = sh('systemctl', ['--user', 'show', UNIT, '-p', 'NRestarts', '--value']).out
	sh('systemctl', ['--user', 'restart', UNIT])
	let recovered = 0
	const t0 = Date.now()
	for (let i = 0; i < 30; i += 1) {
		await new Promise((r) => setTimeout(r, 1000))
		try {
			const r = await request('/')
			if (r.status === 401) { recovered = Date.now() - t0; break }
		} catch { /* 还没起来 */ }
	}
	if (recovered > 0) ok('重启恢复', `${(recovered / 1000).toFixed(1)}s 后门禁重新应答`)
	else bad('重启恢复', '30s 内没恢复')

	const after = sh('systemctl', ['--user', 'show', UNIT, '-p', 'NRestarts', '--value']).out
	if (after === '0') ok('重启后无异常重启')
	else bad('重启后无异常重启', `NRestarts=${after}（重启前 ${before}）`)
}

// 测试脚手架：任何漏网的 socket 错误都算失败，而不是打成一段看不懂的栈
process.on('uncaughtException', (e) => {
	console.error(`\n验收中断：${e.message}`)
	process.exit(1)
})

// ---------------------------------------------------------------- main
const step = (name) => process.stderr.write(`· ${name}\n`)
step('结构')
checkStructure()
step('协议与功能')
const cookie = await checkProtocol()
step('会话列表')
await checkSessionList(cookie)
step('稳定性')
await checkStability(cookie)
step('重启恢复')
await checkRestart()

const width = results.reduce((n, [s, name]) => Math.max(n, name.length), 0)
console.log('')
for (const [s, name, extra] of results) {
	console.log(`  ${s === 'PASS' ? '✅' : '❌'} ${name.padEnd(width)}  ${extra}`)
}
const failed = results.filter(([s]) => s === 'FAIL').length
console.log(`\n  ${results.length - failed} 通过 / ${failed} 失败\n`)
process.exit(failed === 0 ? 0 : 1)
