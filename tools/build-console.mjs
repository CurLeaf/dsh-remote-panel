// 把 console/ 的源码打成 dsh-remote-panel 的 package-local chunk。
// 产物 lib/client.console.js 由 lib/client.js 里的 require.async('./client.console.js') 懒加载。
import { createHash } from 'node:crypto'
import { accessSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const candidates = [
  process.env.ESBUILD,
  join(root, 'node_modules/.bin/esbuild'),
  '/home/yxw/WorkSpace/dsh-browser-studio/node_modules/.bin/esbuild',
]
const esbuild = candidates.find((file) => {
  if (!file) return false
  try { accessSync(file); return true } catch { return false }
}) ?? 'esbuild'

const raw = readFileSync(join(root, 'console/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// keyframes 改名，避免和宿主全局动画撞名
const frames = new Set()
let css = raw.replace(/@keyframes\s+([\w-]+)/g, (m, name) => {
  frames.add(name)
  return `@keyframes pc-${name}`
})
for (const name of frames) {
  css = css.replace(new RegExp(`(animation(?:-name)?\\s*:[^;{}]*)\\b${name}\\b`, 'g'), `$1pc-${name}`)
}

// 所有选择器收进 .pc 作用域
const scopeSelector = (sel) => {
  const s = sel.trim()
  if (s === '') return s
  if (s === ':root' || s === 'html' || s === 'body') return '.pc'
  if (s.startsWith('.pc')) return s
  return `.pc ${s}`
}

function transform(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const open = source.indexOf('{', i)
    if (open === -1) { out += source.slice(i); break }
    let depth = 1
    let j = open + 1
    while (j < source.length && depth > 0) {
      const ch = source[j]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      j++
    }
    const prelude = source.slice(i, open).trim()
    const body = source.slice(open + 1, j - 1)
    if (/^@media \(prefers-color-scheme: dark\)/.test(prelude)) {
      const dark = transform(body)
      out += `${prelude}{${dark}}`
      // DSH 主题由 body[data-ds-dark-theme] 驱动，媒体查询之外再给一份类名变体
      out += dark.replace(/\.pc(?=[\s.{,:])/g, '.pc.pc-dark')
    } else if (/^@(media|supports|container)/.test(prelude)) out += `${prelude}{${transform(body)}}`
    else if (/^@keyframes/.test(prelude)) out += `${prelude}{${body}}`
    else {
      const selectors = [...new Set(prelude.split(',').map(scopeSelector))].join(', ')
      out += `${selectors}{${body}}`
    }
    i = j
  }
  return out
}

let scoped = transform(css)
scoped += `
.pc{height:100%;min-height:0;overflow:hidden}
.pc .app{height:100%}
.pc-host{height:100%;min-height:0;display:flex}
.pc-host>.pc{flex:1;min-width:0}
`

const tmpJs = join(root, 'console/styles.generated.js')
writeFileSync(tmpJs, `export const CSS = ${JSON.stringify(scoped)}\n`)

execFileSync(esbuild, [
  join(root, 'console/entry.js'),
  '--bundle',
  '--format=cjs',
  '--external:react',
  '--minify',
  '--target=es2020',
  `--outfile=${join(root, 'lib/client.console.tmp.cjs')}`,
], { stdio: 'inherit' })

const bundle = readFileSync(join(root, 'lib/client.console.tmp.cjs'), 'utf8')
const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 8)
const fileName = `client.console.${hash}.js`
const wrapped = `window.__ModuleLoader__.load({id:"dsh-remote-panel",chunk:"${fileName}",factory(require){const module={exports:{}};const exports=module.exports;\n${bundle}\nreturn module.exports;}});\n`
writeFileSync(join(root, 'lib', fileName), wrapped)

// 清掉旧 chunk，只留当前这份
for (const file of readdirSync(join(root, 'lib'))) {
  if (/^client\.console(\.[0-9a-f]{8})?\.js$/.test(file) && file !== fileName) unlinkSync(join(root, 'lib', file))
}
unlinkSync(join(root, 'lib/client.console.tmp.cjs'))

// 入口里的占位符指向新文件名：入口内容变了，rev 才会变，chunk URL 才会跟着变
const clientPath = join(root, 'lib/client.js')
const client = readFileSync(clientPath, 'utf8')
writeFileSync(clientPath, client.replace(/const CONSOLE_CHUNK = '[^']*' \/\/ @console-chunk/, `const CONSOLE_CHUNK = './${fileName}' // @console-chunk`))
console.log('lib/' + fileName, Buffer.byteLength(wrapped), 'bytes')
