/**
 * 控制面的纯逻辑：请求体读取、口令生成、部署默认值。
 * 与 HTTP 服务解耦，方便单测。
 */

import { randomBytes } from 'node:crypto'

import { renderTunnel } from './deploy/tunnel.js'
import { readAgentConfig } from './state.js'
import { VERSION } from './version.js'

/** 客户端输入有问题（回 400，而不是 500）。 */
export class BadRequest extends Error {}

const MAX_BODY_BYTES = 64 * 1024

/**
 * 读取并解析 JSON 请求体。
 * @param {AsyncIterable<Buffer|string>} req
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJson(req) {
	const chunks = []
	let size = 0
	for await (const chunk of req) {
		const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
		size += buffer.length
		if (size > MAX_BODY_BYTES) throw new BadRequest('请求体过大')
		chunks.push(buffer)
	}
	if (size === 0) throw new BadRequest('请求体为空')
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new BadRequest('请求体必须是 JSON 对象')
		}
		return parsed
	} catch (error) {
		if (error instanceof BadRequest) throw error
		throw new BadRequest(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)
	}
}

/** 生成门禁口令（base64url，去掉 =），长度落在 16~128 的校验区间内。 */
export function suggestToken(length = 32) {
	return randomBytes(48).toString('base64url').replace(/=+$/, '').slice(0, length)
}

/**
 * 向导默认值：已部署过就沿用现有配置，避免升级时把域名/口令改掉。
 */
export function defaults() {
	const config = readAgentConfig()
	return {
		ok: true,
		version: VERSION,
		relayUrl: config?.relayUrl ?? '',
		hostname: config?.hostname ?? '',
		gateKey: config?.gateKey ?? suggestToken(32),
		targetPort: config?.targetPort ?? 3080,
		consoleUrl: config?.consoleUrl ?? '',
		nodeBin: process.execPath,
	}
}

/**
 * 渲染 tunnel 安装脚本。
 * @param {Record<string, unknown>} body
 */
export function renderDeploy(body) {
	try {
		return { ok: true, ...renderTunnel(body) }
	} catch (error) {
		throw new BadRequest(error instanceof Error ? error.message : String(error))
	}
}
