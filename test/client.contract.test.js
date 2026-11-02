import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/**
 * 客户端包的加载契约测试：不渲染 React，只验证
 * 「能被 __ModuleLoader__ 装载 → 返回 { inject, apply } → apply 注册到
 * settings.section 且带 label」。这条链路一旦断了，插件在浏览器里会静默消失。
 */
function loadBundle() {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	const loaded = []
	const sandbox = {
		window: { __ModuleLoader__: { load: (entry) => loaded.push(entry) } },
		globalThis: {},
		console,
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: 'client.js' })
	assert.equal(loaded.length, 1, '必须恰好装载一次')
	return loaded[0]
}

function fakeRequire(id) {
	if (id === 'react') {
		return {
			useCallback: (fn) => fn,
			useEffect: () => {},
			useRef: (value) => ({ current: value }),
			useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
		}
	}
	if (id === 'react/jsx-runtime') {
		// 关键：函数组件要被真正调用，否则组件体内的错误（比如引用了未声明的变量）
		// 永远不会在测试里暴露
		const render = (type, props) => (typeof type === 'function' ? type(props ?? {}) : null)
		return { jsx: render, jsxs: render }
	}
	throw new Error(`unexpected require: ${id}`)
}

test('bundle 以包名装载', () => {
	const entry = loadBundle()
	assert.equal(entry.id, 'dsh-remote-panel')
	assert.equal(typeof entry.factory, 'function')
})

test('factory 返回 { inject, apply }', () => {
	const exports = loadBundle().factory(fakeRequire)
	assert.deepEqual(Array.from(exports.inject), ['slots', 'layout', 'sessions', 'uiSession'])
	assert.equal(typeof exports.apply, 'function')
})

test('apply 注册设置分区与移动端外壳插槽', () => {
	const exports = loadBundle().factory(fakeRequire)
	const registrations = []
	const ctx = {
		slots: {
			inject(name, setup) {
				return setup()
			},
			register(registration, component) {
				registrations.push({ registration, component })
				return () => {}
			},
		},
	}
	exports.apply(ctx)

	const byName = new Map(registrations.map((entry) => [entry.registration.name, entry]))
	assert.deepEqual([...byName.keys()].sort(), [
		'conversation.header.leading',
		'main',
		'settings.section',
		'shell.overlay',
		'sidebar.panellist',
	])

	const section = byName.get('settings.section')
	assert.equal(section.registration.id, 'remote-panel')
	assert.equal(section.registration.label(), '远程访问')
	assert.equal(typeof section.component, 'function')

	assert.equal(byName.get('shell.overlay').registration.id, 'remote-panel.new-chat')
	assert.equal(byName.get('conversation.header.leading').registration.id, 'remote-panel.hamburger')

	// 监看面板：main 的 key 必须和侧栏入口的 id 一致，否则点了没反应
	const main = byName.get('main')
	assert.equal(main.registration.key, 'pocket-console')
	const panellist = byName.get('sidebar.panellist')
	assert.equal(panellist.registration.id, 'pocket-console')
	assert.equal(panellist.registration.label(), '监看')
})

test('每个面板组件浅渲染都不抛错', () => {
	const exports = loadBundle().factory(fakeRequire)
	const components = []
	const ctx = {
		slots: {
			inject: (_name, setup) => setup(),
			register: (registration, component) => {
				if (registration.name === 'settings.section') components.push(component)
				return () => {}
			},
		},
	}
	exports.apply(ctx)
	assert.equal(components.length, 1)

	// 逐个渲染，防止再次出现「某个分支引用了未声明的变量」这类只在渲染期暴露的问题
	const props = {
		Panel: {},
		DeployWizard: { onDeployed: () => {} },
		StatusCard: { state: { ip: '10.0.0.1', port: 8710 }, version: '0.1.0', onRedeploy: () => {} },
		PairCard: {},
		AccessCard: {},
		StaleBanner: {},
		AppCard: {},
	}
	for (const [name, component] of Object.entries(exports.components)) {
		assert.doesNotThrow(() => component(props[name] ?? {}), `${name} 渲染抛错`)
	}
	assert.equal(typeof components[0], 'function')
})

test('监看面板卸载时按 { dispose } 形状收尾（整页黑屏回归）', async () => {
	// 现场：mountConsole 返回 { store, dispose }，旧代码把它当函数调用 →
	// TypeError: dispose is not a function → 宿主判 root 槽位崩溃 → 返回对话后整页黑屏。
	const entry = loadBundle()
	const effects = []
	let disposedTimes = 0
	const react = {
		useCallback: (fn) => fn,
		useEffect: (fn) => effects.push(fn),
		useRef: (value) => ({ current: value ?? {} }),
		useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
	}
	const req = (id) => {
		if (id === 'react') return react
		if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
		throw new Error(`unexpected require: ${id}`)
	}
	req.async = () => Promise.resolve({ mountConsole: () => ({ store: {}, dispose: () => { disposedTimes++ } }) })

	const exports = entry.factory(req)
	const Host = exports.components.ConsolePanelHost
	assert.equal(typeof Host, 'function')

	Host({ onExit: () => {}, sessions: {} })
	assert.equal(effects.length, 1, 'Host 必须挂一个 effect 才能在卸载时收尾')

	const cleanup = effects[0]()
	await new Promise((r) => setTimeout(r, 0))
	assert.doesNotThrow(() => cleanup(), 'cleanup 不能抛（抛了宿主会把整个 root 卸掉）')
	assert.equal(disposedTimes, 1, 'dispose 必须恰好调用一次')
})

test('监看面板也接受「mountConsole 直接返回函数」的形状', async () => {
	const entry = loadBundle()
	const effects = []
	let disposedTimes = 0
	const react = {
		useCallback: (fn) => fn,
		useEffect: (fn) => effects.push(fn),
		useRef: (value) => ({ current: value ?? {} }),
		useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
	}
	const req = (id) => {
		if (id === 'react') return react
		if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
		throw new Error(`unexpected require: ${id}`)
	}
	req.async = () => Promise.resolve({ mountConsole: () => () => { disposedTimes++ } })

	const exports = entry.factory(req)
	exports.components.ConsolePanelHost({ onExit: () => {}, sessions: {} })
	const cleanup = effects[0]()
	await new Promise((r) => setTimeout(r, 0))
	assert.doesNotThrow(() => cleanup())
	assert.equal(disposedTimes, 1)
})

// ---------------------------------------------------------------------------
// 手机软键盘：输入条顶起 + 触摸别处收键盘
//
// 这两段逻辑活在客户端包的闭包里，没法直接 import；这里按函数名把源码切出来，
// 放进一个只有假 DOM 的 vm 沙箱里跑。切不到函数名会直接失败，不会静默跳过。
// （这几个函数体内没有带花括号的字符串，所以按花括号配平切是安全的。）
// ---------------------------------------------------------------------------

const INSTALLER_FUNCTIONS = ['isComposerEditor', 'isComposerNode', 'installKeyboardDock', 'installComposerDismiss']

function extractFunctions(source, names) {
	return names
		.map((name) => {
			const start = source.indexOf(`function ${name}(`)
			assert.notEqual(start, -1, `client.js 里找不到 ${name}()——改名字要同步改这个测试`)
			let depth = 0
			let index = source.indexOf('{', start)
			for (; index < source.length; index++) {
				if (source[index] === '{') depth++
				else if (source[index] === '}' && --depth === 0) break
			}
			return source.slice(start, index + 1)
		})
		.join('\n\n')
}

class FakeElement {
	constructor(selectors = []) {
		this.tagName = 'DIV'
		this.isContentEditable = selectors.includes(':editor')
		this.selectors = selectors
		this.blurred = 0
	}

	closest(selector) {
		// 只要元素声明的某个选择器是传入选择器列表里的一项就算命中（和真实 closest 同向）
		return this.selectors.some((item) => item !== ':editor' && selector.includes(item)) ? this : null
	}

	blur() {
		this.blurred += 1
	}
}

/** 够用的假 DOM：只提供这两个安装函数会碰到的接口 */
function fakeDom({ coarse = true, layoutHeight = 800, viewHeight = 800, offsetTop = 0, scale = 1 } = {}) {
	const listeners = new Map()
	const record = (target) => ({
		addEventListener(type, handler) {
			const list = listeners.get(`${target}:${type}`) ?? []
			list.push(handler)
			listeners.set(`${target}:${type}`, list)
		},
		removeEventListener(type, handler) {
			const list = listeners.get(`${target}:${type}`) ?? []
			listeners.set(
				`${target}:${type}`,
				list.filter((item) => item !== handler),
			)
		},
	})
	const fire = (target, type, event = {}) => {
		for (const handler of listeners.get(`${target}:${type}`) ?? []) handler(event)
	}
	const root = {
		style: {
			values: new Map(),
			setProperty(name, value) {
				this.values.set(name, value)
			},
			removeProperty(name) {
				this.values.delete(name)
			},
		},
		attributes: new Set(),
		setAttribute(name) {
			this.attributes.add(name)
		},
		removeAttribute(name) {
			this.attributes.delete(name)
		},
	}
	const viewport = { height: viewHeight, offsetTop, scale, ...record('viewport') }
	const window = {
		innerHeight: layoutHeight,
		visualViewport: viewport,
		matchMedia: (query) => ({ matches: query.includes('coarse') ? coarse : true }),
		requestAnimationFrame: (fn) => {
			fn()
			return 0
		},
		cancelAnimationFrame: () => {},
		setTimeout: () => 0,
		clearTimeout: () => {},
		...record('window'),
	}
	const document = {
		documentElement: root,
		activeElement: null,
		...record('document'),
	}
	return { document, window, viewport, root, fire }
}

function runInstallers(options) {
	const dom = fakeDom(options)
	const sandbox = {
		document: dom.document,
		window: dom.window,
		Element: FakeElement,
		Math,
		console,
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	const code = extractFunctions(source, INSTALLER_FUNCTIONS)
	vm.runInContext(code, sandbox, { filename: 'client.installers.js' })
	return { dom, sandbox }
}

test('键盘高度写成 --dsh-kb-inset，收起后归零（输入条不被键盘盖住）', () => {
	const { dom, sandbox } = runInstallers({ layoutHeight: 844, viewHeight: 844 })
	vm.runInContext('installKeyboardDock()', sandbox)
	assert.equal(dom.root.style.values.get('--dsh-kb-inset'), '0px', '初值必须是 0')
	assert.equal(dom.root.attributes.has('data-dsh-keyboard'), false)

	// 键盘弹出：布局视口不动，只有视觉视口缩到 508
	dom.viewport.height = 508
	dom.fire('viewport', 'resize')
	assert.equal(dom.root.style.values.get('--dsh-kb-inset'), '336px')
	assert.equal(dom.root.attributes.has('data-dsh-keyboard'), true, '键盘态要给 CSS 一个钩子')

	// 键盘刚露头（20px）：高度照跟，但 safe-bottom 先别撤——动画第一帧撤掉会白跳 30px
	dom.viewport.height = 824
	dom.fire('viewport', 'resize')
	assert.equal(dom.root.style.values.get('--dsh-kb-inset'), '20px')
	assert.equal(dom.root.attributes.has('data-dsh-keyboard'), false, '没盖住手势条之前不撤 safe-bottom')

	// 键盘收起
	dom.viewport.height = 844
	dom.fire('window', 'resize')
	assert.equal(dom.root.style.values.get('--dsh-kb-inset'), '0px')
	assert.equal(dom.root.attributes.has('data-dsh-keyboard'), false)

	// 捏合放大不是键盘：缩放 ≠ 1 时一律不顶
	dom.viewport.scale = 2
	dom.viewport.height = 422
	dom.fire('viewport', 'resize')
	assert.equal(dom.root.style.values.get('--dsh-kb-inset'), '0px', '放大时不能把输入条顶飞')
})

test('触摸输入条以外就收键盘，输入条内和它自己的弹层不算', () => {
	const { dom, sandbox } = runInstallers({ coarse: true })
	vm.runInContext('installComposerDismiss()', sandbox)

	const editor = new FakeElement(['.uV2eYG_root', ':editor'])
	dom.document.activeElement = editor

	// 手指落在正文里（准备滚页面）→ 收键盘
	dom.fire('document', 'pointerdown', { target: new FakeElement() })
	assert.equal(editor.blurred, 1, '触摸正文应该 blur 输入条')

	// 点输入条自己（换行、发送、模型选择）→ 不能收
	dom.fire('document', 'pointerdown', { target: new FakeElement(['.uV2eYG_root']) })
	assert.equal(editor.blurred, 1)

	// 点输入条的浮层（指令 / @ 文件菜单）→ 不能收
	dom.fire('document', 'pointerdown', { target: new FakeElement(['[role="menu"]']) })
	assert.equal(editor.blurred, 1)

	// 焦点本来就不在输入条上：什么都不用做
	dom.document.activeElement = new FakeElement()
	dom.fire('document', 'pointerdown', { target: new FakeElement() })
	assert.equal(editor.blurred, 1)
})

test('桌面指针（鼠标）不接管失焦', () => {
	const { dom, sandbox } = runInstallers({ coarse: false })
	vm.runInContext('installComposerDismiss()', sandbox)
	const editor = new FakeElement(['.uV2eYG_root', ':editor'])
	dom.document.activeElement = editor
	dom.fire('document', 'pointerdown', { target: new FakeElement() })
	assert.equal(editor.blurred, 0, '鼠标滚轮/点选不该被抢走焦点')
})

test('apply 挂上键盘与收键盘两条 effect（漏挂就等于没修）', () => {
	const exports = loadBundle().factory(fakeRequire)
	const labels = []
	const ctx = {
		slots: { inject: (_name, setup) => setup(), register: () => () => {} },
		effect: (_cleanup, label) => labels.push(label),
	}
	exports.apply(ctx)
	assert.ok(labels.includes('remote-panel: keyboard dock'), '少了 keyboard dock effect')
	assert.ok(labels.includes('remote-panel: composer dismiss'), '少了 composer dismiss effect')
})

test('输入条浮在正文上方：不再走「fixed 座位 + 正文让位」那条旧链路', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	// 旧链路：把座位改成 fixed、正文用 margin 让出 composer 高度 —— 卡片上沿会切出一道硬边
	assert.equal(source.includes('margin-bottom: calc(var(--dsh-composer-height'), false, '正文不该再让出 composer 高度')
	assert.equal(source.includes('[data-content-phase="active"] .wSkVaW_composerSeat {'), false, '座位不该再被外壳改成 fixed')
	// 新链路：键盘只让滚动区让位，座位保持原生 sticky 浮在内容上
	assert.ok(source.includes('margin-bottom: var(--dsh-kb-inset, 0px)'), '键盘高度要让滚动区让开')
	assert.ok(source.includes('html[data-dsh-keyboard] .wSkVaW_composerSeat'), '键盘态要收掉 safe-bottom 的白缝')
})

// ---------------------------------------------------------------- 手机抽屉

test('抽屉取代整屏翻页：旧 pager 必须整体消失', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	const exports = loadBundle().factory(fakeRequire)
	assert.equal(exports.pager, undefined, 'pager 导出必须删掉')
	assert.equal(exports.components.PagerSheet, undefined, 'PagerSheet 必须删掉')
	assert.equal(/dsh-pager|dsh-page-console|installPager/.test(source), false, '翻页轨道与接缝的残留都要清干净')
	assert.ok(source.includes('data-qzsy-drawer'), '抽屉要靠自己打的结构标记定位')
	assert.equal(source.includes('dsh-drawer-backdrop'), false, '整屏会话层不该再挂遮罩（浮层才需要）')
})

test('抽屉只用宿主稳定契约：toggleSidebar + data-sidebar-collapsed', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	assert.ok(source.includes('layout?.toggleSidebar?.()'), '开合必须走宿主的 layout API')
	assert.ok(source.includes("'data-sidebar-collapsed'"), '折叠状态认宿主的属性，不认哈希类名')
	assert.ok(source.includes("[data-shell-overlay]"), 'frame 用 data-shell-overlay 定位')
	// 抽屉这条链路上不该再出现哈希类名
	const drawerBlock = source.slice(source.indexOf('function installDrawer'), source.indexOf('function installBackGuard'))
	assert.equal(/class\*=|_sidebarCol|_frame/.test(drawerBlock), false, '抽屉实现里不能再有哈希类名兜底')
})

test('apply 挂抽屉 + 返回守卫两条 effect，翻页那条消失', () => {
	const exports = loadBundle().factory(fakeRequire)
	const labels = []
	const ctx = {
		slots: { inject: (_name, setup) => setup(), register: () => () => {} },
		layout: {},
		sessions: {},
		uiSession: {},
		effect: (_cleanup, label) => labels.push(label),
	}
	exports.apply(ctx)
	assert.ok(labels.includes('remote-panel: drawer'), '缺了 drawer effect')
	assert.ok(labels.includes('remote-panel: back guard'), '缺了返回守卫 effect')
	assert.equal(labels.includes('remote-panel: pager'), false, 'pager effect 不该再挂')
})

test('手势：边缘右滑开、抽屉内左滑收、竖向滚动不误触', () => {
	const { swipe } = loadBundle().factory(fakeRequire).drawer
	// 左缘 28px 起手、横向 60px → 开
	assert.equal(swipe({ x: 12, y: 300, edge: true, inDrawer: false, open: false }, { x: 72, y: 306 }), 'open')
	// 正文中间起手同一个方向 → 不动（和正文横滑/代码块抢手势）
	assert.equal(swipe({ x: 160, y: 300, edge: false, inDrawer: false, open: false }, { x: 300, y: 306 }), null)
	// 抽屉开着、在里面往左划 → 收
	assert.equal(swipe({ x: 180, y: 300, edge: false, inDrawer: true, open: true }, { x: 90, y: 305 }), 'close')
	// 抽屉开着、往里（右）划 → 不动
	assert.equal(swipe({ x: 90, y: 300, edge: false, inDrawer: true, open: true }, { x: 180, y: 305 }), null)
	// 竖着滚列表：位移够了但方向不对 → 不动
	assert.equal(swipe({ x: 12, y: 300, edge: true, inDrawer: false, open: false }, { x: 70, y: 420 }), null)
	// 距离不够 → 不动
	assert.equal(swipe({ x: 12, y: 300, edge: true, inDrawer: false, open: false }, { x: 40, y: 302 }), null)
	// 数据不合法也不炸
	assert.equal(swipe(null, { x: 10, y: 10 }), null)
	assert.equal(swipe({ x: 1, y: 2 }, { x: Number.NaN, y: 3 }), null)
})
