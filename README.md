# dsh-remote-panel

DeepSeek Harness 的远程访问**控制面**插件：部署向导、状态面板与一键配对。

数据面（Caddy + EasyTier）始终是独立进程，插件不监听任何端口。

> 施工中。功能清单与验收见 [docs/checklist.md](docs/checklist.md)。

## 安装

```bash
dsh plugin --profile web add dsh-remote-panel
```

装完重启 DSH，设置里会出现「远程访问」分区。

## 设计约束

- **零网络监听**：只借用 DSH 自身的 HTTP 服务注册一条前缀路由。
- **自带鉴权**：进程启动生成随机令牌，随 index 注入；index 只有通过 DSH 认证才会被渲染。
- **数据面在进程外**：应用崩溃/重启时反代仍然存活，远程可达性不跟随应用存亡。
- **脚本交给 AI**：需要特权的动作不在插件里执行，渲染成幂等脚本由目标机 AI 完成。

## 许可

Apache-2.0
