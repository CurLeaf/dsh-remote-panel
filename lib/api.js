/**
 * 控制面的纯逻辑：请求体读取、默认值探测、口令生成。
 * 与 HTTP 服务解耦，方便单测。
 */

import { randomBytes } from 'node:crypto'
import { homedir, networkInterfaces, userInfo } from 'node:os'

import { renderDeploy } from './deploy/render.js'

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

/** 取第一个非回环 IPv4 的 CIDR 作为局域网白名单；探测不到时给常见默认值。 */
export function detectLanCidr() {
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family === 'IPv4' && !entry.internal && entry.cidr !== null) return entry.cidr
		}
	}
	return '192.168.1.0/24'
}

/** 生成符合服务端校验的随机口令（base64url，去掉 =）。 */
export function suggestToken(length = 24) {
	return randomBytes(48).toString('base64url').replace(/=+$/, '').slice(0, length)
}

/** 向导打开时的默认值。 */
export function defaults(version) {
	return {
		ok: true,
		version,
		user: userInfo().username,
		home: homedir(),
		port: 8710,
		upstreamPort: 3080,
		lanCidr: detectLanCidr(),
		etVersion: '2.6.4',
		accessKey: suggestToken(24),
		networkSecret: suggestToken(32),
		networkName: 'dsh-remote',
	}
}

/**
 * 渲染向导结果。
 * @param {Record<string, unknown>} body
 * @param {string} version
 */
export function render(body, version) {
	try {
		const result = renderDeploy({ ...body, version })
		return { ok: true, ...result }
	} catch (error) {
		throw new BadRequest(error instanceof Error ? error.message : String(error))
	}
}
