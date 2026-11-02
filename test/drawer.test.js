import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/**
 * 手机抽屉：装进一个只提供必要接口的假 DOM 里跑。
 *
 * 这一层的价值就在「只认宿主稳定契约」：frame 上有没有 `data-sidebar-collapsed`、
 * `layout.toggleSidebar()` 调没调、遮罩/Esc/手势能不能收。这些都必须在没有浏览器的环境里
 * 可验证 —— 真机只是最后一步确认，不是唯一证据。
 */

const SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function extractFunction(name) {
	const start = SOURCE.indexOf(`function ${name}(`)
	assert.notEqual(start, -1, `client.js 里找不到 ${name}()——改名字要同步改这个测试`)
	// 参数里可能有解构默认值（`{ threshold = 48 } = {}`），所以先配平括号，再找函数体的 {
	let paren = 0
	let bodyStart = -1
	for (let index = SOURCE.indexOf('(', start); index < SOURCE.length; index++) {
		const char = SOURCE[index]
		if (char === '(') paren++
		else if (char === ')' && --paren === 0) {
			bodyStart = SOURCE.indexOf('{', index)
			break
		}
	}
	assert.notEqual(bodyStart, -1, `${name}() 没找到函数体`)
	let depth = 0
	for (let index = bodyStart; index < SOURCE.length; index++) {
		if (SOURCE[index] === '{') depth++
		else if (SOURCE[index] === '}' && --depth === 0) return SOURCE.slice(start, index + 1)
	}
	throw new Error(`${name}() 花括号没配平`)
}

class FakeClassList {
	constructor() {
		this.values = new Set()
	}
	contains(name) {
		return this.values.has(name)
	}
	add(...names) {
		for (const name of names) this.values.add(name)
	}
	remove(...names) {
		for (const name of names) this.values.delete(name)
	}
	toggle(name, force) {
		const on = force === undefined ? !this.values.has(name) : Boolean(force)
		if (on) this.values.add(name)
		else this.values.delete(name)
		return on
	}
}

class FakeElement {
	constructor(tag = 'div') {
		this.tagName = String(tag).toUpperCase()
		this.children = []
		this.attributes = new Map()
		this.classList = new FakeClassList()
		this.style = { setProperty() {}, removeProperty() {} }
		this.listeners = new Map()
		this.parentNode = null
	}
	setAttribute(name, value) {
		this.attributes.set(name, String(value))
	}
	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null
	}
	hasAttribute(name) {
		return this.attributes.has(name)
	}
	removeAttribute(name) {
		this.attributes.delete(name)
	}
	appendChild(child) {
		child.parentNode = this
		this.children.push(child)
		return child
	}
	remove() {
		const parent = this.parentNode
		if (parent === null) return
		parent.children = parent.children.filter((item) => item !== this)
		this.parentNode = null
	}
	get firstElementChild() {
		return this.children[0] ?? null
	}
	get parentElement() {
		return this.parentNode
	}
	addEventListener(type, handler) {
		const list = this.listeners.get(type) ?? []
		list.push(handler)
		this.listeners.set(type, list)
	}
	removeEventListener(type, handler) {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter((item) => item !== handler),
		)
	}
	dispatch(type, event = {}) {
		for (const handler of this.listeners.get(type) ?? []) handler(event)
	}
	/** className 要和 classList 联动（代码里两种写法都有） */
	get className() {
		return [...this.classList.values].join(' ')
	}
	set className(value) {
		this.classList.values.clear()
		for (const token of String(value).split(/\s+/)) if (token) this.classList.values.add(token)
	}
	/** 够用的选择器匹配：逗号列表 / `[data-x=value]` / `.cls` / 标签名 */
	matchesSelector(selector) {
		return String(selector)
			.split(',')
			.some((part) => this.matchesOne(part.trim()))
	}
	matchesOne(text) {
		if (text === '') return false
		if (text.startsWith('[') && text.endsWith(']')) {
			const body = text.slice(1, -1)
			const index = body.indexOf('=')
			if (index < 0) return this.hasAttribute(body.trim())
			const name = body.slice(0, index).trim()
			const value = body.slice(index + 1).trim().replace(/^["']|["']$/g, '')
			return this.getAttribute(name) === value
		}
		if (text.startsWith('.')) return this.classList.contains(text.slice(1))
		return this.tagName === text.toUpperCase()
	}
	closest(selector) {
		let node = this
		while (node) {
			if (node.matchesSelector?.(selector) === true) return node
			node = node.parentNode
		}
		return null
	}
}

function walk(root, visit) {
	for (const child of root.children) {
		visit(child)
		walk(child, visit)
	}
}

class FakeMutationObserver {
	constructor(callback) {
		this.callback = callback
		this.targets = []
		FakeMutationObserver.instances.push(this)
	}
	observe(target) {
		this.targets.push(target)
	}
	disconnect() {
		this.targets = []
	}
	flush() {
		if (this.targets.length > 0) this.callback([])
	}
}
FakeMutationObserver.instances = []

/**
 * 宿主布局：frame（带折叠属性）> [sidebarCol, centerCol, overlayLayer]
 * 只复刻 installDrawer 真的会碰的那几个节点。
 */
function fakeHost({ narrow = true, collapsed = true } = {}) {
	FakeMutationObserver.instances = []
	const documentElement = new FakeElement('html')
	const body = new FakeElement('body')
	const frame = new FakeElement('div')
	const sidebar = new FakeElement('div')
	const center = new FakeElement('div')
	const overlay = new FakeElement('div')
	overlay.setAttribute('data-shell-overlay', '')
	frame.appendChild(sidebar)
	frame.appendChild(center)
	frame.appendChild(overlay)
	if (collapsed) frame.setAttribute('data-sidebar-collapsed', '')
	body.appendChild(frame)

	const document = {
		documentElement,
		body,
		createElement: (tag) => new FakeElement(tag),
		addEventListener(type, handler) {
			documentElement.listenersRoot ??= new Map()
			const list = documentElement.listenersRoot.get(type) ?? []
			list.push(handler)
			documentElement.listenersRoot.set(type, list)
		},
		removeEventListener(type, handler) {
			const list = documentElement.listenersRoot?.get(type) ?? []
			documentElement.listenersRoot.set(
				type,
				list.filter((item) => item !== handler),
			)
		},
		dispatch(type, event = {}) {
			for (const handler of documentElement.listenersRoot?.get(type) ?? []) handler(event)
		},
		querySelector(selector) {
			if (selector === '[data-shell-overlay]') return overlay
			let hit = null
			walk(body, (node) => {
				if (hit === null && node.matchesSelector(selector)) hit = node
			})
			return hit
		},
		querySelectorAll(selector) {
			const hits = []
			walk(body, (node) => {
				if (node.matchesSelector(selector)) hits.push(node)
			})
			return hits
		},
	}

	const mediaListeners = new Map()
	const media = {
		matches: narrow,
		addEventListener(type, handler) {
			mediaListeners.set(type, handler)
		},
		removeEventListener(type) {
			mediaListeners.delete(type)
		},
	}
	const window = {
		matchMedia: () => media,
		requestAnimationFrame: (fn) => {
			fn()
			return 0
		},
		cancelAnimationFrame: () => {},
		setTimeout: (fn) => {
			fn()
			return 0
		},
		clearTimeout: () => {},
		addEventListener() {},
		removeEventListener() {},
	}

	return { document, window, body, frame, sidebar, center, overlay, media }
}

function loadDrawer(host) {
	const toggles = []
	const sandbox = {
		document: host.document,
		window: host.window,
		Element: FakeElement,
		MutationObserver: FakeMutationObserver,
		// 浏览器里这些是全局函数，沙箱要把同一份挂到全局上
		requestAnimationFrame: host.window.requestAnimationFrame,
		cancelAnimationFrame: host.window.cancelAnimationFrame,
		setTimeout: host.window.setTimeout,
		clearTimeout: host.window.clearTimeout,
		console,
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	// installDrawer 依赖这两个闭包变量；连同两个函数一起切进来，别的都不碰
	const code = `let drawerApi = null
const DRAWER_CLEANUP_KEY = '__TEST_DRAWER__'
${extractFunction('drawerSwipeAction')}
${extractFunction('installDrawer')}`
	vm.runInContext(code, sandbox, { filename: 'drawer.js' })
	// 宿主的真实行为：toggle 一次就翻转折叠状态，然后 React 重新渲染出属性
	const layout = {
		toggleSidebar() {
			toggles.push('toggle')
			if (host.frame.hasAttribute('data-sidebar-collapsed')) host.frame.removeAttribute('data-sidebar-collapsed')
			else host.frame.setAttribute('data-sidebar-collapsed', '')
			FakeMutationObserver.instances.forEach((observer) => observer.flush())
		},
	}
	const cleanup = vm.runInContext('installDrawer(__layout)', Object.assign(sandbox, { __layout: layout }))
	const api = vm.runInContext('drawerApi', sandbox)
	return { cleanup, api, toggles, sandbox }
}

test('装上就给宿主打标：frame / 侧栏 / 遮罩', () => {
	const host = fakeHost({ collapsed: true })
	const { api } = loadDrawer(host)
	assert.equal(host.frame.hasAttribute('data-qzsy-frame'), true, 'frame 要被标记（CSS 靠它压网格）')
	assert.equal(host.sidebar.hasAttribute('data-qzsy-drawer'), true, '侧栏要被标记（CSS 靠它做浮层）')
	assert.equal(host.center.hasAttribute('data-qzsy-drawer'), false, '不能顺手把正文也标上')
	assert.equal(
		host.body.children.some((node) => node.classList.contains('dsh-drawer-backdrop')),
		false,
		'整屏层不该再挂遮罩',
	)
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), false, '折叠态不该是打开')
	assert.equal(typeof api.open, 'function')
})

test('打开/收起都走 layout.toggleSidebar，类名跟着折叠状态走', () => {
	const host = fakeHost({ collapsed: true })
	const { api, toggles } = loadDrawer(host)

	assert.equal(api.open(), true)
	assert.deepEqual(toggles, ['toggle'], '打开必须调宿主的 API，而不是自己改 DOM')
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), true, '先按预期同步一次')

	// 宿主渲染完成：折叠属性被去掉，sync 后状态一致
	host.frame.removeAttribute('data-sidebar-collapsed')
	api.sync()
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), true, '展开态应保持打开')

	// 设置回来 = 用户在外面收起了侧栏 → 类名要跟着掉（不能自己留着）
	host.frame.setAttribute('data-sidebar-collapsed', '')
	api.sync()
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), false)

	assert.equal(api.close(), true, '已经收起时关闭是幂等的')
	assert.equal(toggles.length, 1, '幂等关闭不该再调宿主')
})

test('Esc 收起；再打开仍然可用', () => {
	const host = fakeHost({ collapsed: true })
	const { api, toggles } = loadDrawer(host)
	api.open()
	assert.equal(api.isOpen(), true, '打开后要真的处于打开态')

	host.document.dispatch('keydown', { key: 'Escape', preventDefault() {} })
	assert.equal(toggles.length, 2, 'Esc 要关抽屉')
	assert.equal(api.isOpen(), false, '关掉之后状态要跟着掉')

	api.open()
	assert.equal(api.isOpen(), true, '关掉之后还能再打开')
	assert.equal(toggles.length, 3)
})

test('左缘右滑开、抽屉内左滑收，竖向滚动不误触', () => {
	const host = fakeHost({ collapsed: true })
	const { api, toggles } = loadDrawer(host)

	host.document.dispatch('touchstart', { touches: [{ clientX: 10, clientY: 300 }], target: host.center })
	host.document.dispatch('touchend', { changedTouches: [{ clientX: 90, clientY: 306 }] })
	assert.equal(toggles.length, 1, '左缘右滑要打开')

	host.frame.removeAttribute('data-sidebar-collapsed')
	api.sync()
	// 抽屉内左滑
	const row = new FakeElement('div')
	host.sidebar.appendChild(row)
	host.document.dispatch('touchstart', { touches: [{ clientX: 200, clientY: 300 }], target: row })
	host.document.dispatch('touchend', { changedTouches: [{ clientX: 120, clientY: 302 }] })
	assert.equal(toggles.length, 2, '抽屉内左滑要收起')

	// 竖着滚列表：横向 58px 看着够，但竖向压过去了
	host.document.dispatch('touchstart', { touches: [{ clientX: 10, clientY: 300 }], target: host.center })
	host.document.dispatch('touchend', { changedTouches: [{ clientX: 68, clientY: 420 }] })
	assert.equal(toggles.length, 2, '竖向滚动不能被当成开抽屉')
})

test('桌面（>1023px）不接管：open() 直接返回 false', () => {
	const host = fakeHost({ narrow: false, collapsed: false })
	const { api, toggles } = loadDrawer(host)
	assert.equal(api.open(), false)
	assert.deepEqual(toggles, [], '桌面上不许动宿主的侧栏')
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), false)
})

test('抽屉里的搜索框 / 行尾菜单不顺手收掉抽屉', () => {
	const host = fakeHost({ collapsed: true })
	const { api, toggles } = loadDrawer(host)
	api.open()
	host.frame.removeAttribute('data-sidebar-collapsed')
	api.sync()
	const before = toggles.length

	const input = new FakeElement('input')
	host.sidebar.appendChild(input)
	host.document.dispatch('click', { target: input })
	assert.equal(toggles.length, before, '点搜索框不该收抽屉')

	const menu = new FakeElement('button')
	menu.setAttribute('aria-haspopup', 'menu')
	host.sidebar.appendChild(menu)
	host.document.dispatch('click', { target: menu })
	assert.equal(toggles.length, before, '行尾「⋯」菜单不该收抽屉')

	const row = new FakeElement('div')
	host.sidebar.appendChild(row)
	host.document.dispatch('click', { target: row })
	assert.equal(toggles.length, before + 1, '点会话行要收抽屉（宿主已经跳走了）')
})

test('卸载后把标记和类名都清干净（不允许污染宿主 DOM）', () => {
	const host = fakeHost({ collapsed: true })
	const { cleanup } = loadDrawer(host)
	cleanup()
	assert.equal(host.frame.hasAttribute('data-qzsy-frame'), false)
	assert.equal(host.sidebar.hasAttribute('data-qzsy-drawer'), false)
	assert.equal(host.document.documentElement.classList.contains('dsh-drawer-open'), false)
	assert.equal(
		host.body.children.some((node) => node.classList.contains('dsh-drawer-backdrop')),
		false,
		'不该残留遮罩',
	)
})
