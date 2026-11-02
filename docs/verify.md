# 真机验收清单

自动化测试覆盖不到的部分都在这页。全部通过后，把 `docs/checklist.md` 里的 `[~]` 改成 `[x]`。

## 前置

```bash
dsh plugin --profile web add dsh-remote-panel
# 重启 DSH，设置 → 远程访问 出现分区
```

---

## H 组：移动端外壳（只能肉眼看）

打开 Chrome DevTools → 设备工具栏，依次切 **iPhone 12 (390)**、**Pixel 5 (393)**、**iPad mini (768)**，再切回桌面 **1281**。

| # | 操作 | 通过标准 | 失败先查 |
|---|---|---|---|
| H1 | 390px 下看顶部 | 左边 ☰、中间工作区 chip（点开是原生工作区菜单）、右边 ＋ 新建 | Console 有无 `[remote-panel] 未匹配到布局容器` |
| H1 | 点 ＋ | 在「当前会话所在工作区 → 最近工作区」开一条空白对话 | `ctx.get('uiWorkspace')` 是否有值 |
| H1 | 390px 下看底部 | **没有**三格底栏；输入条是一整块卡片，按钮行保留原生控件（+ / 权限 / GenUI / 模型 / 发送） | 元素面板搜 `.dsh-mobile-bar` |
| H24 | 点 ☰ | 会话层整屏铺出来（无圆角 / 投影 / 遮罩），关掉后正文回满屏 | `html.dsh-drawer-open`；frame 上 `data-sidebar-collapsed` 是否被去掉 |
| H24 | 会话层里看内容 | 工作区列表、面板入口（工作区 Git / 监看）、账号区都在，宽度铺满屏 | `[data-qzsy-drawer]` 有无标记；`.hHd-Xa_root` 是否 100% |
| H24 | 点会话行 / 面板行 | 抽屉自动收起并跳过去（面板页由「返回对话」条带队） | click 处理器是否被输入框/「⋯」菜单的排除规则挡住 |
| H2 | 点 chip 右侧的 × | 回到「选择工作区」空态（输入条禁用），× 自动隐藏；再点 chip 弹原生选择器 | `.dsh-mobile-clear-workspace` 的 `data-none` |
| H24 | 左缘右滑 / 抽屉内左滑 | 打开 / 收起；竖着滚列表时斜划不会误触 | `drawerSwipeAction` 的 48px 阈值与 0.8 判轴 |
| H24 | 按 Esc / 抽屉内左滑 | 会话层收起，正文恢复可点 | 收起来源只剩「☰ / Esc / 左滑 / 选中行」，遮罩随整屏形态删掉了 |
| H24 | 会话层开着按系统返回 | 先收起会话层（不退出页面），再按才退出 | `history.state.dshGuard` 是否只有一条守卫 |
| H24 | 竖着滚正文 / 在代码块上横划 | 只滚动 / 只横滚，不会把会话层拽出来 | 判轴：左缘 28px 起手、48px 阈值、`|dy| ≤ |dx|×0.8` |
| H3 | 390px 正文 | 占满宽度 | `[data-qzsy-frame]` 的 `grid-template-columns`（应为 `0px <满宽> 0px` 或 `<满宽> 0px 0px`） |
| H3 | 空态 | 问候语居中、输入条贴底、整页纯黑 | `.uV2eYG_root` 是否 `position: fixed` |
| H3 | 输入框 | 点输入条弹键盘，输入条浮到键盘上沿（不遮住正在打的字），正文仍然从卡片下面穿过、不被切成两层 | `--dsh-kb-inset` 是否等于键盘高度、座位是否还是 `position: sticky` |
| H3 | 输入完拖着正文滚 | 手指一碰到正文键盘就收起、输入条回到贴底；点输入条自己（按钮/模型/发送）不收起 | `installComposerDismiss` 是否只在 `(pointer: coarse)` 下挂 |
| H4 | 全局搜索 `dsh-remote-panel-shell` | 只有一份 `<style>` | — |
| H5 | 1281px | 无汉堡、无新建、布局与原生一致（chip 回到底部 hero 行） | `@media (min-width:1024px)` 是否生效 |
| H6 | iPhone：分享 → 添加到主屏幕 → 桌面图标打开 | 没有地址栏 / 工具栏，安全区不被状态栏压住 | head 里是否有 `apple-mobile-web-app-capable` 与 `apple-touch-icon` |
| H6 | Android：设置 → 远程访问 → 手机全屏 | 点「进入全屏」后浏览器 UI 消失；切走再回来仍在 | `document.fullscreenEnabled` |
| H6 | 独立窗口里打开 | 卡片显示「已经在独立窗口里运行」，不再给全屏按钮 | `display-mode: standalone` |
| H7 | 重新部署时勾「启用 HTTPS」 | 生成的 Caddyfile 是 `IP:端口 { tls internal }` + `auto_https disable_redirects` | 脚本里搜 `tls internal` |
| H7 | 手机装根证书后访问 `https://…:8710` | 扫码配对、全屏、安装都可用；Android 可「安装应用」 | 面板「手机全屏」里的下载根证书链接 |
| H7 | 已切 HTTPS 的机器上 | `https://…/healthz` 返回 `ok`；明文访问返回 400；配对二维码是 https | `curl --cacert <根证书> https://…/healthz` |

控制台一次性自检（粘进 Console 执行）：

```js
({
  frame: !!document.querySelector('[data-qzsy-frame]'),
  drawer: !!document.querySelector('[data-qzsy-drawer]'),
  collapsed: document.querySelector('[data-qzsy-frame]')?.hasAttribute('data-sidebar-collapsed') ?? null,
  open: document.documentElement.classList.contains('dsh-drawer-open'),
  hamburger: !!document.querySelector('.dsh-mobile-hamburger'),
  newChat: !!document.querySelector('.dsh-mobile-newchat'),
  leftovers: !!document.querySelector('.dsh-pager-seam, .dsh-page-console'),
  style: !!document.getElementById('dsh-remote-panel-shell'),
})
```

期望：`frame/drawer/hamburger/newChat/style` 全为真、`leftovers === false`；
390px 下点 ☰ 后 `open === true`、`collapsed === false`，1281px 下汉堡与新建 `display: none`。

---

## I1：默认拒绝（需要两台设备）

| 场景 | 命令（在**另一台**设备上执行） | 期望 |
|---|---|---|
| 白名单内 | `curl -i http://10.140.140.223:8710/healthz` | `200` |
| 白名单内、无口令 | `curl -i http://10.140.140.223:8710/` | `401 access key required` |
| 白名单外 | 换一台不在名单的机器重试 | `403 source not allowed` |
| 有口令 Cookie | `curl -i -H "Cookie: dsh_gate=<口令>" http://10.140.140.223:8710/` | `401 dsh web authentication required`（说明已到 DSH） |

> 四条能同时成立，才说明「白名单 → 口令 → DSH 令牌」三层是串起来的。

---

## C5：EasyTier 版本

```bash
easytier-core --version
systemctl status easytier-dsh-remote --no-pager | head -5
```

通过标准：版本与向导里填的 `etVersion` 一致；单元 `active (running)`。

---

## 配对回归

1. 面板出二维码 → 手机扫「门禁」→ 再扫「令牌」→ 进入界面。
2. 关掉浏览器重开 → 直接进，不再扫码。
3. `sudo systemctl restart easytier-dsh-remote` → 手机会短暂断开，恢复后刷新即可。
4. `systemctl --user restart dsh-proxy` → 手机刷新仍可进（DSH 没动）。
5. **重启 DSH 本身** → 手机仍可进（Cookie 未过期），但面板二维码会变（令牌轮换），这是预期。

---

## 记录

| 日期 | DSH 版本 | 结果 | 备注 |
|---|---|---|---|
| | | | |

### 监看（执行处置台）

| # | 场景 | 期望 | 看什么 |
| --- | --- | --- | --- |
| J1 | 抽屉 → 监看 → 会话页 | 一句「N 个在跑 · 共 M 个」，卡住/运行中分色，点一行切过去 | `.row-sub` 文案、`data-act="session"` |
| J2 | 步骤展开 | `耗时 X` + 进度条 + `调用链（N）`，每行 `时间 · 名字 · 摘要 · 耗时` | `renderCallChain` 输出、`.bar > div` |
| J3 | 运行中 >3 分钟 | 步骤头出现「卡住 X 分钟」，进度条转红 | `s.stale` |
| J4 | 短语 chips | 点「继续」→ toast `已发送：继续`，会话里出现这条消息 | `session.prompt` 是否真的发出 |
| J5 | 接管 | 点「接管」→ agent 当轮被取消；再点「释放」 | `session.cancel()` |
| J6 | 手机批准（开） | 桌面触发审批 → 手机出现「等你批准」→ 批准后桌面继续 | `/remote-panel/api/pending`、`/approve` |
| J7 | 标记待处理 | toast `已标记，桌面能看到`；桌面设置里出现该条 | `/relay/mark`、设置 → 手机断点 |
| J8 | 后台待批 | 手机收到系统通知 | APK：原生通知；浏览器：PWA `Notification` |
| J9 | 一键验收 | `npm run verify:live` 13 项全 PASS | 脚本输出 |
