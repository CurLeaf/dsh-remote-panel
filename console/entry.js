import { mountConsole as mount } from './app.js'
import { normalizeSession, parseExit, parseTests } from './live.js'
import { CSS } from './styles.generated.js'

const STYLE_ID = 'dsh-remote-panel/console'

/** 只注入一次样式；随页面存活。 */
function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-remote-panel'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** 挂载监看屏；返回卸载函数。 */
export function mountConsole(root, options) {
  ensureStyles()
  return mount(root, options)
}

export { normalizeSession, parseExit, parseTests }
