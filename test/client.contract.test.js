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
		'settings.section',
		'shell.overlay',
	])
	assert.deepEqual(
		registrations.map((entry) => entry.registration.id).sort(),
		['remote-panel', 'remote-panel.hamburger', 'remote-panel.new-chat', 'remote-panel.panels'],
	)

	const section = byName.get('settings.section')
	assert.equal(section.registration.id, 'remote-panel')
	assert.equal(section.registration.label(), '远程访问')
	assert.equal(typeof section.component, 'function')

	assert.equal(byName.get('conversation.header.leading').registration.id, 'remote-panel.hamburger')

	// 监看面板整体下线：main 槽位（key=pocket-console）和侧栏入口都不该再注册
	assert.equal(registrations.some((entry) => entry.registration.name === 'main'), false, '监看面板不许再占 main 槽位')
	assert.equal(
		registrations.some((entry) => entry.registration.name === 'sidebar.panellist'),
		false,
		'侧栏「监看」入口必须删掉',
	)

	// 第三屏的落地页挂在 shell.overlay 上：不占 main、不顶掉对话正文
	const panels = registrations.find((entry) => entry.registration.id === 'remote-panel.panels')
	assert.equal(panels.registration.name, 'shell.overlay')
	assert.equal(typeof panels.component, 'function')
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

// ---------------------------------------------------------------- 三屏翻页

test('翻页引擎带三页，第三页是面板落地页', () => {
	const exports = loadBundle().factory(fakeRequire)
	assert.equal(exports.pager.pages, 3, '轨道必须是三页')
	assert.equal(typeof exports.components.PagerPanels, 'function', '面板落地页要作为一个组件暴露出来')
	assert.equal(exports.components.PagerSheet, undefined, '旧的监看整屏页必须删掉')
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	assert.equal(source.includes('installDrawerSwipe'), false, '旧的跟手抽屉实现必须整体删掉，不能两套手势并存')
	assert.ok(source.includes("className: 'dsh-page-panels'"), '面板落地页要有自己的整屏层')
	assert.ok(source.includes("'dsh-pager-seam'"), '页与页之间要有接缝')
})

test('第三屏就是宿主右栏：翻页平移整列，面板开合自动翻页', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	// 第三页不能再自绘一个「监看」，必须是宿主的右栏轨道
	assert.ok(source.includes("querySelector('[data-rightbar-col]')"), '第三屏要认宿主的右栏容器')
	assert.ok(source.includes("setAttribute('data-rp-page', 'panels')"), '右栏要打上 panels 标')
	assert.ok(source.includes('data-sidebar-right-open'), '面板开合要认宿主的语义属性')
	assert.ok(source.includes("dispatchEvent(new Event('dsh-pager:panels'))"), '翻到第三页前要预挂落地页')
	// 面板入口不再靠拦截点击
	assert.equal(source.includes('pocket-console'), false, '监看面板的 id 不该再出现')
	assert.equal(source.includes('dsh-page-console'), false, '旧的监看整屏层不该再出现')
	assert.equal(source.includes('approvalsApi'), false, '手机审批桥已删除')
})

test('apply 只挂一条翻页 effect（旧抽屉那条必须消失）', () => {
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
	assert.ok(labels.includes('remote-panel: pager'), '缺了 pager effect')
	assert.equal(labels.includes('remote-panel: drawer swipe'), false, '旧抽屉手势的 effect 不该再挂')
})

test('橡皮筋：越界位移被压住，永远到不了一整屏', () => {
	const { rubber, unrubber } = loadBundle().factory(fakeRequire).pager
	const size = 390
	assert.equal(rubber(0, size), 0)
	// 拉出去 100px，视觉上只走一小半；拉得越狠越接近但永远小于一屏
	const soft = rubber(100, size)
	assert.ok(soft > 0 && soft < 60, `100px 的过冲应该压到 60px 以内，实际 ${soft}`)
	assert.ok(rubber(1000, size) < size, '橡皮筋永远到不了整屏')
	// 逆函数要能还原，否则「动画中段再抓住」会跳一下
	for (const over of [1, 12, 60, 200, 900]) {
		const visual = rubber(over, size)
		assert.ok(Math.abs(unrubber(visual, size) - over) < 1e-6, `unrubber(${visual}) 应该还原成 ${over}`)
	}
	assert.equal(rubber(-5, size), 0, '反向过冲不参与')
})

test('clamp / unclamp 在界内是恒等，界外才压缩', () => {
	const { clamp, unclamp } = loadBundle().factory(fakeRequire).pager
	const size = 390
	const pages = 3
	assert.equal(clamp(size, size, pages), size)
	assert.equal(clamp(2 * size, size, pages), 2 * size)
	assert.ok(clamp(-40, size, pages) < 0 && clamp(-40, size, pages) > -40)
	assert.ok(clamp(2 * size + 40, size, pages) > 2 * size)
	assert.ok(Math.abs(unclamp(clamp(-123, size, pages), size, pages) + 123) < 1e-6)
})

test('落点：慢慢拖过一半才翻，轻甩一下就翻', () => {
	const { settle } = loadBundle().factory(fakeRequire).pager
	const size = 390
	const pages = 3
	// 从对话页（1）往右拖：拖到 49% 松手、没有速度 → 弹回
	assert.equal(settle(size - 0.49 * size, 0, size, pages, 1), 1)
	// 拖过 51% → 翻到非对话页
	assert.equal(settle(size - 0.51 * size, 0, size, pages, 1), 0)
	// 只拖了 15%，但甩得很快（轨道速度 -2000px/s，往左页走）→ 仍然翻过去
	assert.equal(settle(size - 0.15 * size, -2000, size, pages, 1), 0)
	// 一次手势最多翻一页：从中页狂甩也只到相邻页。
	// 轨道速度为正 = 往右边那一页走（手指往左划），所以 +9000 落在会话列表、-9000 落在非对话
	assert.equal(settle(size, 9000, size, pages, 1), 2, '往左划 → 右边那页')
	assert.equal(settle(size, -9000, size, pages, 1), 0, '往右划 → 左边那页')
	// 两端夹住，不会翻到不存在的页
	assert.equal(settle(0, -9000, size, pages, 0), 0)
	assert.equal(settle(2 * size, 9000, size, pages, 2), 2)
})

test('桌面端不许给右栏写翻页位移（全屏面板被推出屏幕 = 灰屏）', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	const start = source.indexOf('const placePanels = ()')
	assert.notEqual(start, -1, 'placePanels 是右栏位移的唯一出口，改名字要同步改这个测试')
	const body = source.slice(start, start + 1100)
	assert.ok(body.includes('if (drag !== null) return'), '拖动中由 paint 负责，placePanels 别插一脚')
	assert.match(
		body,
		/if \(!narrow\.matches\) \{[\s\S]*?panels\.style\.transform = ''/,
		'桌面端（>1023）必须清掉列位移：否则全屏面板会被整体推到屏幕外，只剩灰底',
	)
})

// ---------------------------------------------------------------- 外壳语义钩子

test('外壳优先用语义钩子认，不靠哈希类名', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	// 三根柱子（frame / 侧栏 / 正文）的识别必须走宿主自己的 data-* 契约
	assert.ok(source.includes('[data-shell-overlay]'), '应该用 data-shell-overlay 找外壳')
	assert.ok(source.includes('data-sidebar-collapsed'), '折叠态应该认宿主的布尔属性')
	assert.ok(source.includes("setAttribute('data-rp-page', 'sessions')"), '侧栏应该打上自己的标')
	assert.ok(source.includes("setAttribute('data-rp-page', 'chat')"), '正文应该打上自己的标')
	// 哈希类名只能当兜底：出现「语义在前、类名在后」的降级链
	assert.ok(source.includes("source = 'class'"), '必须有退回哈希类名的兜底分支')
	// CSS 里也要认标，否则 JS 换了识别方式、样式还在靠哈希类名
	assert.ok(source.includes('[data-rp-page="sessions"]'), 'CSS 要认 data-rp-page')
	assert.ok(source.includes('[data-rp-frame]'), 'CSS 要认 data-rp-frame')
})

test('外壳契约来源会随自检上报（面板才能区分「语义钩子」和「哈希兜底」）', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	assert.ok(source.includes('JSON.stringify({ missing, shell })'), '上报里要带 shell 来源')
	assert.ok(source.includes('外壳契约'), '面板要有一行「外壳契约」')
	assert.ok(source.includes('外壳只能靠哈希类名认出来'), '退回哈希类名时要给出可见提示')
})
