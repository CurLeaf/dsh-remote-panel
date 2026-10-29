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
| H2 | 侧栏展开后 | 黑色浮层铺到底；工作区列表在面板入口之上 | 查 `[class*="_sidebarCol"]` 是否命中 |
| H2 | 点抽屉外空白 | 抽屉收起，且不误触下方正文 | `.dsh-mobile-scrim` 是否存在、`html.dsh-drawer-open` 是否在切换 |
| H2 | 点会话行 / 面板行 | 选完抽屉自动收起（桌面不收起） | 是否 `matchMedia('(max-width:1023px)')` |
| H2 | 打开抽屉 | 只有「工作区列表 + 工作区 Git + 余额/账号」；插件/自动化/命令面板/MCP/更多 不出现 | 抽屉里是否还能看到这五个 `aria-label` |
| H2 | 点 chip 右侧的 × | 回到「选择工作区」空态（输入条禁用），× 自动隐藏；再点 chip 弹原生选择器 | `.dsh-mobile-clear-workspace` 的 `data-none` |
| H3 | 390px 正文 | 占满宽度 | `[class*="_frame"]` 的 `grid-template-columns` |
| H3 | 空态 | 问候语居中、输入条贴底、整页纯黑 | `.uV2eYG_root` 是否 `position: fixed` |
| H3 | 输入框 | 键盘弹出不被顶飞 | — |
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
  frame: !!document.querySelector('[class*="_frame"]'),
  sidebar: document.querySelectorAll('[class*="_sidebarCol"]').length,
  collapsed: !!document.querySelector('[class*="_collapsed"]'),
  hamburger: !!document.querySelector('.dsh-mobile-hamburger'),
  newChat: !!document.querySelector('.dsh-mobile-newchat'),
  scrim: !!document.querySelector('.dsh-mobile-scrim'),
  drawerOpen: document.documentElement.classList.contains('dsh-drawer-open'),
  style: !!document.getElementById('dsh-remote-panel-shell'),
})
```

期望：`frame/sidebar/hamburger/newChat/scrim/style` 全为真；
390px 下汉堡与新建可见，1281px 下两者 `display: none`。

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
