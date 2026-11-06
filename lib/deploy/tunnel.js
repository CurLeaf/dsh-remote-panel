/**
 * tunnel provider 的部署产物渲染。
 *
 * 与 Caddy/EasyTier 那条 provider 并列：这里生成的是「Host 侧 agent + 用户级 systemd 单元」。
 * agent 源码就在本插件的 lib/tunnel/ 下，所以**升级=升级插件**，不存在第二份代码。
 *
 * 纯函数、无 I/O：模板在模块加载时读一次，便于单测。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fill, template } from './render.js'
import { VERSION } from '../version.js'

/** 本插件根目录（lib/deploy/tunnel.js → 插件根）。 */
export const PLUGIN_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
/** agent 入口：单元里的 ExecStart 直接指到这里。 */
export const AGENT_PATH = join(PLUGIN_DIR, 'lib', 'tunnel', 'agent.mjs')
/** 单元名刻意与旧的 dsh-tunnel-agent.service 不同：改名即杜绝「两台 agent 同时连中继」。 */
export const UNIT_NAME = 'dsh-remote-panel-tunnel.service'

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const GATE_KEY = /^[A-Za-z0-9_-]{16,128}$/

function required(value, label) {
	if (value === undefined || value === null || String(value).trim() === '') {
		throw new Error(`tunnel 部署缺少 ${label}`)
	}
	return String(value).trim()
}

function portOf(value, label) {
	const n = Number(value)
	if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${label} 不是合法端口：${String(value)}`)
	return n
}

/**
 * 校验并补默认值。
 * @param {Record<string, unknown>} raw
 * @returns {{relayUrl:string, hostname:string, gateKey:string, targetPort:number,
 *   consoleUrl:string, certSyncHost:string, nodeBin:string, version:string}}
 */
export function normalizeTunnelInput(raw = {}) {
	const relayUrl = required(raw.relayUrl, '中继地址 RELAY_URL')
	let url
	try {
		url = new URL(relayUrl)
	} catch {
		throw new Error(`RELAY_URL 不是合法 URL：${relayUrl}`)
	}
	if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
		throw new Error(`RELAY_URL 协议必须是 ws/wss：${relayUrl}`)
	}

	const hostname = required(raw.hostname, '对外域名 HOSTNAME').toLowerCase()
	if (!DOMAIN.test(hostname)) throw new Error(`HOSTNAME 不是合法域名：${hostname}`)

	const gateKey = required(raw.gateKey, '门禁口令 GATE_KEY')
	if (!GATE_KEY.test(gateKey)) throw new Error('GATE_KEY 只允许字母数字下划线短横线，长度 16~128')

	const consoleUrl = String(raw.consoleUrl ?? '').trim()
	if (consoleUrl !== '' && !/^https?:\/\//.test(consoleUrl)) {
		throw new Error(`CONSOLE_URL 必须是 http(s) 地址：${consoleUrl}`)
	}

	const certSyncHost = String(raw.certSyncHost ?? hostname).toLowerCase()
	if (!DOMAIN.test(certSyncHost)) throw new Error(`CERT_SYNC_HOST 不是合法域名：${certSyncHost}`)

	const nodeBin = required(raw.nodeBin, 'node 可执行文件路径 NODE_BIN')
	if (!nodeBin.startsWith('/')) throw new Error(`NODE_BIN 必须是绝对路径：${nodeBin}`)

	return {
		relayUrl,
		hostname,
		gateKey,
		targetPort: portOf(raw.targetPort ?? 3080, 'TARGET_PORT'),
		consoleUrl,
		certSyncHost,
		nodeBin,
		version: String(raw.version ?? VERSION),
	}
}

/**
 * 渲染单元文件与安装脚本。
 * @param {Record<string, unknown>} raw
 */
export function renderTunnel(raw = {}) {
	const input = normalizeTunnelInput(raw)

	const unit = fill(template('tunnel-agent.service.tmpl'), {
		RELAY_URL: input.relayUrl,
		TARGET_PORT: input.targetPort,
		HOSTNAME: input.hostname,
		GATE_KEY: input.gateKey,
		CERT_SYNC_HOST: input.certSyncHost,
		CONSOLE_URL: input.consoleUrl,
		NODE_BIN: input.nodeBin,
		AGENT_PATH: AGENT_PATH,
	})

	const install = fill(template('tunnel-install.sh.tmpl'), {
		VERSION: input.version,
		UNIT_NAME,
		UNIT_BODY: unit.trimEnd(),
		PUBLIC_URL: `https://${input.hostname}/`,
	})

	return {
		files: {
			[`~/.config/systemd/user/${UNIT_NAME}`]: unit,
		},
		install,
		summary: {
			provider: 'dsh-tunnel',
			unitName: UNIT_NAME,
			agentPath: AGENT_PATH,
			urls: {
				public: `https://${input.hostname}/`,
				gate: `https://${input.hostname}/?k=${input.gateKey}`,
			},
			relayUrl: input.relayUrl,
			targetPort: input.targetPort,
		},
	}
}
