import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { mutateAllowlist, parseEntries, validateEntry, withEntry } from '../lib/allowlist.js'

const caddyfile = `{
	admin off
}

:8710 {
	@lan remote_ip 127.0.0.1 ::1 192.168.1.0/24 10.140.140.223
	handle @lan {
		handle /healthz {
			respond "ok" 200
		}
	}
}
`

test('解析出四条来源', () => {
	assert.deepEqual(parseEntries(caddyfile), ['127.0.0.1', '::1', '192.168.1.0/24', '10.140.140.223'])
})

test('新增一条', () => {
	const next = withEntry(caddyfile, '10.140.140.221', 'add')
	assert.ok(parseEntries(next).includes('10.140.140.221'))
	assert.equal(parseEntries(next).length, 5)
})

test('重复新增不产生重复项', () => {
	const next = withEntry(caddyfile, '10.140.140.223', 'add')
	assert.equal(parseEntries(next).length, 4)
})

test('删除一条', () => {
	const next = withEntry(caddyfile, '10.140.140.223', 'remove')
	assert.ok(!parseEntries(next).includes('10.140.140.223'))
})

test('删空时报错', () => {
	const single = ':8710 {\n\t@lan remote_ip 127.0.0.1\n}\n'
	assert.throws(() => withEntry(single, '127.0.0.1', 'remove'), /不能为空/)
})

test('找不到 @lan 行时明确报错', () => {
	assert.throws(() => withEntry(':8710 {\n}\n', '1.2.3.4', 'add'), /找不到/)
})

test('条目格式校验', () => {
	assert.equal(validateEntry('10.0.0.1'), '10.0.0.1')
	assert.equal(validateEntry('10.0.0.0/8'), '10.0.0.0/8')
	assert.equal(validateEntry('fd7a::1'), 'fd7a::1')
	assert.throws(() => validateEntry('10.0.0.1 rm -rf'), /格式不合法/)
	assert.throws(() => validateEntry(''), /为空/)
})

test('条目变多也保持一行（Caddy 不接受同名 matcher 定义两次）', () => {
	let text = caddyfile
	for (const ip of ['10.140.140.2', '10.140.140.3', '10.140.140.4', '10.140.140.5']) {
		text = withEntry(text, ip, 'add')
	}
	const lines = text.split('\n').filter((line) => line.includes('@lan remote_ip'))
	assert.equal(lines.length, 1)
	assert.equal(parseEntries(text).length, 8)
})

test('放行全部来源需要二次确认', () => {
	assert.throws(() => validateEntry('0.0.0.0/0'), /二次确认/)
	assert.equal(validateEntry('0.0.0.0/0', { force: true }), '0.0.0.0/0')
})

test('mutateAllowlist 真实写盘并留备份', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-caddy-'))
	const dir = join(home, '.config', 'caddy')
	try {
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, 'Caddyfile'), caddyfile)
		const result = mutateAllowlist({ entry: '10.140.140.221', mode: 'add', home })
		assert.equal(result.changed, true)
		assert.ok(readFileSync(`${result.path}.bak`, 'utf8').includes('10.140.140.221') === false)
		assert.ok(readFileSync(result.path, 'utf8').includes('10.140.140.221'))
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})
