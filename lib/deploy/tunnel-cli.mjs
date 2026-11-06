#!/usr/bin/env node
/**
 * tunnel provider 的安装 / 状态 CLI。
 *
 *   node lib/deploy/tunnel-cli.mjs install    # 写单元、装/升级、重启、自检
 *   node lib/deploy/tunnel-cli.mjs status     # 单元状态 + 最近日志 + 公网探活
 *   node lib/deploy/tunnel-cli.mjs print      # 只渲染，不落盘
 *
 * 第一次 install 用环境变量给参数（RELAY_URL / TUNNEL_HOSTNAME / GATE_KEY ...），
 * 之后参数落到 ~/.config/dsh-tunnel/agent.json（0600），再执行就不需要再传。
 * 升级插件后重跑 install 即可——agent 代码跟着插件走，没有第二份。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { renderTunnel, UNIT_NAME } from './tunnel.js'

const HOME = process.env.HOME || homedir()
const CONFIG_PATH = join(HOME, '.config', 'dsh-tunnel', 'agent.json')
const UNIT_PATH = join(HOME, '.config', 'systemd', 'user', UNIT_NAME)

function sh(cmd, args, { quiet = false } = {}) {
	try {
		const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'] })
		return { ok: true, out: out.trim() }
	} catch (e) {
		return { ok: false, out: String(e.stderr || e.stdout || e.message).trim() }
	}
}

function readConfigFile() {
	if (!existsSync(CONFIG_PATH)) return {}
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
	} catch (e) {
		throw new Error(`配置文件损坏：${CONFIG_PATH}（${e.message}）`)
	}
}

/** 环境变量优先，其次配置文件。 */
function collectInput(stored) {
	return {
		relayUrl: process.env.RELAY_URL || stored.relayUrl,
		hostname: process.env.TUNNEL_HOSTNAME || process.env.TUNNEL_HOSTNAMES || stored.hostname,
		gateKey: process.env.GATE_KEY || stored.gateKey,
		targetPort: process.env.TARGET_PORT || stored.targetPort || 3080,
		consoleUrl: process.env.CONSOLE_URL || stored.consoleUrl || '',
		certSyncHost: process.env.CERT_SYNC_HOST || stored.certSyncHost,
		nodeBin: process.env.NODE_BIN || stored.nodeBin || process.execPath,
	}
}

function install() {
	const stored = readConfigFile()
	const input = collectInput(stored)
	const rendered = renderTunnel(input)

	mkdirSync(join(HOME, '.config', 'systemd', 'user'), { recursive: true })
	mkdirSync(join(HOME, '.config', 'dsh-tunnel'), { recursive: true, mode: 0o700 })
	writeFileSync(UNIT_PATH, rendered.files[`~/.config/systemd/user/${UNIT_NAME}`], { mode: 0o644 })
	writeFileSync(CONFIG_PATH, JSON.stringify({ ...input, savedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 })

	for (const step of [
		['daemon-reload', []],
		['enable', [UNIT_NAME]],
		['restart', [UNIT_NAME]],
	]) {
		const r = sh('systemctl', ['--user', step[0], ...step[1]])
		if (!r.ok) throw new Error(`systemctl --user ${step[0]} 失败：${r.out}`)
	}

	// 等进程真的起来（agent 起来后还要连中继，先只判 active）
	let active = false
	for (let i = 0; i < 20; i += 1) {
		active = sh('systemctl', ['--user', 'is-active', '--quiet', UNIT_NAME], { quiet: true }).ok
		if (active) break
		execFileSync('sleep', ['0.5'])
	}

	console.log(`单元：${UNIT_PATH}`)
	console.log(`agent：${rendered.summary.agentPath}`)
	console.log(`状态：${active ? 'active' : '未进入 active，见下方日志'}`)
	console.log(`入口：${rendered.summary.urls.public}`)
	console.log(`门禁：${rendered.summary.urls.gate}`)
	const logs = sh('journalctl', ['--user', '-u', UNIT_NAME, '-n', '10', '--no-pager'], { quiet: true })
	if (logs.out !== '') console.log(`\n--- 最近日志\n${logs.out}`)
	if (!active) process.exitCode = 1
}

async function status() {
	const active = sh('systemctl', ['--user', 'is-active', UNIT_NAME], { quiet: true })
	console.log(`单元 ${UNIT_NAME}：${active.out || 'inactive'}`)
	const logs = sh('journalctl', ['--user', '-u', UNIT_NAME, '-n', '12', '--no-pager'], { quiet: true })
	if (logs.out !== '') console.log(`\n--- 最近日志\n${logs.out}`)

	const stored = readConfigFile()
	if (stored.hostname === undefined) {
		console.log('\n还没有安装过（缺 agent.json），先跑 install。')
		return
	}
	const url = `https://${stored.hostname}/`
	try {
		const res = await fetch(url, { redirect: 'manual' })
		console.log(`\n公网探活 ${url} → ${res.status}（未带口令时应为 401/303）`)
	} catch (e) {
		console.log(`\n公网探活失败 ${url}：${e.message}`)
		process.exitCode = 1
	}
}

function print() {
	const rendered = renderTunnel(collectInput(readConfigFile()))
	console.log(JSON.stringify(rendered.summary, null, 2))
	console.log('\n--- 单元文件')
	console.log(rendered.files[`~/.config/systemd/user/${UNIT_NAME}`])
}

const command = process.argv[2] || 'status'
try {
	if (command === 'install') install()
	else if (command === 'status') await status()
	else if (command === 'print') print()
	else {
		console.error(`未知命令：${command}（install | status | print）`)
		process.exit(2)
	}
} catch (e) {
	console.error(`失败：${e.message}`)
	process.exit(1)
}
