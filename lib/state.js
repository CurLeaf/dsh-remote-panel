/**
 * 部署状态：唯一真源是 tunnel agent 的配置 `~/.config/dsh-tunnel/agent.json`。
 *
 * 旧版（EasyTier + Caddy）的 `~/.dsh/remote-panel.json` 回填码/审计日志已经移除：
 * 面板不再保存第二份部署记录，避免「面板显示一个地址、agent 实际连另一个」。
 */

import { statSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** agent 配置路径；测试用 `home` 注入。 */
export function agentConfigPath(home = process.env.HOME ?? homedir()) {
	return join(home, '.config', 'dsh-tunnel', 'agent.json')
}

/**
 * 读取 tunnel agent 配置；不存在或损坏返回 null（面板显示「未部署」）。
 * @param {string} [home]
 * @returns {null | {relayUrl:string, hostname:string, gateKey:string, targetPort:number, consoleUrl:string, configuration:string}}
 */
export function readAgentConfig(home) {
	const path = agentConfigPath(home)
	let raw
	try {
		raw = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return null
	}
	if (raw === null || typeof raw !== 'object') return null
	const hostname = String(raw.hostname ?? '').trim().toLowerCase()
	const gateKey = String(raw.gateKey ?? '').trim()
	const relayUrl = String(raw.relayUrl ?? '').trim()
	if (hostname === '' || gateKey === '' || relayUrl === '') return null
	return {
		relayUrl,
		hostname,
		gateKey,
		targetPort: Number.isInteger(Number(raw.targetPort)) ? Number(raw.targetPort) : 3080,
		consoleUrl: String(raw.consoleUrl ?? '').trim(),
		configuration: path,
	}
}

/**
 * 面板状态。`null` 表示还没部署。
 *
 * 对外字段与旧版保持同名（hostname/port/upstream/accessKey），但语义已经不同：
 * port 固定 443（中继 HTTPS），ip 字段不再存在 —— 旧版手写的 IPv4 早已废弃。
 *
 * @param {string} [home]
 */
export function readState(home) {
	const config = readAgentConfig(home)
	if (config === null) return null
	let deployedAt = null
	try {
		deployedAt = statSync(agentConfigPath(home)).mtimeMs
	} catch {
		/* 读不到 mtime 不影响使用 */
	}
	return {
		provider: 'dsh-tunnel',
		hostname: config.hostname,
		port: 443,
		accessKey: config.gateKey,
		upstream: config.targetPort,
		relayUrl: config.relayUrl,
		consoleUrl: config.consoleUrl,
		deployedAt,
	}
}

/** 去掉门禁口令：口令只通过 /pair 拼好的链接与 /defaults 的表单出现。 */
export function publicState(state) {
	if (state === null) return null
	const { accessKey, ...rest } = state
	return rest
}
