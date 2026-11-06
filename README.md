# dsh-remote-panel

让**手机/平板**安全地打开你这台机器上的 DeepSeek Harness —— 同一份会话、同一批工具、同一台机器。

这个包只做**控制面**：部署向导、状态面板、一键配对。
真正转发流量的 Caddy 与组网的 EasyTier 是独立进程，插件不监听任何端口。

---

## 快速开始（5 分钟）

```bash
dsh plugin --profile web add dsh-remote-panel
```

1. 重启 DSH，打开 **设置 → 远程访问**。
2. 填三个字段：中继地址、网络名、网络密钥（其余用默认值）。
3. 点「生成部署脚本」，复制整块任务，交给目标机器的 AI 执行。
4. 脚本最后会打印 `DSH_REMOTE_OK ...`，贴回面板。
5. 面板出二维码：手机先扫**门禁**，再扫**令牌**，然后直接开地址。

之后手机重开浏览器无需再登录：门禁 Cookie 一年，DSH Cookie 30 天。

---

## 架构

```
手机 / 平板 ──EasyTier── 10.x.x.x:8710 ──► Caddy ──► 127.0.0.1:3080 (DSH)
                             │  来源白名单 + 口令门禁        │  只监听回环，不对外
                             └  用户级服务，无 root          └  通过 --trusted-host 接受该 authority
```

三个部件、一条边界（另一条 **公网隧道** provider 见下一节）：

| 部件 | 职责 | 权限 |
|---|---|---|
| **Caddy**（用户级 systemd） | 白名单、口令门禁、转发、WS、压缩 | 无 root |
| **EasyTier**（system systemd） | 虚拟组网，唯一需要 TUN 的部件 | root |
| **本插件** | 检测、生成脚本、配对、状态 | 与应用同权限 |

### 为什么不做成一个插件

- EasyTier 要建 TUN、改路由，**必须** root，进不了用户态插件。
- 插件生命周期等于应用生命周期 —— 而你在应用崩了/重启时**最需要**远程访问。
- 若把反代也塞进进程，就得自己实现 TLS/WS/门禁，等于把成熟的 Caddy 换成几百行自研代码。

---

## 公网隧道 provider（dsh-tunnel）

上面那套是「组网 + Caddy」：手机要装 EasyTier、加入虚拟网络才能连。这套是另一条：
**一个公网 HTTPS 地址直接打开**，手机什么都不用装。

```
手机浏览器 ──TLS(h2)──▶ 中继 43.x:443 ──SNI 盲转──▶ Host agent ──HTTP──▶ 127.0.0.1:3080
                                                        │
                                                        └ 门禁 + 边缘层（缓存/压缩/h2 终结）
```

**agent 的源码就在本插件里**（`lib/tunnel/`），而中继（VPS 侧：SNI 分流、设备台账、控制台、证书）
在 [`../dsh-tunnel/`](../dsh-tunnel/)。这边是唯一的 Host 侧真源，升级就是升级插件本身。

注意「代码在插件里」不等于「进程在插件里」：agent 仍是独立的用户级 systemd 单元，
DSH 崩了/重启时远程入口照样在——这正是它不能塞进进程的原因（见上一节）。

| 文件 | 作用 |
|---|---|
| `lib/tunnel/agent.mjs` | 出网回连中继、双通道、TLS 终止、设备配对 |
| `lib/tunnel/edge.mjs` | TLS 之后的 HTTP 终结：ALPN 分流、门禁、反向代理、缓存语义 |
| `lib/tunnel/config.mjs` | agent 配置与启动期校验（只读环境变量，不留运行期兜底） |
| `deploy/templates/tunnel-agent.service.tmpl` | 用户级 systemd 单元 |
| `deploy/templates/tunnel-install.sh.tmpl` | 幂等安装脚本 |
| `lib/deploy/tunnel-cli.mjs` | `install` / `status` / `print` |

### 安装与升级

```bash
# 第一次：给参数，之后会落到 ~/.config/dsh-tunnel/agent.json（0600）
RELAY_URL=wss://relay.<域>/agent \
TUNNEL_HOSTNAME=home.<域> \
GATE_KEY=<门禁口令> \
CONSOLE_URL=https://admin.<域>/ \
npm run tunnel:install

npm run tunnel:status    # 单元状态 + 最近日志 + 公网探活
npm run tunnel:print     # 只渲染，不落盘
```

升级插件后重跑 `tunnel:install` 即可：单元里的路径不变，等价于刷新单元并重启。
（旧的 `dsh-tunnel-agent.service` 已经移除，不再有第二份 agent 代码或第二条启动路径。）

### 验证

```bash
GATE=<门禁口令> npm run tunnel:verify                       # 打真实公网入口，9 项
DSH_COOKIE='dsh-auth-...=v1...' node test/tunnel/edge.mjs   # 边缘层单测（11 项，含取消流后存活）
KEY=<口令> TOKEN=<token> CDP=http://127.0.0.1:9222 npm run tunnel:measure
```

### 边缘层（agent 里，TLS 之后）

TLS 在 Host 终止，之后**不再是字节管道**，而是一个真正的反向代理（`lib/tunnel/edge.mjs`）：

```
浏览器 ──TLS(h2 或 1.1, ALPN 协商)──▶ agent
                                   ├─ alpn=h2   → http2 server ─┐
                                   └─ 其余      → http server  ─┤（WebSocket 走这条）
                                                                ▼
                                                    门禁 → 反向代理 → 127.0.0.1:3080
```

为什么必须这样：

- **6 条连接的天花板**。字节管道下，一条浏览器连接换一条上游连接，HTTP/1.1 同源只有 6 条。
  首屏 5.7MB 的插件包会把会话列表这种小请求堵在队列里十几秒——手机上就是「半天转圈」。
  改成 h2 后小响应各自成流，不再排队。
- **缓存语义得有人补**。DSH 给内容寻址的 `/assets/*` 没发缓存头，`/dsh-genui/runtime.js`
  （6MB）写死 `no-cache` 又没有 ETag。边缘层补：前者 `immutable`，后者持有内容算强 ETag，
  之后每次进入只花一个 304 往返（约 150 字节），顺带用 brotli 出 1.27MB（原 gzip 1.7MB）。
- **上游就是本机回环，不需要连接池**。实测 100 条请求池化 71~108ms、每次新建 90~94ms，
  收益为零，却会撞上 DSH 的 5s keepalive 关闭竞态（复用正要被对端关掉的 socket → 请求挂住）。

行为约定：

| 场景 | 结果 |
|---|---|
| 门禁未通过 | 401（浏览器要 HTML 就给能输口令的页面，其余给一行文本） |
| `?k=<口令>` | 303 + 一年期 `dsh_gate` Cookie，同时带上 `/?token=` 少一跳 |
| PWA 资源（manifest / sw.js / 图标 / version.json） | 免门禁，边缘直出 |
| `/app.apk` | 必须带 Cookie 或 `?k=`，否则 403/401 |
| `/assets/*` 命中 `名字-8位hash.ext` | 补 `immutable, max-age=31536000` |
| `/dsh-genui/runtime.js` | 强 ETag + 304；br / gzip 按 `accept-encoding` 出 |
| SSE（`/plugins/events`） | 边到边转发，不缓冲 |
| WebSocket（`/api/remote.mux`） | 走 http/1.1 分支，`upgrade` 后裸管道 |

慢请求（>1.5s）会打一行日志，标明「上游首字节 / 全程 / 字节数」，用来区分慢在边缘→上游还是边缘→浏览器。

## 手机监看：执行处置台

窄屏（≤1023px）把它整页化，和对话并排：**对话看意图，这一屏看执行，并且能当场处置**。

**看见**
- **会话总览**：所有会话一屏，按「等你处理 → 完成未读 → 卡住（>3 分钟无动作）→ 运行中 → 空闲」排序，
  标出当前监看的是哪条；点一行就切过去。数据来自 `sessions.list` + `uiSession.sessionStatus`。
- **调用链时间线**：每一步展开是 `时间 · 工具名 · 摘要 · 耗时/状态`，`bash / read / edit` 走专用渲染，
  `web_search / grep / subagent / mcp__* / job_*` 等其余工具走通用行；每步头显示「N 次调用」「耗时 X」和进度条，超过 3 分钟标「卡住」。
- **步骤来源**：优先 `todo/write` 的待办；没有待办时按 turn 分步。

**处置**
- **接管 / 停止**：点「接管」真的 `session.cancel()` 当前 turn，再点「释放」恢复。
- **补充指令**：短语 chips（继续 / 先停下 / 只看不改 / 换个方案）直接 `session.prompt([{type:'text'}], 'queue')` 发进会话，
  没有步骤的新会话也能用。
- **审批（批准 / 拒绝）**：见下面「手机审批桥」。默认**不接管**任何会话，桌面审批照旧；
  只有你在手机上把某会话的「手机批准」打开，它的审批才会停下来等你点。

**接力与通知**
- **断点接力**：「标记待处理」把「第几步、什么内容」写进宿主 `$DSH_HOME/remote-panel/relay.json`；
  桌面在 **设置 → 远程访问 → 手机断点** 里能看到，并可「处理掉」。
- **通知**：页面在后台且待批数增加时弹系统通知。安卓壳（APK）走前台服务 + 原生通知通道，
  浏览器走 PWA `Notification`（需要授权）。

**构建**

```bash
npm run build:console        # 监看面板产物：lib/client.console.<hash>.js（哈希写回 lib/client.js）
ANDROID_HOME=$HOME/Android/Sdk ./android/build.sh   # 安卓壳 APK（不需要 Gradle）
npm run verify:live          # 重启 dsh web 后跑一遍真机验收（13 项 PASS/FAIL）
```

> 已知边界：验收页的「接受 / 打回」还没有服务端语义，实时模式下这两个页签不出现；真实会话也没有预览地址。
> 手机审批桥只在被接管的会话上拦截，超时 120 秒回 `unavailable`（fail closed），不会把 turn 挂死。

## 可选 HTTPS（内部 CA）

默认是明文 HTTP。要装成 Android 独立应用，勾上向导里的「启用 HTTPS」重新部署即可，其余不变：

- Caddyfile 会变成 `10.140.140.223:8710 { tls internal … }`，`auto_https` 从 `off` 改成
  `disable_redirects`——**`off` 会把证书自动化一起关掉**，`tls internal` 就签不出证书（实测握手
  `no certificate available`）。
- 站点地址必须带 IP：内部 CA 按名字签，空 host 的 `:8710` 签不出来；签出来的是
  `IP Address:10.140.140.223` 的证书。
- 配对二维码/链接、安装脚本打印的地址、面板里的地址都会跟着变成 `https://`。

手机第一次要信任根证书：面板「远程访问 → 手机全屏」里有 **下载根证书**（`/remote-panel/app/ca.crt`，就是
Caddy 的 `pki/authorities/local/root.crt`）。

- Android：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书。
- iOS：下载后到 设置 → 通用 → 关于本机 → 证书信任设置 里打开信任。

## 已知限制（有意为之 / 待后续）

| 项 | 现状 | 说明 |
|---|---|---|
| APK 签名 | debug keystore | 自己侧载够用；要公开分发需换正式签名并保留密钥 |
| APK 更新 | 重新下载覆盖安装 | 面板「手机 App」卡里有下载入口；没有应用内自动更新 |
| APK 与口令 | 壳内置门禁口令 | 换了口令要重新构建壳（`./android/build.sh [server] [key]`） |
| DSH 升级 | hash 类名可能变 | 有契约自检（面板「外壳适配」灯），失配会显红而不是静默错位 |
| 崩溃上报 | 无 | 壳里失败会显示错误文本；日志只有控制台 |
| 无障碍 | 部分 | 抽屉没有焦点陷阱；aria 只覆盖了注入的按钮 |

## 安全模型：令牌只在门禁之后

手机端有两道门：Caddy 的口令门禁（`dsh_gate` Cookie）+ DSH 自己的会话令牌。两者的取用顺序是：

```
扫码/点链接 → /pair?k=口令（种门禁 Cookie） → /remote-panel/login（要 Cookie，Caddy 直接发）
            → /?token=…（换取 DSH 会话）
```

- 二维码里**只有口令**，没有令牌；
- 带令牌的跳转页 `login.html` 放在门禁**之后**，没有 Cookie 拿不到（实测 401）；
- 免鉴权的 `/remote-panel/app/*` 只放静态资源（manifest / 图标 / 根证书 / APK），不含任何凭据；
- 旧版 APK 的入口 `go.html` 已改成「请更新」提示页，不会再泄露令牌。

APK 里内置了门禁口令（启动即过 `/pair`），所以**换口令后需要重新构建壳**。

## 手机 App（WebView 壳）

PWA「安装应用」在国行 Android 上装不成：WebAPK 打包依赖 Google Play 服务，且打包服务器要能从公网
访问源站（我们是内网 IP）。所以仓库里带了一个极简 WebView 壳：

```bash
./android/build.sh            # 需要 ANDROID_HOME（build-tools 34 + platform 34）与 JDK 17
# 产物：android/dsh-pocket.apk
```

- 启动地址是 `/pair?k=口令`：先种门禁 Cookie，再由 `/remote-panel/login`（带当前令牌）跳首页，壳里不用登录；
- **0.3.2 起**：主文档加载失败会自动重试 2 次，仍失败则显示带「重试」按钮的失败页；
  401/403（登录/门禁失效）直接给「登录已过期」页，点一下就重新走登录链路，不用杀进程；
- **0.3.3 起**：
  - 软键盘改为壳内消费 `WindowInsets.Type.ime()`：`decorFitsSystemWindows(false)` 会让
    `adjustResize` 失效，旧版键盘会直接盖住输入条；现在按帧跟随键盘动画给 WebView 加底部内边距，
    并把页面 `--dsh-safe-bottom` 临时归零，避免键盘上方多出一条 48px 空白；
  - 首帧前盖一层同色（`#151517`）占位页 +「正在连接…」，WebView 冷启动不再闪白；
  - 401/403 先静默重走一次 `/pair`（`gateRetried` 只走一次），失败才落到「登录已过期」页；
- `network_security_config` 显式信任 **user CA**，否则 WebView 不认装在用户凭据里的 Caddy 根证书；
- 插件包与前端资源由 Service Worker 缓存（只缓存 `/plugins/*`、`/assets/*`，URL 自带版本），
  WebView 的 HTTP 缓存被系统清掉也不用重下；`?nosw=1` 可一键注销；
- 装好后的 APK 放在 `~/.dsh/remote-panel-app/dsh.apk`，手机直接访问
  `https://<ip>:8710/remote-panel/app/dsh.apk` 下载安装即可。

## 手机 App 化

- **iPhone / iPad**：浏览器「分享 → 添加到主屏幕」，从桌面图标打开就是无地址栏的全屏。
  （iOS 不认 manifest 的 display，靠注入的 `apple-mobile-web-app-capable` + `apple-touch-icon`。）
- **Android**：真正「安装应用」需要 HTTPS；没有 HTTPS 时用 **设置 → 远程访问 → 手机全屏 → 进入全屏**
  （Fullscreen API，隐藏浏览器 UI）。
- 配套优化：`viewport-fit=cover` + 安全区（刘海 / Home 指示条）、`interactive-widget=resizes-content`
  （键盘挤压布局而不是盖住输入条）、`theme-color`（深浅两套）、`overscroll-behavior: none`（无下拉刷新）。
- 手机是三屏连滑：**非对话（监看/收件箱） · 对话 · 会话列表**，中间那屏是对话。
  往右滑露左边一屏，往左滑露右边一屏；三屏都是整屏，跟着手指 1:1 走，抬手按惯性落到某一页。
  没有遮罩、没有圆角、没有投影——那是抽屉的语言，翻屏只有页与页之间一道很窄的接缝。
  两端是 iOS 那种橡皮筋（越拉越沉，永远拉不出一整屏）。左右各 24px 让给系统返回手势；
  判轴要求横向明显大于纵向（横 10px 起判、`|dx| ≤ |dy|×1.2` 判成竖划），
  所以竖着滚正文/列表时斜着划不会把屏拽走。手势只在 `≤1023px` 生效。
- ☰ 不再是「弹抽屉」，而是往左翻到会话列表那一页；点会话行会自动翻回对话并进那个会话。
- 系统返回键：在任何非对话页按一下先翻回对话，再按才退出页面。
- **外壳靠语义钩子认，不靠哈希类名**：frame 用宿主的 `[data-shell-overlay]` 反查，侧栏折叠认
  frame 上的 `data-sidebar-collapsed`，认出来之后写自己的 `data-rp-frame` / `data-rp-page="chat|sessions"`，
  CSS 与手势只认这两个标。宿主换类名前缀不会整片失效；真找不到语义钩子才退回 `_frame` / `_sidebarCol`
  这套哈希类名，并把来源上报给面板（「外壳契约 · 类名兜底」亮黄灯）。

## 安全模型

三层，从外到内：

1. **虚拟网**：只有入网设备可达。
2. **来源白名单**：Caddyfile 里的 `@lan remote_ip`，其余一律 `403 source not allowed`。
3. **口令门禁**：`?k=` 换一张一年期 Cookie，缺了返回 `401 access key required`。

再往里才是 DSH 自己的令牌与 30 天签名 Cookie。

> ⚠️ 会话默认 `danger-full-access` 且不弹审批：**拿到入口就等于能在这台机器上执行任意命令**。口令不要外发。

面板自身的 API 另有一道独立令牌：每进程随机生成，随 index 注入，请求必须带 `x-dsh-remote-panel` 头。

---

## 故障速查

四段状态码，四个方向：

| 现象 | 含义 | 处置 |
|---|---|---|
| 连接被拒绝 | 网络层或 Caddy 没起 | `systemctl --user status dsh-proxy`、`easytier-cli peer` |
| `403 source not allowed` | 来源不在白名单 | 面板「来源白名单」加设备；若手机组网地址变过（.2 → .3），确认名单里有组网网段 `10.x.0.0/24` |
| `401 access key required` | 缺门禁 Cookie | 用 `?k=` 那条链接重开一次 |
| `401 dsh web authentication required` | 已到 DSH，缺令牌 | 用 `?token=` 那条链接重开一次 |
| `/healthz` 返回 200 | 链路本身健康 | 问题在认证层，不在网络层 |
| 手机「一直连接中」 | 系统浏览器会周期性切断 WebSocket | 换 Chrome |
| 能 ping 通但页面转圈 | 代理软件（如 Karing）抢走了 EasyTier 流量 | 给中继地址加「直连」规则 |
| 面板报 `no route: GET /doctor` | Host 侧代码在内存里，加路由后没重启 | `systemctl --user restart dsh-web` |
| 面板报「面板令牌不匹配」 | 页面是重启前打开的（令牌已持久化，理论上不该再出现） | 硬刷新；仍不行就删 `~/.dsh/remote-panel-token` 让两边都换新 |

面板「自检」里的**布局 canary** 用来发现 DSH 升级导致的选择器失配；「复制诊断包」导出的 JSON 已剔除口令与密钥。

---

## 兼容性

| 项 | 范围 |
|---|---|
| DSH | `>= 0.2.1-rc.3`（`engines.dsh`） |
| 系统 | Linux + systemd（v1 只做这一种） |
| 架构 | x86_64 / aarch64 |
| 反代端口 | 非特权端口（默认 8710），因此 Caddy 无需 root |
| EasyTier | 固定 `2.6.4`，`--tcp-whitelist` 走运行时探测 |

---

## 卸载

```bash
# 数据面
sudo bash dsh-remote-panel.sh --uninstall
# 控制面
dsh plugin --profile web remove dsh-remote-panel
```

`--uninstall` 会停并删两个单元与配置，**不删**二进制（可能被别的用途复用）。

公网隧道那条另算：

```bash
systemctl --user disable --now dsh-remote-panel-tunnel
rm -f ~/.config/systemd/user/dsh-remote-panel-tunnel.service
rm -rf ~/.config/dsh-tunnel          # 设备令牌与证书缓存
systemctl --user daemon-reload
```

---

## v1 不做

Windows / macOS 服务管理 · 从零搭建 EasyTier 共享节点 · 多机集中管理 · TLS/PWA · 消息推送。

---

## 开发

```bash
npm test          # node --test，81 条（80 通过 + 1 条未设置 CADDY_BIN 时跳过）
```

提交约定：一个功能点一个 commit，清单见 [docs/checklist.md](docs/checklist.md)。

浏览器里才能确认的部分（移动端外壳、三层门禁）见 [docs/verify.md](docs/verify.md)。

```bash
CADDY_BIN=/path/to/caddy npm test   # 额外跑真实 Caddy 的门禁语义测试
```

## 许可

Apache-2.0
