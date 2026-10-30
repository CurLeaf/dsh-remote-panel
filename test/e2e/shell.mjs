/**
 * 手机外壳冒烟测试（真浏览器，无需框架）。
 *
 * 用法：
 *   DSH_E2E_URL="http://127.0.0.1:3080/?token=..." npm run e2e
 *
 * 没有提供 URL 或找不到 Chrome 时直接跳过（退出码 0），方便在 CI/无桌面环境里跑。
 * 覆盖点都是「改一改就会坏、坏了很显眼」的：外壳样式注入、抽屉开合、遮罩、底色、横向溢出。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { execFileSync } from 'node:child_process'

/** 没给 URL 时，尝试从 dsh-web 的 journal 里捞一个带令牌的本机地址（仅 Linux）。 */
function detectUrl() {
	const fromEnv = process.env.DSH_E2E_URL
	if (fromEnv !== undefined && fromEnv !== '') return fromEnv
	try {
		const log = execFileSync('journalctl', ['--user', '-u', 'dsh-web', '-n', '80', '--no-pager', '-o', 'cat'], {
			encoding: 'utf8',
			timeout: 3000,
		})
		const token = log.match(/token=([A-Za-z0-9_-]+)/g)?.at(-1)?.slice('token='.length)
		if (token !== undefined) return `http://127.0.0.1:3080/?token=${token}`
	} catch {
		/* 没有 journal 就算了 */
	}
	return undefined
}

const url = detectUrl()
const candidates = [
	process.env.CHROME_PATH,
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
]
const chrome = candidates.find((path) => path !== undefined && existsSync(path))

if (url === undefined || url === '') {
	console.log('skip: 未设置 DSH_E2E_URL')
	process.exit(0)
}
if (chrome === undefined) {
	console.log('skip: 找不到 Chrome/Chromium（可设 CHROME_PATH）')
	process.exit(0)
}

const port = 9511
const profile = await mkdtemp(join(tmpdir(), 'dsh-e2e-'))
const child = spawn(
	chrome,
	[
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		'--no-default-browser-check',
		'--remote-allow-origins=*',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${profile}`,
		url,
	],
	{ stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connect() {
	for (let i = 0; i < 60; i += 1) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
			const page = list.find((target) => target.type === 'page')
			if (page !== undefined) return page.webSocketDebuggerUrl
		} catch {
			/* 还没起来 */
		}
		await sleep(250)
	}
	throw new Error('Chrome 没起来')
}

const ws = new WebSocket(await connect())
await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve, { once: true })
	ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
	const message = JSON.parse(event.data)
	if (message.id !== undefined && pending.has(message.id)) {
		pending.get(message.id)(message)
		pending.delete(message.id)
	}
})
const send = (method, params = {}) => {
	const id = nextId++
	ws.send(JSON.stringify({ id, method, params }))
	return new Promise((resolve) => pending.set(id, resolve)).then((message) => message.result)
}
const evaluate = async (expression) => {
	const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
	if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? '页面脚本抛错')
	return result.result?.value
}

const failures = []
const check = (name, ok, detail) => {
	if (ok) {
		console.log(`  ✔ ${name}`)
		return
	}
	failures.push(name)
	console.log(`  ✖ ${name}  ${detail === undefined ? '' : JSON.stringify(detail)}`)
}

try {
	await send('Page.enable')
	await send('Runtime.enable')
	await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
	await sleep(4000)

	const boot = await evaluate(`JSON.stringify({
		shell: document.getElementById('dsh-remote-panel-shell') !== null,
		hamburger: document.querySelector('.dsh-mobile-hamburger') !== null,
		scrim: document.querySelector('.dsh-mobile-scrim') !== null,
		overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
		bg: getComputedStyle(document.body).backgroundColor,
		vars: [getComputedStyle(document.documentElement).getPropertyValue('--dsh-safe-top').trim(), getComputedStyle(document.documentElement).getPropertyValue('--dsh-safe-bottom').trim()],
	})`)
	const booted = JSON.parse(boot)
	check('外壳样式注入', booted.shell)
	check('汉堡按钮存在', booted.hamburger)
	check('遮罩节点存在', booted.scrim)
	check('无横向溢出', booted.overflow === false, booted.overflow)
	check('深色底为纯黑', booted.bg === 'rgb(0, 0, 0)', booted.bg)
	check('安全区变量已定义', booted.vars.every((value) => value !== ''), booted.vars)

	await evaluate("document.querySelector('.dsh-mobile-hamburger')?.click()")
	await sleep(600)
	const opened = JSON.parse(
		await evaluate(`JSON.stringify({
			open: document.documentElement.classList.contains('dsh-drawer-open'),
			width: Math.round(document.querySelector('[class*="_sidebarCol"]')?.getBoundingClientRect().width ?? 0),
			scrim: getComputedStyle(document.querySelector('.dsh-mobile-scrim')).opacity,
		})`),
	)
	check('抽屉打开', opened.open === true)
	check('抽屉宽度 280', opened.width === 280, opened.width)
	check('遮罩可见', Number(opened.scrim) > 0.9, opened.scrim)

	await evaluate("document.querySelector('.dsh-mobile-scrim')?.click()")
	await sleep(500)
	const closed = await evaluate(`JSON.stringify({
		open: document.documentElement.classList.contains('dsh-drawer-open'),
		scrim: getComputedStyle(document.querySelector('.dsh-mobile-scrim')).opacity,
	})`)
	const closedState = JSON.parse(closed)
	check('点遮罩关抽屉', closedState.open === false)
	check('遮罩淡出', Number(closedState.scrim) < 0.05, closedState.scrim)
} finally {
	ws.close()
	child.kill('SIGKILL')
	await rm(profile, { recursive: true, force: true })
}

if (failures.length > 0) {
	console.error(`\n${failures.length} 项失败：${failures.join(', ')}`)
	process.exit(1)
}
console.log('\n外壳冒烟测试通过')
