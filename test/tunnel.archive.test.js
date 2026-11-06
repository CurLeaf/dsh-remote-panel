import assert from 'node:assert/strict'
import { mkdtempSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createArchiveIndex, filterSessionList } from '../lib/tunnel/archive.mjs'

function payload(ids) {
	return {
		type: 'server-response',
		rpcId: 'x',
		result: {
			ok: true,
			value: {
				items: ids.map((id) => ({ sessionId: id, updatedAt: 1, projections: { values: { title: id } } })),
			},
		},
	}
}

test('剔除已归档会话，保留顺序与其余字段', () => {
	const doc = payload(['a', 'b', 'c', 'd'])
	const out = filterSessionList(Buffer.from(JSON.stringify(doc)), new Set(['b', 'd']))
	assert.equal(out.removed, 2)
	assert.equal(out.kept, 2)
	const parsed = JSON.parse(out.body.toString())
	assert.deepEqual(parsed.result.value.items.map((i) => i.sessionId), ['a', 'c'])
	assert.equal(parsed.rpcId, 'x', 'rpcId 必须原样保留，客户端靠它对响应')
	assert.equal(parsed.result.value.items[0].projections.values.title, 'a', '其余字段不能被裁掉')
})

test('归档集合为空时不动响应', () => {
	const out = filterSessionList(Buffer.from(JSON.stringify(payload(['a']))), new Set())
	assert.equal(out, null)
})

test('没有需要剔除的也不重写', () => {
	const out = filterSessionList(Buffer.from(JSON.stringify(payload(['a', 'b']))), new Set(['zzz']))
	assert.equal(out.removed, 0)
	assert.equal(out.kept, 2)
})

test('形状不认识就返回 null（交给调用方原样转发）', () => {
	assert.equal(filterSessionList(Buffer.from('not json'), new Set(['a'])), null)
	assert.equal(filterSessionList(Buffer.from('{"result":{}}'), new Set(['a'])), null)
	assert.equal(filterSessionList(Buffer.from('{"result":{"value":{"items":{}}}}'), new Set(['a'])), null)
})

test('归档集合按 mtime 缓存，文件变了才重读', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dsh-arch-'))
	const file = join(dir, 'workspace.json')
	writeFileSync(file, JSON.stringify({ global: { archivedSessionIds: ['a'] } }))

	const errors = []
	const index = createArchiveIndex({ path: file, onError: (m) => errors.push(m) })
	assert.deepEqual([...index.ids()], ['a'])

	writeFileSync(file, JSON.stringify({ global: { archivedSessionIds: ['a', 'b'] } }))
	// 同一毫秒内写文件时 mtime 可能不变，显式往前挪一点
	const future = new Date(Date.now() + 2000)
	utimesSync(file, future, future)
	assert.deepEqual([...index.ids()].sort(), ['a', 'b'])
	assert.equal(errors.length, 0)

	// 文件消失：沿用上一次的集合，并报一次错
	unlinkSync(file)
	assert.deepEqual([...index.ids()].sort(), ['a', 'b'])
	assert.equal(errors.length, 1)
})
