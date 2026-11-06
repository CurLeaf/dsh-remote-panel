/**
 * 插件版本：唯一来源是 package.json，其他地方一律从这里取。
 */
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const VERSION = pkg.version
