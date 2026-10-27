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
| H1 | 390px 下看顶部 | 出现 ☰，点开侧栏、再点收起 | Console 有无 `[remote-panel] 未匹配到布局容器` |
| H1 | 390px 下看底部 | 出现三格底栏（会话/对话/插件），可点 | 元素面板搜 `.dsh-mobile-bar` 是否存在 |
| H2 | 侧栏展开后 | 浮在内容之上、铺到底、有阴影 | 查 `[class*="_sidebarCol"]` 是否命中 |
| H2 | 点抽屉外空白 | 抽屉收起，且不误触下方正文 | `html.dsh-drawer-open` 是否在切换 |
| H3 | 390px 正文 | 占满宽度（不是 56px 竖条） | `[class*="_frame"]` 的 `grid-template-columns` |
| H3 | 输入框 | 贴底，键盘弹出不被顶飞 | — |
| H4 | 全局搜索 `dsh-remote-panel-shell` | 只有一份 `<style>` | — |
| H5 | 1281px | 无底栏、无汉堡、布局原样 | `@media (min-width:1024px)` 是否生效 |

控制台一次性自检（粘进 Console 执行）：

```js
({
  frame: !!document.querySelector('[class*="_frame"]'),
  sidebar: document.querySelectorAll('[class*="_sidebarCol"]').length,
  collapsed: !!document.querySelector('[class*="_collapsed"]'),
  bar: !!document.querySelector('.dsh-mobile-bar'),
  hamburger: !!document.querySelector('.dsh-mobile-hamburger'),
  drawerOpen: document.documentElement.classList.contains('dsh-drawer-open'),
  style: !!document.getElementById('dsh-remote-panel-shell'),
})
```

期望：`frame/sidebar/bar/hamburger/style` 全为真；390px 下 `bar` 为真而 1281px 下为假。

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
