# M2：手机端会话内体验

> 范围：只改 `lib/client.js`；本报告新增 `docs/m2-report.md`。
> 未改 `lib/index.js`、`lib/api.js`、`lib/probe.js`、`deploy/`、其他 docs / test 文件；未执行 `npm install`，未重启 `dsh-web` / `dsh-proxy`，未动 `~/.config/caddy/*`。
> 所有新规则都在既有的 `@media (max-width: 1023px)` 里；桌面 ≥1024px 不参与。

## 结论

390×844（DPR 1）实测：

| 项目 | 改前 | 改后 |
| --- | --- | --- |
| 顶栏标题可见宽度 | **104px**（标题需要 170px，被截断成「确认工作区…」） | **170px**（`scrollWidth == clientWidth`，完整显示） |
| 标题右侧动作条 | 110px（「N 个子智能体」文字） | 35px（spinner + 箭头） |
| 「更多操作 / 导出会话」工具条 | 36px + 20px margin-left | 隐藏（0） |
| 代码块字号 / 行高 | 11px / 19px | **13px / 20px** |
| 代码块复制按钮 | 原生 11px 文字按钮 | **48×28px** 的 `复制` 按钮，每个代码块 1 个 |
| 代码块横向滚动 | 原生 `overflow-x:auto`（`word-break:break-all`） | 保留 `overflow-x:auto`，长 token 不再从中间断行；长行实测 `scrollWidth 3131 / clientWidth 314` 可滚 |
| 表格 | 原生 `.tableScroll` 可滚 | 保留并加 `-webkit-overflow-scrolling:touch`；实测 319 / 380 |
| 图片 | 原生 markdown 图 `max-width:100%` + 自带点击放大 | 加 CSS 兜底；裸 `<img>` 兜底新标签打开原图（实测 1200×900 图被压到 314×314） |
| 页面横向溢出 | — | `document.documentElement.scrollWidth = 390`（无横向溢出） |

单测：`node --test test/client.contract.test.js` 4/4 通过；`npm test` 137 项、136 pass、0 fail、1 个既有 skip（`caddy.gate.test.js` 未设置 `CADDY_BIN`，与本改动无关）。

## 1. 会话内顶栏瘦身

先在 390 下量了真实 DOM（不是猜类名）：

```
header.wSkVaW_header
├─ .wSkVaW_headerLeading            → ☰（我们注入的 .dsh-mobile-hamburger）
└─ .wSkVaW_titleRow
   ├─ .wSkVaW_titleCluster          → flex:1
   │  ├─ .wSkVaW_crumbs            → 104px（标题被压到 104）
   │  └─ .wSkVaW_headerActions     → 110px（ZKlsPq_trigger「N 个子智能体」；有后台任务时还有 QsffPG_trigger）
   ├─ .wSkVaW_headerUtilities      → 36px + margin-left:20px（nL4_yW_moreButton「更多操作 / 导出会话日志」）
   └─ .wSkVaW_headerCorner         → 本 profile 为空
```

处理（全在 `@media (max-width: 1023px)`）：

```css
.wSkVaW_headerUtilities { display: none !important; }      /* 收掉「更多操作」/导出（桌面仍有） */
.wSkVaW_titleCluster { gap: 4px !important; }
.wSkVaW_headerActions { gap: 4px !important; }
.wSkVaW_crumbCurrent { max-width: 100% !important; }        /* 长标题吃满剩余宽度，而不是固定 220px */
.ZKlsPq_trigger { padding: 2px !important; gap: 3px !important; }
.ZKlsPq_trigger > span:not([class]) { display: none !important; }   /* 子智能体：只留 spinner + 箭头 */
.QsffPG_trigger { gap: 2px !important; padding: 2px !important; }
.QsffPG_count { display: none !important; }                          /* 后台任务文字 */
.QsffPG_trigger::after { content: attr(data-rp-jobs); /* 16px 数字角标 */ }
```

后台任务的数字不是写死的：`installContentEnhancements()` 从触发器的 `aria-label`（如「3 个后台任务」）提取数字写入 `data-rp-jobs`，CSS 用 `::after` 渲染成 16px 高的小角标；完整文案仍在 `aria-label` 里，点开还是原来的任务面板。合成触发器实测：`data-rp-jobs="3"`、`QsffPG_count` 为 `display:none`、`::after` 内容 `"3"`、宽 34px。

- 没有改任何 DSH 原生 DOM 结构；只是 CSS 显隐和 `data-*` 属性。
- 「新建对话」入口（顶栏右上角固定定位的 `.dsh-mobile-newchat`，＋）原样保留：390 实测仍为 `x=340, y=6, 40×40`。
- ☰ 不动：`x=10, w=40`。
- 桌面 1280 实测：`headerUtilities` 恢复 `display:flex`，子智能体文字恢复显示，新规则不生效。

## 2. 代码块与表格

### CSS（仅手机）

```css
.md-code-block { max-width: 100%; }
.md-code-block pre,
._markdown_1ypvv_5 pre {
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  font-size: 13px !important;
  line-height: 20px !important;
  word-break: normal;              /* 长 token 不再断词，改为块内横向滚动 */
}
.md-code-block pre code,
._markdown_1ypvv_5 pre code,
.md-code-block pre .line { font-size: 13px !important; line-height: 20px !important; }

._tableScroll_1ypvv_192 { max-width: 100%; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
```

说明：DSH 原生的 `pre` 已经是 `overflow-x:auto`，但配的是 `white-space:pre-wrap; word-break:break-all`，所以普通代码只会换行、永远不出现横向滚动。这里保留换行（手机读代码不丢上下文），只把 `word-break` 改成 `normal`：正常代码按空格换行，URL / base64 这类超长 token 会撑出代码块自己的横向滚动条，而不是把整页撑宽。

实测：
- 真实代码块（319 宽）：`clientWidth 319 / scrollWidth 319`，13px/20px，`overflow-x:auto`；
- 注入一条 400 字符单行代码块：`clientWidth 314 / scrollWidth 3131`，可横向滚动；
- 页面 `documentElement.scrollWidth = 390`，无整页横向滚动；
- 表格：`.tableScroll` 实测 `clientWidth 319 / scrollWidth 380`，父级 `overflow-x:auto`，页面仍是 390。

### 复制按钮（注入 DOM）

DSH 原生代码块其实自带一个「复制」：`div.md-code-block > div[data-code-block-banner] > div[class*="_action_"] > button[class*="_copyButton_"]`，但只有 11px 文字、手指很难点。处理：

- CSS 在手机上隐藏原生按钮：`.md-code-block [class*="_copyButton_"] { display:none !important; }`；
- `installContentEnhancements()` 用 `MutationObserver`（`requestAnimationFrame` 节流）扫描 `.md-code-block`，往 `[data-code-block-banner] [class*="_action_"]` 里追加：
  ```html
  <button class="dsh-code-copy" data-rp="rp-xxxxxx">复制</button>
  ```
  尺寸 `min-width:48px; min-height:28px`；点击后 `navigator.clipboard.writeText(pre.textContent)`，成功显示 1.2s「已复制」，失败静默（不 alert / 不打断）。
- **没有把 `pre` 包一层**：`pre` 是 React 管理的子节点，额外包 wrapper 后 React 卸载该子节点时会对着原父级 `removeChild`，可能抛 `NotFoundError`。按钮只是追加到 banner 的 action 容器末尾（React 不会清理不是它创建的尾节点），卸载代码块时随整块一起消失。
- 幂等：按 `action.querySelector('.dsh-code-copy[data-rp="<tag>"]')` 判重；Observer 反复触发也只会有 1 个。实测 10 个代码块 → 10 个按钮、每块最多 1 个；连续 12 次 DOM 变更后仍是 11 块 / 11 个按钮（含测试注入块），无叠加。
- 流式输出时 React 可能替换 `pre`：点击时用 `pre.isConnected ? pre : block.querySelector('pre')` 重新解析，避免复制到旧节点。
- 没有 banner 的 `pre`（少见）兜底：父节点临时 `position:relative`，右上角浮一个同款按钮；父节点原 `position` 记在 `data-rp-prev-position`，cleanup 还原。
- 复制实测：点第一个可见真实代码块，捕获到 86 个字符且与 `pre.textContent` 完全一致，按钮文案变「已复制」；原生按钮 `display:none`。

## 3. 图片与附件

```css
._markdown_1ypvv_5 img { max-width: 100% !important; height: auto !important; }
.Sixlwa_attachmentRow { max-width: 100%; min-width: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.Sixlwa_fileCard { flex: 0 1 240px; max-width: 100%; min-width: 0; }
.R_Yw7q_gallery { max-width: 100%; min-width: 0; }
```

- DSH 原生 markdown 图片已经包在 `button._imageButton_1ypvv_446`（`cursor: zoom-in`，点击打开自带大图查看层），所以**不重复接管**；CSS 再兜底 `max-width:100%; height:auto`。
- 对不在 `button` / `a` 里的裸 markdown `<img>`，脚本兜底 `window.open(src, '_blank', 'noopener,noreferrer')`，打开原图 URL。
- 实测：往 markdown 容器注入 1200×900 的图片，渲染为 **314×314**（容器 314 宽），`max-width` 计算值 `100%`；点击后 `window.open` 收到的就是原图 URL。
- 附件行：合成 3 张 240px 文件卡，`.Sixlwa_attachmentRow` 为 383 宽时 `scrollWidth == clientWidth == 383`、页面仍 390，不横向溢出；`flex:0 1 240px` 让卡片在更窄容器里可收缩。

## 4. 只在手机生效 / 幂等 / 可清理

- CSS 全部位于 `@media (max-width: 1023px)`；桌面规则块只有既有的隐藏我们自己的按钮。
- 脚本只通过 `matchMedia('(max-width: 1023px)')` 判断；非窄屏时 `enhance()` 直接 `removeOwned()`，不会留下注入元素或事件。
- `installContentEnhancements()` 返回 cleanup：断开 Observer、移除 `matchMedia` change 监听、删除所有 `[data-rp=tag]` 按钮、清掉复制反馈定时器、解绑图片点击、还原临时 `position`、删除 `data-rp-jobs`。
- 已通过 `ctx.effect(...)` 注册，HMR / 插件卸载会执行。
- HMR 接手：`installContentEnhancements()` 把 cleanup 句柄放在 `window.__DSH_REMOTE_PANEL_CONTENT_ENHANCEMENTS__`，新模块实例启动前先调用旧实例的 cleanup，避免热更新后两个 Observer 同时往页面里注入；cleanup 自身有 `disposed` 标记，重复调用是 no-op。
- 幂等/清理实测：
  - 12 次强制 DOM 变更后 11 块 / 11 按钮、每块最多 1 个；
  - 390 → 1280：注入按钮数 10 → **0**，原生复制按钮恢复 `display:block`、代码字号恢复 11px、顶部工具条恢复；
  - 1280 → 390：按钮重新注入 10/10，窄屏样式恢复；
  - 直接调用 cleanup：按钮 10 → **0**、`[data-rp-jobs]` / `[data-rp-zoom]` 均为 0、全局句柄被删除；之后再制造一次 DOM 变更，按钮仍为 0（Observer 确实已断开，不会重新注入）。

## 5. 验证方式与数据

一条 bash 内启动 headless Chrome（390×844、DPR 1、CDP），打开 `http://127.0.0.1:3080/?token=$T`，用 `Runtime.evaluate` 走真实 UI：点 `.dsh-mobile-hamburger` → 展开 `WorkSpace` 项目 → 点标题含「确认工作区新建对话方案」的会话（列表第一行是「新会话」空态，所以不是点第一行），再量：

```
标题: y=17 h=28 w=170, scrollWidth=170, clientWidth=170, text="确认工作区新建对话方案"
titleRow: x=50 w=280；headerActions: x=224 w=35；headerUtilities: w=0
header: 390×86（高度与改前一致）；☰ x=10 40×40；＋ x=340 40×40
code: 10 blocks / 10 copy buttons / max 1 per block；pre 13px/20px, overflow auto
table: .tableScroll clientWidth 319 / scrollWidth 380
image: 314×314 in 314 container, max-width 100%, click → 原图 URL
idempotency: 11 blocks / 11 buttons / maxButtonsPerBlock=1
cleanup: buttons 10 → 0, jobs/zoom attrs 0, global handle gone, 再变更仍为 0
desktop 1280: copy buttons 0, headerUtilities flex, pre 11px, native copy display block
```

截图：`/tmp/m2.png`（会话顶部）、`/tmp/m2-code.png`（代码块 + 复制按钮）、`/tmp/m2-desktop.png`（1280 桌面）。验证脚本在 `/tmp/m2-verify.mjs`，未放进仓库。

单测：
- `node --test test/client.contract.test.js` → 4/4；
- `npm test` → 137 tests, 136 pass, 0 fail, 1 skip（`caddy.gate.test.js` 的既有 skip，依赖 `CADDY_BIN`）。

## 6. 已知限制

1. 顶栏的「更多操作 / 导出会话日志」在手机上被整组隐藏（这是给标题让出宽度的代价）。桌面不受影响；如果以后要手机导出，需要另做一个入口，而不是把这组工具条加回来。
2. 子智能体 chip 只剩 spinner + 箭头，具体「N 个子智能体」要展开菜单才能看到（`aria-label` 仍完整）；后台任务 chip 只显示数字角标，单位「个后台任务」被省略。
3. `.wSkVaW_headerUtilities` 是整组隐藏：以后如果有别的插件往这个 slot 注入工具，手机上也会一起被隐藏。
4. CSS 依赖当前 DSH 版本的部分 hash 类名（`_markdown_1ypvv_5`、`_tableScroll_1ypvv_192`、`Sixlwa_attachmentRow`、`R_Yw7q_gallery`、`QsffPG_*`、`ZKlsPq_*`）；DSH 升级后 hash 可能变：
   - 复制按钮注入用的是 `.md-code-block` + `[data-code-block-banner]`（非 hash 属性），仍会注入，但原生 11px 按钮如果类名变了就不会被隐藏，可能出现两个「复制」；
   - 代码字号/表格/附件兜底样式可能失效。届时按新版类名补一行即可，不影响已有功能。
5. `pre` 仍是原生换行（`pre-wrap`），不是强制单行横向滚动；只有超长不可断 token（URL、base64 等）才会触发块内横向滚动。如果希望所有代码都单行滚动，需要再加 `white-space:pre`（本轮没有改，避免影响桌面/普通代码阅读）。
6. 复制只走 `navigator.clipboard.writeText`：非安全上下文、旧 WebView 或用户拒绝剪贴板权限时会静默无动作（按需求「失败时静默」）。没有用 `execCommand` 兜底，避免旧接口带来的额外复杂度。
7. 图片：原生 markdown 图由 DSH 自带的大图查看层接管，我们只对「不在 button/a 里的裸图」兜底新标签打开；如果 DSH 以后去掉原生预览，需要把兜底扩展到所有 markdown 图。
8. 只在 headless Chrome 390×844 上验证，未上真机 / iOS WebView；`env(safe-area-inset-*)` 等仍由 M1 外壳负责，本轮没有改动。
