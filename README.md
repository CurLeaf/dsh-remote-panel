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

三个部件、一条边界：

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

## 手机 App（WebView 壳）

PWA「安装应用」在国行 Android 上装不成：WebAPK 打包依赖 Google Play 服务，且打包服务器要能从公网
访问源站（我们是内网 IP）。所以仓库里带了一个极简 WebView 壳：

```bash
./android/build.sh            # 需要 ANDROID_HOME（build-tools 34 + platform 34）与 JDK 17
# 产物：android/dsh-pocket.apk
```

- 启动地址是 `/remote-panel/app/go.html`：插件每次启动时重写这一页，写入当前令牌，
  先种门禁 Cookie 再跳首页，所以壳里不用登录；
- `network_security_config` 显式信任 **user CA**，否则 WebView 不认装在用户凭据里的 Caddy 根证书；
- 装好后的 APK 放在 `~/.dsh/remote-panel-app/dsh.apk`，手机直接访问
  `https://<ip>:8710/remote-panel/app/dsh.apk` 下载安装即可。

## 手机 App 化

- **iPhone / iPad**：浏览器「分享 → 添加到主屏幕」，从桌面图标打开就是无地址栏的全屏。
  （iOS 不认 manifest 的 display，靠注入的 `apple-mobile-web-app-capable` + `apple-touch-icon`。）
- **Android**：真正「安装应用」需要 HTTPS；没有 HTTPS 时用 **设置 → 远程访问 → 手机全屏 → 进入全屏**
  （Fullscreen API，隐藏浏览器 UI）。
- 配套优化：`viewport-fit=cover` + 安全区（刘海 / Home 指示条）、`interactive-widget=resizes-content`
  （键盘挤压布局而不是盖住输入条）、`theme-color`（深浅两套）、`overscroll-behavior: none`（无下拉刷新）。

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
