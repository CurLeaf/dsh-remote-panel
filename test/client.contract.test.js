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
		return { useCallback: () => {}, useEffect: () => {}, useState: () => [] }
	}
	if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
	throw new Error(`unexpected require: ${id}`)
}

test('bundle 以 remote-panel 装载', () => {
	const entry = loadBundle()
	assert.equal(entry.id, 'remote-panel')
	assert.equal(typeof entry.factory, 'function')
})

test('factory 返回 { inject, apply }', () => {
	const exports = loadBundle().factory(fakeRequire)
	assert.deepEqual(Array.from(exports.inject), ['slots'])
	assert.equal(typeof exports.apply, 'function')
})

test('apply 注册 settings.section 分区', () => {
	const exports = loadBundle().factory(fakeRequire)
	const registrations = []
	const ctx = {
		slots: {
			inject(name, setup) {
				assert.equal(name, 'settings.section')
				return setup()
			},
			register(registration, component) {
				registrations.push({ registration, component })
				return () => {}
			},
		},
	}
	exports.apply(ctx)

	assert.equal(registrations.length, 1)
	const [{ registration, component }] = registrations
	assert.equal(registration.name, 'settings.section')
	assert.equal(registration.id, 'remote-panel')
	assert.equal(registration.label(), '远程访问')
	assert.equal(typeof component, 'function')
})
