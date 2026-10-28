# 实测证据

记录那些**只能靠真浏览器确认**的结论，以及得出它们的方法，方便日后 DSH 升级时重新验证。

## 方法

```bash
# 1. 从 journal 取当前进程令牌（只在本机、只读）
journalctl --user -u dsh-web -n 200 --no-pager -o cat | grep -o 'token=[A-Za-z0-9_-]*' | tail -1

# 2. 无头 Chrome 开 CDP，真实登录一次
chrome --headless=new --remote-debugging-port=9333 --remote-allow-origins='*' --user-data-dir=/tmp/probe

# 3. 用 CDP 注入 lib/client.js 里的 SHELL_CSS，再用 Emulation 切视口，读 computedStyle
```

被测环境：DSH `0.2.1-rc.3`，Chrome headless（`--headless=new`）。

## 2026-10-27 · 外壳 CSS 与选择器

### 选择器命中（390px，未装插件）

| 检查 | 结果 |
|---|---|
| `[class*="_frame"]` | 1 个，实际类名 `pI_x6G_frame` |
| `[class*="_sidebarCol"]` | 1 个 |
| `[class*="_centerCol"]` | 1 个 |
| `[class*="_collapsed"]` | 1 个（侧栏当前为折叠态） |

结论：README 里那套哈希前缀选择器在本版本依然成立。

### 390px 注入外壳 CSS 后

| 指标 | 期望 | 实测 |
|---|---|---|
| `grid-template-columns` | 单列 | `390px 0px 0px` |
| 正文宽度 | 铺满 | `390px`（不是 56px 竖条） |
| 正文 `padding-bottom` | 56px | `56px` |
| 底栏 display / 高度 | 显示 / 56 | `block` / `56` |
| 汉堡 display | 显示 | `inline-flex` |
| `html.dsh-drawer-open` 时底栏 | 隐藏 | `none` |

### 侧栏展开态

折叠：`display: none`，宽度 0。
展开（移除 `_collapsed` 标记后）：`position: fixed`、`left/top = 0`、`height = 844`（等于视口高）、`z-index = 900`。

> 展开时测到宽度 63px，是**人为移除类名**导致的：真实展开时宽度由应用自身状态决定，不归我们的 CSS 管。这里只验证「浮层化」的四条属性。

### 1281px（桌面）

| 指标 | 期望 | 实测 |
|---|---|---|
| 三列布局 | 原样 | `280px 1001px 0px` |
| 正文 `padding-bottom` | 0 | `0px` |
| 底栏 / 汉堡 | 不显示 | 均为 `none` |

结论：H5「桌面零影响」成立。

## 2026-10-27 · 门禁四条分支（真实 Caddy v2.11.7）

| 请求 | 结果 |
|---|---|
| `GET /healthz`（白名单内） | `200 ok` |
| `GET /`（无 Cookie） | `401 dsh-remote: access key required` |
| `GET /?k=wrong…` | `401` |
| `GET /?k=<正确口令>` | `303` + `Location: /` + `Set-Cookie: dsh_gate=<口令>` |
| 带 `dsh_gate=<口令>` 的 `GET /` | 透传到 DSH，返回 `401 dsh web authentication required` |
| 源地址改为 `127.0.0.2` | `403 dsh-remote: source not allowed` |

复现：`CADDY_BIN=/path/to/caddy npm test`（`test/caddy.gate.test.js`）。

## 2026-10-27 · EasyTier 发布包

| 架构 | 文件 | sha256 | HTTP |
|---|---|---|---|
| x86_64 | `easytier-linux-x86_64-v2.6.4.zip`（25M） | `61b659ea…09dfd6` | 200 |
| aarch64 | `easytier-linux-aarch64-v2.6.4.zip`（20M） | `f533ec25…c1a70f` | 200 |

两个哈希已写进 `lib/deploy/assets.js`，脚本下载后 `sha256sum -c` 校验；未收录的版本只告警不阻断。

## 2026-10-27 · 真实页面里的 apply()

方法：拦截 `window.__ModuleLoader__.load` 捕获本插件的 factory，传入手写的 react 桩，
在真实页面（已登录、390px）调用 `exports.apply(fakeCtx)`。

| 检查 | 结果 |
|---|---|
| 捕获到的 entry.id | `remote-panel` |
| `exports.inject` | `["slots"]` |
| 注册的插槽 | `shell.overlay` / `conversation.header.leading` / `settings.section` |
| `apply()` 抛错 | 无 |
| `<style id="dsh-remote-panel-shell">` | 已注入，942 字节 |
| 注入后 `_frame` 的 grid | `390px 0px 0px`（立即生效） |
| 控制台告警 | 无（说明 canary 判定为「已匹配」） |

结论：bundle 在真实页面的加载契约、canary 判定、CSS 注入与三处注册都成立。

## 2026-10-28 · 真实安装后的实机验证

`link:` 装进 web profile 并在设置里可见后，用同一套 CDP 探针实测：

| 检查 | 390px | 1281px |
|---|---|---|
| `_frame` 的 grid | `390px 0px 0px` | `280px 1001px 0px` |
| 正文宽度 | 390 | 1001 |
| 正文 `padding-bottom` | 56px | 0px |
| `.dsh-mobile-bar` | `flex` / 57px / 贴底 844 | `none` |
| `.dsh-mobile-hamburger` | `flex` | `none` |
| 控制台错误 | 0 | 0 |

控制面 API（带注入令牌）：`/status` → `{ok:true,version:"0.1.0",deployed:false}`，
`/defaults` → `{user:"yxw",port:8710,lanCidr:"192.168.1.94/24"}`，`/pair` → 400（未部署），
不带令牌 → 403。

安装过程中实机暴露并修掉的两个 bug：
1. 客户端模块 `id` 必须是**包名**，写成 `remote-panel` 会「loaded without registering」，整个 SPA 启动失败；
2. `ctx.layout` 未在 `inject` 声明会抛异常，两个插槽组件崩溃。

> 仍未覆盖：手机真机上的触摸与软键盘行为。

## 尚未覆盖

- **H1 组件渲染**：apply() 与 CSS 已在真实页面验证，但 `.dsh-mobile-bar` 由框架渲染组件产生，
  需插件装载后才能看到。
- 真机触摸/键盘行为（输入框不被顶飞）。
- `I1` 三层门禁的跨设备实测。

复验时把上面第二段的 CDP 脚本重跑一遍，四个数字没变即说明选择器仍然可用。
