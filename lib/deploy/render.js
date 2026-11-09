/**
 * 部署模板渲染的最小工具：读一次模板、替换 `@@KEY@@`。
 *
 * 旧版 Caddy / EasyTier 的渲染器已随那套部署形态一起删除；
 * 现在只有 tunnel 一种产物，模板在模块加载时读一次，便于单测。
 */

import { readFileSync } from 'node:fs'

const TEMPLATE_DIR = new URL('../../deploy/templates/', import.meta.url)

const templates = new Map()

/** 读一次模板并缓存。 */
export function template(name) {
	let value = templates.get(name)
	if (value === undefined) {
		value = readFileSync(new URL(name, TEMPLATE_DIR), 'utf8')
		templates.set(name, value)
	}
	return value
}

const PLACEHOLDER = /@@([A-Z0-9_]+)@@/g

/**
 * 替换模板里的 `@@KEY@@`；有未提供或残留的占位符就直接失败。
 * @param {string} text
 * @param {Record<string, string|number>} vars
 */
export function fill(text, vars) {
	const out = text.replace(PLACEHOLDER, (match, key) => {
		if (!(key in vars)) throw new Error(`模板占位符未提供值：${key}`)
		return String(vars[key])
	})
	const leftover = [...out.matchAll(PLACEHOLDER)].map((match) => match[1])
	if (leftover.length > 0) throw new Error(`渲染后仍有未替换的占位符：${[...new Set(leftover)].join(', ')}`)
	return out
}
