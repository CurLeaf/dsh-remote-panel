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
	assert.deepEqual(Array.from(exports.inject), ['slots', 'layout'])
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

	const section = byName.get('settings.section')
	assert.equal(section.registration.id, 'remote-panel')
	assert.equal(section.registration.label(), '远程访问')
	assert.equal(typeof section.component, 'function')

	assert.equal(byName.get('shell.overlay').registration.id, 'remote-panel.mobile-bar')
	assert.equal(byName.get('conversation.header.leading').registration.id, 'remote-panel.hamburger')
})

test('设置分区组件浅渲染不抛错', () => {
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
	// 浅渲染：Panel 会把 StatusCard / DataPlaneCard / PairCard / AllowlistCard /
	// SelfCheckCard / WizardCard 全部调用一遍
	assert.doesNotThrow(() => components[0]({}))
})
