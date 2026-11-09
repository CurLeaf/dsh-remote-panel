import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/**
 * 三屏外壳的结构契约：把「哪个子元素是会话页 / 对话页」这条判断钉死。
 *
 * 背景：三屏靠 frame 的直接子元素先后顺序认页（侧栏 → 对话）。DSH 0.2.2 的窄屏
 * 改成真抽屉后，frame 里多了 drawerMask（排在最前）和 leadingSeat（排在最后），
 * 位置识别整体错位 —— 会话页认成遮罩、对话页认成侧栏，翻页翻的都不是该动的节点，
 * 对话列被留在 0 宽，整屏黑。这类回归只看「类名前缀还在不在」的体检是查不出来的，
 * 必须在结构层面钉住。
 */
function loadExports() {
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
	return loaded[0].factory((id) => {
		if (id === 'react') return { useCallback: (fn) => fn, useEffect: () => {}, useState: (v) => [v, () => {}] }
		if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
		throw new Error(`unexpected require: ${id}`)
	})
}

function shellOf() {
	const exports = loadExports()
	assert.equal(typeof exports.shell?.pick, 'function', '外壳挑页函数必须露出来给测试用')
	// SHELL_EXTRA 全是纯属性选择器：元素带其中任一属性就算「固定件」，跳过
	const extra = [...exports.shell.extra.matchAll(/\[(data-[a-z-]+)\]/g)].map((match) => match[1])
	const child = (name, attrs = []) => ({ name, matches: () => attrs.some((attr) => extra.includes(attr)) })
	return { shell: exports.shell, extra, child }
}

test('固定件标记包含 0.2.2 新增的抽屉遮罩与 leading 座位', () => {
	const { shell, extra } = shellOf()
	for (const marker of ['data-sidebar-mask', 'data-shell-leading']) {
		assert.ok(extra.includes(marker), `SHELL_EXTRA 必须排除 [${marker}]`)
	}
	// 老标记不能丢
	for (const marker of ['data-rightbar-col', 'data-shell-bottom', 'data-shell-overlay']) {
		assert.ok(extra.includes(marker), `SHELL_EXTRA 丢了 [${marker}]`)
	}
})

test('0.2.1 及以前：侧栏 + 对话 + 右栏 + 底行 + 浮层', () => {
	const { shell, child } = shellOf()
	const side = child('sidebarCol')
	const chat = child('centerCol')
	const picked = shell.pick([
		side,
		chat,
		child('rightbarCol', ['data-rightbar-col']),
		child('bottomRow', ['data-shell-bottom']),
		child('overlayLayer', ['data-shell-overlay']),
	])
	assert.equal(picked?.side, side)
	assert.equal(picked?.chat, chat)
})

test('0.2.2 抽屉形态：遮罩排在侧栏前面、leading 座位排在最后，都必须跳过', () => {
	const { shell, child } = shellOf()
	const side = child('sidebarCol')
	const chat = child('centerCol')
	const picked = shell.pick([
		child('drawerMask', ['data-sidebar-mask']),
		side,
		chat,
		child('rightbarCol', ['data-rightbar-col']),
		child('bottomRow', ['data-shell-bottom']),
		child('overlayLayer', ['data-shell-overlay']),
		child('leadingSeat', ['data-shell-leading']),
	])
	assert.equal(picked?.side.name, 'sidebarCol', '会话页不能认成遮罩')
	assert.equal(picked?.chat.name, 'centerCol', '对话页不能认成侧栏')
})

test('缺少一个固定件也不影响选页（先后顺序才是唯一依据）', () => {
	const { shell, child } = shellOf()
	const side = child('sidebarCol')
	const chat = child('centerCol')
	const picked = shell.pick([child('drawerMask', ['data-sidebar-mask']), side, chat])
	assert.equal(picked?.side, side)
	assert.equal(picked?.chat, chat)
})

test('子元素不足两页时返回 null，交给 class 兜底', () => {
	const { shell, child } = shellOf()
	assert.equal(shell.pick([child('drawerMask', ['data-sidebar-mask'])]), null)
	assert.equal(shell.pick([]), null)
})

test('样式层：抽屉形态的网格不许把对话列压成 0 宽，抽屉遮罩与宿主按钮要收掉', () => {
	const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	// 停靠形态沿用「侧栏占第一列」，抽屉形态必须把 1fr 让给第二列（对话）
	assert.match(
		source,
		/\[data-rp-frame\]\[data-sidebar-drawer\][^}]*grid-template-columns:\s*0\s+minmax\(0,\s*1fr\)\s+0\s*!important/,
		'抽屉形态必须写 0 / minmax(0,1fr) / 0',
	)
	// 宿主的抽屉遮罩、左上角开抽屉按钮都要在手机上收掉，否则和翻页/本插件的 ☰ 打架
	assert.match(source, /\[data-sidebar-mask\]\s*\{\s*display:\s*none\s*!important/, '抽屉遮罩要在手机上隐藏')
	assert.match(source, /\[data-shell-leading\]\s*\{\s*display:\s*none\s*!important/, '宿主自带的开抽屉座位要在手机上隐藏')
})
