# dsh-remote-panel

让**手机 / 平板**安全地打开你这台机器上的 DeepSeek Harness —— 同一份会话、同一批工具、同一台机器。

只有一条数据面：**公网隧道（dsh-tunnel）**。手机浏览器直接开一个 HTTPS 域名，
不装 VPN、不装根证书、不加入虚拟网络。旧版「EasyTier + Caddy + 回填码 + 白名单」整条链路已经删除，
面板里再也不会出现两套部署形态。

这个包只做**控制面**：部署向导、状态、配对二维码、诊断；它本身不监听任何端口。
真正转发流量的 agent 是独立的用户级 systemd 单元（`dsh-remote-panel-tunnel.service`），
所以 DSH 崩了 / 重启时，远程入口照样在。

---

## 架构

```
手机 ──TLS(h2)──▶ 中继 43.x:443 ──SNI 盲转──▶ Host agent ──HTTP──▶ 127.0.0.1:3080 (DSH)
                                                   │
                                                   └ 门禁 + 边缘层（缓存 / 压缩 / h2 终结）
```

```
插件（控制面，跑在 DSH 进程里）       agent（数据面，用户级 systemd）
  ├─ 生成安装脚本                       ├─ 出网回连中继（双通道）
  ├─ 状态探测 / 证书 / 门禁 / 上游      ├─ TLS 终止 + HTTP/2
  ├─ 配对二维码 + APK 下载              ├─ 门禁（?k= → 一年期 Cookie）
  └─ 诊断包                             └─ 反向代理 + 缓存语义
```

状态唯一真源是 `~/.config/dsh-tunnel/agent.json`（0600）：
面板读它显示状态，安装脚本写它，`tunnel:install` 也会更新它。
旧版的 `~/.dsh/remote-panel.json` 回填码 / 审计日志不再使用。

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 控制面 API + index 注入（令牌、manifest、viewport） |
| `lib/state.js` | 从 `agent.json` 读部署状态 |
| `lib/probe.js` | agent / 证书 / 门禁 / 上游 / 手机壳 五项探测 |
| `lib/pair.js` | 配对链接与二维码（只带门禁口令，不带令牌） |
| `lib/deploy/tunnel.js` | 渲染 systemd 单元 + 幂等安装脚本 |
| `lib/tunnel/agent.mjs` | 出网回连中继、TLS 终止、设备配对 |
| `lib/tunnel/edge.mjs` | 门禁、反向代理、PWA/APK 直出、缓存 |
| `lib/tunnel/archive.mjs` | 会话列表裁剪（去掉已归档会话） |
| `deploy/templates/*` | 单元与安装脚本模板 |

---

## 快速开始

```bash
dsh plugin --profile web add dsh-remote-panel
```

1. 重启 DSH，打开 **设置 → 远程访问**。
2. 填三项：中继地址（`wss://relay.<域>/agent`）、对外域名（`home.<域>`）、门禁口令。
3. 点「生成安装脚本」，把整段交给目标机器的终端 / AI 执行（用户级 systemd，不需要 root；幂等）。
4. 回到面板点「已执行，刷新状态」。
5. 面板出二维码：手机扫码 → 种一年期门禁 Cookie → 自动跳转换取 DSH 会话。

之后手机重开浏览器无需再登录（门禁 Cookie 一年，DSH Cookie 30 天）。

### 安装与升级（CLI）

```bash
RELAY_URL=wss://relay.<域>/agent \
TUNNEL_HOSTNAME=home.<域> \
GATE_KEY=<门禁口令> \
CONSOLE_URL=https://admin.<域>/ \
npm run tunnel:install

npm run tunnel:status    # 单元状态 + 最近日志 + 公网探活
npm run tunnel:print     # 只渲染，不落盘
```

升级插件后重跑 `tunnel:install` 即可：单元里的路径不变，等价于刷新单元并重启。

### 验证

```bash
npm test                                                    # 单元测试
npm run tunnel:accept                                       # 一键验收：结构 / 协议 / 会话列表 / 稳定性
GATE=<门禁口令> npm run tunnel:verify                        # 只打公网功能面
```

`tunnel:accept` 从 `~/.config/dsh-tunnel/agent.json` 读参数，自己用门禁口令换 Cookie，
跑完会重启一次单元验证恢复，最后打印逐项 PASS/FAIL。

---

## 边缘层（agent 里，TLS 之后）

TLS 在 Host 终止，之后**不是字节管道**，而是一个真正的反向代理：

```
浏览器 ──TLS(h2 或 1.1, ALPN 协商)──▶ agent
                                   ├─ alpn=h2   → http2 server ─┐
                                   └─ 其余      → http server  ─┤（WebSocket 走这条）
                                                                ▼
                                                    门禁 → 反向代理 → 127.0.0.1:3080
```

为什么必须这样：

- **6 条连接的天花板**。字节管道下，一条浏览器连接换一条上游连接，HTTP/1.1 同源只有 6 条；
  首屏几 MB 的插件包会把会话列表这类小请求堵十几秒——手机上就是「半天转圈」。
  h2 之后小响应各自成流，不再排队。
- **缓存语义要补**。DSH 给内容寻址的 `/assets/*` 没发缓存头，`/dsh-genui/runtime.js`
  （6MB）写死 `no-cache` 又没有 ETag；边缘层补 `immutable` / 强 ETag，重复进入只花一个 304。
- **上游就是本机回环**，不需要连接池（池化收益为零，还会撞上 keepalive 关闭竞态）。

| 场景 | 结果 |
|---|---|
| 门禁未通过 | 401（浏览器要 HTML 就给能输口令的页面，其余给一行文本） |
| `?k=<口令>` | 303 + 一年期 `dsh_gate` Cookie，同时跳 `/?token=` |
| PWA 资源（manifest / sw.js / 图标 / version.json） | 免门禁，边缘直出 |
| `/app.apk` | 必须带 Cookie 或 `?k=`，否则 403/401 |
| `/assets/*` 命中 `名字-8位hash.ext` | 补 `immutable, max-age=31536000` |
| `/dsh-genui/runtime.js` | 强 ETag + 304；br / gzip 按 `accept-encoding` 出 |
| `/api/session/list` | 剔掉已归档会话 |
| SSE（`/plugins/events`） | 边到边转发，不缓冲 |
| WebSocket（`/api/remote.mux`） | 走 http/1.1 分支，`upgrade` 后裸管道 |

慢请求（>1.5s）会打一行日志，标明「上游首字节 / 全程 / 字节数」。

---

## 面板

**未部署** → 一张「开始配置」卡：三个字段 → 安装脚本 → 「已执行，刷新状态」。

**已部署** → 运行状态 + 手机配对 + 手机 App：

| 灯 | 含义 |
|---|---|
| 隧道 agent | `dsh-remote-panel-tunnel.service` 是否 active |
| 证书 | 域名上 Let's Encrypt 证书的信任链 / SAN / 剩余时间（<2h 红） |
| 门禁 | 不带口令请求应得 401 且带 `access key required` |
| 上游 DSH | 本机 3080 应得 401 且带 `dsh web authentication required` |
| 手机壳 | `lib/assets/{app.apk,version.json}` 是否就位、大小是否一致 |
| 外壳适配 / 外壳契约 | 手机外壳还能不能认出 DSH 的语义钩子（DSH 升级后可自检） |

「复制诊断包」会带上 probe、单元状态和最近 40 行 agent 日志（不含口令）。

---

## 手机三屏

窄屏（≤1023px）把外壳摆成一条三页轨道，第三页就是桌面右栏整列：

| 页 | 内容 |
|---|---|
| 0 | 会话侧栏（工作区 / 会话列表） |
| 1 | 对话 |
| 2 | 面板（文件 / 终端 / Git / 浏览器 / 文档预览…） |

- 面板一打开就自动滑到第三页，收起时回到打开它的那一页。
- 两端是 iOS 那种橡皮筋；左右各 24px 让给系统返回手势；判轴要求横向明显大于纵向。
- ☰ 是往左翻到会话列表，不是弹抽屉；系统返回键先翻回对话，再按才退出。
- 横屏 / 平板（768~1023px）走宿主自己的停靠形态。

外壳靠语义钩子认（`[data-shell-overlay]`、`data-sidebar-collapsed`），认出来写自己的
`data-rp-frame` / `data-rp-page`；真找不到才退回哈希类名兜底，并在面板亮黄灯。

---

## 安全模型

两条边界：

1. **门禁**：`?k=` 换一年期 `dsh_gate` Cookie；没有 Cookie 一律 401。
2. **DSH**：会话令牌仍由 DSH 自己校验（`dsh-auth-*` Cookie / `?token=`）。

二维码里**只有门禁口令**，没有令牌；`/app.apk`、`/version.json`、manifest 由边缘直出或按口令放行。
APK 内置门禁口令，换口令后需要重新构建壳（`./android/build.sh [server] [key]`）。

---

## 手机 App（WebView 壳）

```bash
ANDROID_HOME=$HOME/Android/Sdk ./android/build.sh   # 产物：android/dsh-pocket.apk
```

- 启动地址是 `/?k=<口令>`：先种门禁 Cookie，再由边缘跳转换取 DSH 会话；401/403 会静默重试一次。
- 0.3.2 起：主文档加载失败自动重试，仍失败给带「重试」的失败页。
- 0.3.3 起：软键盘按帧挤压 WebView；首帧前同色占位；401/403 先重走一次门禁。
- 0.3.5 起：证书校验收紧为系统 CA（Let's Encrypt 直接可用，不用装根证书）；启动自动查更新。

装好的 APK 放在 `lib/assets/{app.apk,version.json}`，边缘用 `/app.apk`、`/version.json` 直出；
面板「手机配对」里有下载链接。

---

## 已知限制

| 项 | 现状 | 说明 |
|---|---|---|
| APK 签名 | debug keystore | 自己侧载够用；公开分发需换正式签名并保留密钥 |
| APK 自动更新 | 启动时查 `/version.json`，提示后跳浏览器下载 | 没有应用内静默安装 |
| APK 与口令 | 壳内置门禁口令 | 换口令要重新构建壳 |
| 中继重连后卡死 | 待查 | 2026-11-06 观察过一次：lane 被 1006 断开、2s 后重连成功，但 TLS 握手一度完不成；重启 agent 恢复 |
