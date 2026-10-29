# M3 报告：证书过期 / 续签失败自检

## 1. 结论

- 已新增**只读**证书探测：直接对 `<state.ip>:<state.port>` 做一次 TLS 握手，拿 Caddy 实际下发的叶子证书，
  判断「剩余时间 > 2 小时 + SAN 覆盖站点 IP」，结果挂在 `probe().cert`。
- `/probe`、`/diag` 能看到 `cert`；`/doctor` 会多一条 `tls.cert`（label「证书有效期」）check，
  剩余不足 2 小时时 state=`warn` 并带剩余小时数；`/status` 新增轻量 `tls` 字段（不发起网络探测）。
- 实测真实站点：`cert.ok=true`，`hoursLeft=10.5`，`expiresAt=2026-10-29T20:16:40.000Z`。
- **重要更正**：任务里预期的「约 2–3 小时」是按本地时间读 `notAfter` 得出的。
  Caddy 证书里的 `Oct 29 20:16:40 2026 GMT` 是 **UTC**，对应本地 `2026-10-30 04:16:40 CST`，
  实测（本地 17:47）剩余 **10.5 小时**，不是 2–3 小时。详见 §5。
- 本轮**没有重启** dsh-web / dsh-proxy（遵守约束）：当前线上面板进程（startedAt
  `2026-10-29T09:28:35.770Z`）仍在跑旧代码，`/status` 里还看不到 `tls`；
  新代码会在下一次 DSH 重启后生效（未执行）。

## 2. 背景与目标

Caddy 用内部 CA 给站点签 **12 小时**的叶子证书并自动续。续签失败（磁盘满、admin 接口挂掉、配置改坏）时，
手机会突然全部连不上；而现有探活用的是 `rejectUnauthorized:false`，**过期证书照样握手成功**，
所以面板一直显示健康——这是 M3 要补的可见性缺口。

## 3. 实现

### 3.1 `lib/probe.js`

新增（均为只读，不触发续签、不碰 Caddy admin API）：

| 导出 | 作用 |
| --- | --- |
| `CERT_WARN_HOURS = 2` | 剩余时间阈值（小时） |
| `probeCertificate({host, port, timeoutMs=2000, now, warnHours, peer})` | 一次 TLS 握手 + 判定；任何失败都折算成结果对象，**不抛异常** |
| `evaluateCertificate({cert, host, now, warnHours})` | 由 `valid_to` / SAN 计算 `{ok, expiresAt, hoursLeft, subject, san, reason?}` |
| `sanCovers(san, host)` | SAN 是否覆盖 host：`IP Address:x` / `DNS:x` / 单层通配符 `*.example.com` |
| `certCheck(cert, {deployed})` | 折成 `/doctor` 的一行 `{id:'tls.cert', label:'证书有效期', state, detail}` |
| `lastCertSnapshot()` | 最近一次 `probe()` 的证书结果副本，供 `/status` 读缓存（无网络） |

握手细节（`tlsPeerCertificate`）：

```js
tls.connect({ host: state.ip, port: state.port, servername: state.ip, rejectUnauthorized: false, timeout: 2000 })
// 成功后 getPeerCertificate()，取 valid_to / subjectaltname / subject.CN
```

- **必须连站点自己的 IP 并带 SNI**：Caddy 按 SNI 选站点，绕 `127.0.0.1` 或 SNI 写错会拿不到本站证书。
- 内部 CA 不在本机信任链里，所以不校验证书链（`rejectUnauthorized:false`），
  有效期与 SAN 由 `evaluateCertificate` 自己判。
- 2s 超时 + `error` 事件都收敛成 `{ok:false, reason:'TLS 握手失败：...'}`，不会把 `probe()` 打挂。
- `ok` 的判定：**剩余时间 > 2 小时** 且 **SAN 覆盖该 IP**（握手成功是前提）。
  顺序上先判过期，再判 SAN，最后判剩余时间。

`probe()` 集成：

- 证书探测与 `healthz` / `upstream` **并行**执行，最多多等 2s；
- 结果挂在 `probe.cert`；
- 未部署 / 缺站点 IP / 未启用 TLS（`deps.tls === false`，接口层用 `detectTls()` 传入）时
  不打网络，直接返回 `{ok:false, reason:'未部署' | '缺少站点 IP' | '未启用 TLS'}`；
- 部署存在时把结果写入模块内缓存 `lastCert`，未部署时清空。

`probe.ok` 的语义**保持不变**（仍是 easytier + caddy + healthz + upstream），
证书问题只体现在 `probe.cert` 和 `/doctor` 的 `tls.cert` 行——避免改变既有面板健康判定，
但续签失败已经能从这两个入口看到。是否把 cert 并入总 ok 可另行讨论。

### 3.2 `lib/index.js`

- `GET /probe`：`probe(state, {tls: detectTls()})`，原样返回 `probe.cert`。
- `GET /doctor`：在 `runDoctor()` 结果末尾**追加**一条 `tls.cert` check（`doctor.js` 本轮不可改，
  所以在接口层追加）。证书探测与静态体检并行；`detectTls()` 为 false 时不追加该行。
- `GET /diag`：直接复用 `probe.cert` 追加同一条 check，**不重复探测**。
- `GET /status`：新增

  ```json
  { "tls": { "enabled": true, "expiresAt": "…", "hoursLeft": 10.5 } }
  ```

  `enabled` 来自 `detectTls()`（读线上 Caddyfile 的 `tls internal`）；
  `expiresAt` / `hoursLeft` 只读 `lastCertSnapshot()` 缓存，**/status 里不做任何网络探测**，
  没探测过时只有 `{enabled}`。`enabled=false` 时即使有缓存也不报证书字段。
- `handleRequest(req, res, {token, probe?, certProbe?})`：新增两个可注入依赖，
  单测可以不碰真实网络/系统；路由上下文里同样带上它们。

## 4. 返回结构

`probe().cert`（`probeCertificate` 的返回值）：

```json
{
  "ok": true,
  "expiresAt": "2026-10-29T20:16:40.000Z",
  "hoursLeft": 10.5,
  "subject": "",
  "san": "IP Address:10.140.140.223",
  "reason": "ok=false 时才出现"
}
```

- `expiresAt`：ISO 8601 **UTC**（`Z` 结尾）；Caddy IP 站点通常 `subject` 为空、只有 SAN。
- `hoursLeft`：保留一位小数（可为负 = 已过期）。
- `reason`：`握手失败：…` / `证书已过期（…）` / `证书 SAN 不覆盖 …` / `证书剩余时间低于 2 小时` /
  `未部署` / `缺少站点 IP` / `未启用 TLS`。

`/doctor` 里的行：

```json
{ "id": "tls.cert", "label": "证书有效期", "state": "ok", "detail": "剩余 10.5 小时（2026-10-29T20:16:40.000Z 到期）" }
{ "id": "tls.cert", "label": "证书有效期", "state": "warn", "detail": "证书剩余时间低于 2 小时；剩余 1.2 小时" }
```

`/status` 里的 `tls`：

```json
{ "enabled": true }
{ "enabled": true, "expiresAt": "2026-10-29T20:16:40.000Z", "hoursLeft": 10.5 }
```

## 5. 实测

环境：站点 `10.140.140.223:8710`，线上 Caddyfile 含 `tls internal`。

任务要求的第一条验证命令（直接 import `lib/probe.js`，读真实状态文件）：

```bash
node -e "import('./lib/probe.js').then(async m => console.log(JSON.stringify(await m.probe(JSON.parse(require('fs').readFileSync(process.env.HOME+'/.dsh/remote-panel.json','utf8'))))))"
```

输出（本地 `2026-10-29 17:47 CST` / UTC `09:47`，`probe` 总耗时 **42ms**）：

```json
{"ok":true,"easytier":{"state":"active","sub":"running","ok":true},"caddy":{"state":"active","sub":"running","ok":true},"healthz":{"ok":true,"status":200,"body":"ok","scheme":"https"},"upstream":{"ok":true,"status":401},"cert":{"ok":true,"expiresAt":"2026-10-29T20:16:40.000Z","hoursLeft":10.5,"subject":"","san":"IP Address:10.140.140.223"}}
```

证书事实（`openssl s_client` 与 Node 双向核对）：

| 项 | 值 |
| --- | --- |
| notBefore | `Oct 29 08:16:40 2026 GMT` = `2026-10-29T08:16:40Z` = 本地 16:16:40 |
| notAfter | `Oct 29 20:16:40 2026 GMT` = `2026-10-29T20:16:40Z` = **本地 2026-10-30 04:16:40** |
| 有效期 | 12 小时（与背景一致） |
| SAN | `IP Address:10.140.140.223`（critical） |
| subject | 空 |
| issuer | `CN=Caddy Local Authority - ECC Intermediate` |
| 磁盘文件 | `~/.local/share/caddy/certificates/local/10.140.140.223/10.140.140.223.crt`，mtime `2026-10-29 16:16:40 +08:00` |

**关于「2–3 小时」的说明**：`notAfter` 里的 `GMT` 是 UTC。本地 17:47 对应 UTC 09:47，
到 UTC 20:16:40 还有 **10.5 小时**；只有把 `20:16` 当成北京时间才会得到 2.6 小时。
本地时钟与证书 UTC 时间对照后，`hoursLeft=10.5` 是正确值，不是探测错误。
（`hoursLeft` 直接用本机 `Date.now()` 与证书 UTC 到期时刻比较；机器时钟若严重偏差会算错，见 §7。）

同进程内跑真实路由（`handleRequest`，读真实状态、真实握手）：

```
status(probe 之前): {"enabled":true}
probe.cert:         {"ok":true,"expiresAt":"2026-10-29T20:16:40.000Z","hoursLeft":10.5,"subject":"","san":"IP Address:10.140.140.223"}
status(probe 之后): {"enabled":true,"expiresAt":"2026-10-29T20:16:40.000Z","hoursLeft":10.5}
doctor tls row:     {"id":"tls.cert","label":"证书有效期","state":"ok","detail":"剩余 10.5 小时（2026-10-29T20:16:40.000Z 到期）"}
```

`/doctor` 的 `summary` 仍是环境实际状态（`partial`），证书行不参与 summary 计算（未改 `doctor.js`）。

用注入的「只剩 1.2 小时」结果验证 warn 文案（不动真实 Caddy）：

```json
{"id":"tls.cert","label":"证书有效期","state":"warn","detail":"证书剩余时间低于 2 小时；剩余 1.2 小时"}
```

超时行为：对黑洞地址 `10.255.255.1:8710` 用 `timeoutMs:400` 探测，
440ms 返回 `{"ok":false,…,"reason":"TLS 握手失败：TLS 握手超时（400ms）"}`，不挂起、不抛异常。

## 6. 测试

- `test/probe.test.js`：新增 11 个用例，覆盖
  剩余 >2h（用真实 Caddy 的 `Oct 29 20:16:40 2026 GMT` 格式）、剩余 <2h、已过期、SAN 不匹配、
  握手失败、`probe().cert` 挂载与缓存、缺 IP / 未启用 TLS / 未部署时不发握手、`sanCovers`、
  `certCheck` 文案。
- `test/api.test.js`：`/probe` 注入假探测后带 `cert` 不崩、失败时 `reason` 透出、`/status` 带 `tls` 且为轻量结构。
- `test/appmode.test.js`：`tlsStatus()` 纯函数（未启用不报证书字段、未探测只报 enabled、缓存命中带
  `expiresAt`/`hoursLeft`、握手失败不塞 null）。
- `npm test`：**137 tests，136 pass，0 fail，1 skipped**
  （skipped 为既有的「真实 Caddy 下的门禁语义」，需 `CADDY_BIN`，与本轮无关）。

## 7. 已知限制

1. **生效时机**：本次未重启 dsh-web。当前线上进程仍是旧代码（实测 `/status` 无 `tls`、
   `/probe` 无 `cert`），新字段要等下一次 DSH 重启后才通过 HTTP 对外可见；
   直接 `import` 模块的验证与同进程路由验证均已通过。
2. **续签/重载瞬间可能短暂取不到证书**：Caddy reload 或换证书的窗口里握手可能失败，
   该次探测会得到 `ok:false`（`TLS 握手失败：…`），下一次探测自愈；2s 超时限制最坏等待。
3. **SNI 用 IP 字面量会触发 Node DEP0123**（RFC 6066 不允许 IP 作为 SNI）：
   进程内只打印一次警告，目前仍然照常发送；若未来 Node 真的忽略 IP SNI，
   可退回「不带 SNI」（本机实测同样能拿到该站点证书）或改用域名站点。
4. **不校验证书链**：`rejectUnauthorized:false` 只能证明「Caddy 确实发了这张证书」，
   SAN/有效期自己判；不能防御链路中间人（局域网威胁模型下已知）。
5. **`/status` 的证书字段是进程内缓存**：只有先调用过 `/probe`（或 `/diag`）才有
   `expiresAt`/`hoursLeft`；重启后清零。面板页面加载时会请求 `/probe`，所以正常使用下会出现。
6. **总 ok 不含证书**：`probe.ok` 语义未变，证书问题通过 `probe.cert` / doctor 行暴露；
   如果希望「证书快过期 = 面板不健康」，需要另行确认是否改总 ok。
7. **机器时钟偏差**会让 `hoursLeft` 算错（没有 NTP 校验）；证书到期时刻本身是 UTC，解析无歧义。
8. **只看实际下发的证书**：如果 Caddy 运行态配置与磁盘 Caddyfile 不一致，以握手拿到的为准（这正是想要的）。
9. 无持久化/历史/告警：M3 只做「面板可见」，重启丢缓存，也不会主动推送通知。
10. 只支持 `IP Address:` / `DNS:` SAN 与单层通配符；多域名站点需确认 SAN 列表。
11. 明文部署（`detectTls()` 为 false）时接口层跳过证书探测；直接调用 `probe()` 且不传
    `tls:false` 时仍会尝试握手（会得到「未启用 TLS」以外的握手失败原因）。
12. **面板行标题**：`tls.cert` 行已经带回 `label: '证书有效期'`，但当前 `lib/client.js`（同事在改，
    本轮不允许动）的 doctor 列表渲染的是 `check.id`，所以面板左侧暂时显示 `tls.cert`；
    `detail` 里的「剩余 X 小时（… 到期）」已经可见。等 client 支持 `label` 后自动显示中文名，
    接口侧不需要再改。

## 8. 改动范围

只改动了允许的文件：

- `lib/probe.js`：证书探测、判定、doctor 行、`/status` 缓存
- `lib/index.js`：`/probe`、`/doctor`、`/diag`、`/status`、可注入的 `handleRequest`
- `test/probe.test.js`、`test/api.test.js`、`test/appmode.test.js`
- 新增 `docs/m3-report.md`（本文件）

未改动（遵守约束）：`lib/client.js`、`lib/api.js`、`deploy/`、`docs/checklist.md`、
`docs/evidence.md`、`docs/verify.md`、`test/client.contract.test.js`、`~/.config/caddy/*`；
未运行 `npm install`，未重启 dsh-web / dsh-proxy。
（工作区里上述文件在本次任务开始前就已有其他人的未提交改动，本轮没有触碰。）
