import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { loadOrCreateToken, tokenPath } from '../lib/token.js'

test('首次生成并落盘 0600', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-token-'))
	try {
		const value = loadOrCreateToken(home)
		assert.match(value, /^[A-Za-z0-9_-]{24,}$/)
		assert.equal(statSync(tokenPath(home)).mode & 0o777, 0o600)
		assert.equal(readFileSync(tokenPath(home), 'utf8').trim(), value)
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

test('再次调用返回同一个令牌（重启不影响已打开的页面）', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-token-'))
	try {
		const first = loadOrCreateToken(home)
		const second = loadOrCreateToken(home)
		assert.equal(first, second)
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

test('文件损坏时重新生成', () => {
	const home = mkdtempSync(join(tmpdir(), 'panel-token-'))
	try {
		writeFileSync(tokenPath(home), 'bad token with spaces')
		const value = loadOrCreateToken(home)
		assert.match(value, /^[A-Za-z0-9_-]{24,}$/)
	} finally {
		rmSync(home, { recursive: true, force: true })
	}
})

test('两个 home 互不干扰', () => {
	const a = mkdtempSync(join(tmpdir(), 'panel-token-a-'))
	const b = mkdtempSync(join(tmpdir(), 'panel-token-b-'))
	try {
		assert.notEqual(loadOrCreateToken(a), loadOrCreateToken(b))
	} finally {
		rmSync(a, { recursive: true, force: true })
		rmSync(b, { recursive: true, force: true })
	}
})
