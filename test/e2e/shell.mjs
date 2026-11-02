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

/**
 * 在 CDP 里模拟单指滑动。Chrome 会把触摸序列翻译成 pointer 事件，
 * 插件侧的横滑手势监听的是 touch 层；这里拆成三个原语，方便在滑动途中读状态。
 */
const touchStart = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
const touchMove = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
const touchEnd = () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

const swipe = async (from, to, { steps = 8, pace = 20 } = {}) => {
	await touchStart(from.x, from.y)
	for (let step = 1; step <= steps; step += 1) {
		await touchMove(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps)
		await sleep(pace)
	}
	await touchEnd()
}

const drawerState = async () => {
	const raw = await evaluate(`JSON.stringify({
		open: document.documentElement.classList.contains('dsh-drawer-open'),
		scrim: Number(getComputedStyle(document.querySelector('.dsh-mobile-scrim')).opacity),
	})`)
	return JSON.parse(raw)
}

/** 抽屉当前被跟手推开多少像素（transform 的 tx + 自身宽度）。 */
const drawerOffset = async () => {
	const raw = await evaluate(`(() => {
		const el = document.querySelector('[class*="_sidebarCol"]')
		if (el === null) return 'null'
		const rect = el.getBoundingClientRect()
		const tx = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41
		return JSON.stringify({ width: Math.round(rect.width), tx: Math.round(tx), live: document.documentElement.classList.contains('dsh-drawer-live') })
	})()`)
	return raw === 'null' ? null : JSON.parse(raw)
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
	// 宿主的 resize 手柄在抽屉右缘，手机上会抢走「左滑收起」的起手
	const handle = await evaluate(
		`(() => { const el = document.querySelector('[data-side]'); return el === null ? 'none' : getComputedStyle(el).display })()`,
	)
	check('抽屉右缘 resize 手柄已隐藏', handle === 'none', handle)
	check('遮罩可见', Number(opened.scrim) > 0.9, opened.scrim)

	// 点遮罩收起：采样整段动画，退场结束后不能又重播进场（那就是肉眼看到的「闪一下」）
	await evaluate(`(() => {
		window.__anims = []
		const t0 = performance.now()
		const tick = () => {
			const el = document.querySelector('[class*="_sidebarCol"]')
			if (el !== null) for (const item of el.getAnimations()) if (item.animationName) window.__anims.push(item.animationName)
			if (performance.now() - t0 < 500) requestAnimationFrame(tick)
		}
		requestAnimationFrame(tick)
		document.querySelector('.dsh-mobile-scrim')?.click()
		return 1
	})()`)
	await sleep(800)
	const closeAnims = JSON.parse(await evaluate('JSON.stringify([...new Set(window.__anims ?? [])])'))
	check('点遮罩收起不重播进场动画', !closeAnims.includes('dsh-drawer-in'), closeAnims)
	const closed = await evaluate(`JSON.stringify({
		open: document.documentElement.classList.contains('dsh-drawer-open'),
		scrim: getComputedStyle(document.querySelector('.dsh-mobile-scrim')).opacity,
	})`)
	const closedState = JSON.parse(closed)
	check('点遮罩关抽屉', closedState.open === false)
	check('遮罩淡出', Number(closedState.scrim) < 0.05, closedState.scrim)

	// 横滑抽屉：热区内右滑跟手拉出、抽屉上左滑收起；系统边缘带与正文区都不参与
	await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })

	// 跟手：划到一半停在 110，此时抽屉宽 280、dx=80，tx 应该就在 -200 附近
	await touchStart(40, 420)
	for (let step = 1; step <= 4; step += 1) {
		await touchMove(40 + 18 * step, 420)
		await sleep(16)
	}
	const mid = await drawerOffset()
	check('跟手期已接管位移', mid !== null && mid.live === true, mid)
	check('位移 = 手指位移', mid !== null && Math.abs(mid.tx - (72 - mid.width)) <= 24, mid)
	for (let step = 5; step <= 8; step += 1) {
		await touchMove(40 + 18 * step, 420)
		await sleep(16)
	}
	await touchEnd()
	// 抬手吸附：从当前位置滑到全开，不能瞬移
	const snapping = JSON.parse(
		await evaluate(`JSON.stringify({
			names: document.getAnimations().map((item) => item.animationName),
			dragging: document.documentElement.classList.contains('dsh-drawer-dragging'),
		})`),
	)
	check('抬手吸附到全开', snapping.names.includes('dsh-drawer-snap') || snapping.dragging === false, snapping)
	await sleep(700)
	const swipedOpen = await drawerState()
	check('热区右滑拉出抽屉', swipedOpen.open === true, swipedOpen)
	check('遮罩随抽屉出现', swipedOpen.scrim > 0.9, swipedOpen.scrim)

	// 抽屉里的会话列表要能竖着滚：带横向抖动的竖滑不能被当成「收抽屉」
	await swipe({ x: 150, y: 620 }, { x: 172, y: 300 }, { steps: 10, pace: 16 })
	await sleep(400)
	const scrolled = await drawerState()
	const scrolledOffset = await drawerOffset()
	check(
		'抽屉内竖滑不收抽屉',
		scrolled.open === true && Math.abs(scrolledOffset?.tx ?? -999) < 2,
		{ scrolled, scrolledOffset },
	)

	await swipe({ x: 150, y: 420 }, { x: 20, y: 420 })
	const exiting = JSON.parse(
		await evaluate(`JSON.stringify({
			leave: document.documentElement.classList.contains('dsh-drawer-leave'),
			names: document.getAnimations().map((item) => item.animationName),
		})`),
	)
	check('抽屉带滑出动画', exiting.leave || exiting.names.includes('dsh-drawer-out'), exiting)
	await sleep(700)
	const swipedClosed = await drawerState()
	check('抽屉上左滑收起', swipedClosed.open === false, swipedClosed)
	check('收起后遮罩归零', swipedClosed.scrim < 0.05, swipedClosed.scrim)

	// 反例：系统边缘带（x < 32）不抢，留给 Android 的手势返回
	await swipe({ x: 4, y: 420 }, { x: 150, y: 420 })
	await sleep(500)
	check('系统边缘带右滑不开抽屉', (await drawerState()).open === false)

	// 屏幕中部右滑也要能拉出来（整屏都是起手区，只避开系统边缘带）
	await swipe({ x: 200, y: 420 }, { x: 360, y: 420 })
	await sleep(700)
	check('屏幕中部右滑能开抽屉', (await drawerState()).open === true)
	await swipe({ x: 200, y: 420 }, { x: 40, y: 420 })
	await sleep(700)
	check('中部打开后左滑能收起', (await drawerState()).open === false)

	// 反例：热区内竖滑是滚动，不是拉抽屉
	await swipe({ x: 40, y: 620 }, { x: 44, y: 320 })
	await sleep(500)
	check('热区内竖滑不开抽屉', (await drawerState()).open === false)

	// 反例：划得不够远、也不够快
	await swipe({ x: 40, y: 420 }, { x: 72, y: 420 })
	await sleep(600)
	check('短距离右滑不开抽屉', (await drawerState()).open === false)

	// 距离不够、但甩得快：单步 70px，8 步会被 CDP 往返延迟摊平成慢速拖动
	await swipe({ x: 40, y: 420 }, { x: 110, y: 420 }, { steps: 1 })
	await sleep(700)
	check('快速甩动也能拉出抽屉', (await drawerState()).open === true)

	// 连续交互：开 → 抽屉里竖滚 → 左滑关 → 再开 → 开着右滑 → 左滑关 → 正文竖滚
	// （实机上最容易坏的就是「关掉之后下一次打不开」，这里按真实节奏压一遍）
	const seq = []
	await swipe({ x: 40, y: 700 }, { x: 200, y: 700 })
	await sleep(600)
	seq.push(['关掉后能再开', (await drawerState()).open])
	await swipe({ x: 150, y: 700 }, { x: 170, y: 400 }, { steps: 10, pace: 16 })
	await sleep(400)
	seq.push(['抽屉里竖滚不被带走', (await drawerState()).open])
	await swipe({ x: 200, y: 700 }, { x: 20, y: 700 })
	await sleep(700)
	seq.push(['左滑关得掉', (await drawerState()).open === false])
	await swipe({ x: 40, y: 700 }, { x: 200, y: 700 })
	await sleep(600)
	await swipe({ x: 40, y: 700 }, { x: 200, y: 700 })
	await sleep(400)
	seq.push(['开着再右滑不出错', (await drawerState()).open])
	await swipe({ x: 200, y: 400 }, { x: 20, y: 400 })
	await sleep(700)
	seq.push(['第二次收起也正常', (await drawerState()).open === false])
	await swipe({ x: 40, y: 700 }, { x: 44, y: 300 }, { steps: 8, pace: 16 })
	await sleep(400)
	seq.push(['正文竖滚不弹抽屉', (await drawerState()).open === false])
	for (const [name, ok] of seq) check(name, ok === true)
} finally {
	ws.close()
	child.kill('SIGKILL')
	// Chrome 被杀之后还会写一会儿 profile；rm 抢跑会 ENOTEMPTY，
	// 这里的失败跟测试结论无关，重试几次后放弃
	await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}

if (failures.length > 0) {
	console.error(`\n${failures.length} 项失败：${failures.join(', ')}`)
	process.exit(1)
}
console.log('\n外壳冒烟测试通过')
