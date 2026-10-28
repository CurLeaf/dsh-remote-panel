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
| `403 source not allowed` | 来源不在白名单 | 面板「来源白名单」加设备，或在家连 Wi-Fi |
| `401 access key required` | 缺门禁 Cookie | 用 `?k=` 那条链接重开一次 |
| `401 dsh web authentication required` | 已到 DSH，缺令牌 | 用 `?token=` 那条链接重开一次 |
| `/healthz` 返回 200 | 链路本身健康 | 问题在认证层，不在网络层 |
| 手机「一直连接中」 | 系统浏览器会周期性切断 WebSocket | 换 Chrome |
| 能 ping 通但页面转圈 | 代理软件（如 Karing）抢走了 EasyTier 流量 | 给中继地址加「直连」规则 |
| 面板报 `no route: GET /doctor` | Host 侧代码在内存里，加路由后没重启 | `systemctl --user restart dsh-web` |

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
