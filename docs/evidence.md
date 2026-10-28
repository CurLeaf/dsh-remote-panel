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

设置面板实测文本（六块齐全、无控制台错误）：

```
控制面 v0.1.0 · 运行 1592s
数据面 未部署 · 回填框
配对 需要先部署
来源白名单 读取 Caddyfile 失败：ENOENT（未部署，预期）
自检 布局 canary 命中 / 版本一致 / 上游 DSH 可达
部署向导 六字段 + 高级选项
```

控制面 API（带注入令牌）：`/status` → `{ok:true,version:"0.1.0",deployed:false}`，
`/defaults` → `{user:"yxw",port:8710,lanCidr:"192.168.1.94/24"}`，`/pair` → 400（未部署），
不带令牌 → 403。

安装过程中实机暴露并修掉的三个 bug：
1. 客户端模块 `id` 必须是**包名**，写成 `remote-panel` 会「loaded without registering」，整个 SPA 启动失败；
2. `ctx.layout` 未在 `inject` 声明会抛异常，两个插槽组件崩溃；
3. 批量替换把「IP 冲突提示」那行同时插进了 DataPlaneCard 与 AllowlistCard，
   而只有 Wizard 声明了 `warning` 状态 → 设置面板整块 `ReferenceError` 后空白。

第 3 条已由新增的「设置分区组件浅渲染」测试兜住：假 `jsx` 会真正调用函数组件，
Panel → 六张卡全部走一遍渲染。

> 仍未覆盖：手机真机上的触摸与软键盘行为。

## 尚未覆盖

- **H1 组件渲染**：apply() 与 CSS 已在真实页面验证，但 `.dsh-mobile-bar` 由框架渲染组件产生，
  需插件装载后才能看到。
- 真机触摸/键盘行为（输入框不被顶飞）。
- `I1` 三层门禁的跨设备实测。

复验时把上面第二段的 CDP 脚本重跑一遍，四个数字没变即说明选择器仍然可用。

## 2026-10-28 · 面板令牌改为持久化

现象：DSH 重启后，已打开的面板全部 403 `panel token missing or invalid`。

原因：令牌原先每进程 `randomBytes` 生成，重启即换新；页面不会自己刷新。

改法：令牌落到 `$DSH_HOME/remote-panel-token`（0600），启动时读、缺失才生成。
验证：服务端带令牌 200 / 不带 403；落盘文件 33 字节、权限 `-rw-------`；
两次调用返回同一值（测试覆盖）。删文件等价于「作废所有已打开页面」。

## 2026-10-28 · 首次真机部署（本机）

结果：EasyTier 入网成功，Caddy 起来后虚拟网内 `healthz=200`、门禁 `401`。

```
10.140.140.223/24  dsh-linux   Local
10.140.140.1/24    VM-0-14-tencentos  p2p  25.5ms  udp,tcp,ws
```

踩到并修掉的一个坑：**apt 安装 caddy 会顺手启一个系统级 `caddy.service`**，
它占住 `127.0.0.1:2019` 管理端口，导致用户级实例无限重启
（`starting caddy administration endpoint: bind: address already in use`）。
部署脚本已加：装完包后若发现 `caddy.service` 处于 enabled/active，就停用它。

另一个坑：网卡名默认值不确定，本机已有 `tun0`（Karing）与 `tailscale0`。
脚本已强制 `--dev-name dshmesh0`，实测新建的 `dshmesh0` 与 `tun0`、`tailscale0` 并存且互不影响。

## 2026-10-28 · 配对令牌取到了上一个进程的

现象：手机经反代打开 `?token=…` 一直 401，而同一个 URL 用 curl 也是 401。

根因：DSH 带 `--public-url` 启动后，日志里打印的令牌 URL 变成
`http://10.140.140.223:8710/?token=…`（反代端口），但 `/pair` 仍按 `:3080` 过滤，
于是匹配到**重启前那条旧记录**，二维码里装的是过期令牌。

修法：端口不再写死（同时接受 upstream 与反代端口），并且逐个候选**向 DSH 实探**
（`GET /?token=…` 期望 303），取第一个真正有效的；全失败才退回最新一条。
实测：正确令牌 `303 → 200`，旧令牌 `401`。

另：手机实际拿到的是 `10.140.140.2`（不是 README 里规划的 `.221`），
第一次请求被 `403 source not allowed` 挡下——白名单已补 `.2`、`.221`、`.222`。

## 2026-10-28 · 手机扫码头必现 401 的根因

现象：手机扫码后停在 `dsh web authentication required`，但桌面直接打开同一链接正常。

排查（无头 Chrome 复现，用 127.0.0.1:8799 的页面做跨站跳转）：

| 场景 | 结果 |
|---|---|
| CDP 直接导航到组合链接 | ✅ 正常进入 |
| 由另一个站点的页面 `location.replace(combo)` | ❌ `/` 返回 401 |
| 随后地址栏回车（浏览器自身导航） | ✅ 正常进入 |

抓请求头可见：401 那次只带了 `dsh_gate`，**没有** `dsh-auth-*`；而同一时刻
`/favicon.ico`（同站子资源）却带上了两个 Cookie。Cookie jar 里两个都在。

结论：DSH 的会话 Cookie 是 `SameSite=Strict`，而**跨站发起的顶层导航不会携带它**。
扫码打开正是跨站发起，所以第一跳必 401；地址栏回车属于浏览器自身导航，故能进。

修法：配对链接改走 `/pair` 路径，Caddy 先种门禁 Cookie 并返回一个**同源小页面**，
由该页面 `location.replace('/?token=…')` 再跳一次——这一次是同站发起，Cookie 会被带上。
实测：跨站入口直接落到 Harness 界面，无需手动回车。
