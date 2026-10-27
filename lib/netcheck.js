/**
 * 候选虚拟 IP 是否已被占用。
 *
 * 用 ping 而不是解析 easytier-cli 的表格：后者是给人看的文本，格式一变就崩；
 * ping 只回答一个问题「这个地址现在有没有人」，且不依赖 EasyTier 是否已部署。
 * 不可达有两种可能（真的空闲 / 本机没有路由到该网段），因此只作为「提示」而非阻断。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

/**
 * @param {string} ip
 * @returns {string}
 */
export function assertIpv4(ip) {
	const value = String(ip ?? '').trim()
	if (!IPV4.test(value)) throw new Error(`不是合法 IPv4：${value}`)
	return value
}

/**
 * @param {string} ip
 * @param {{ exec?: typeof run }} [deps]
 * @returns {Promise<{ip:string, reachable:boolean, detail:string}>}
 */
export async function pingHost(ip, deps = {}) {
	const target = assertIpv4(ip)
	const exec = deps.exec ?? run
	try {
		await exec('ping', ['-c', '1', '-W', '1', target], { timeout: 2000 })
		return { ip: target, reachable: true, detail: '有主机应答' }
	} catch (error) {
		const code = error?.code
		if (code === 'ENOENT') return { ip: target, reachable: false, detail: '本机未安装 ping，无法判断' }
		return { ip: target, reachable: false, detail: '无应答（可能是空闲，也可能本机没有到该网段的路由）' }
	}
}
