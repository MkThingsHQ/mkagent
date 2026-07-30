# 网络代理

设置中可以启用 HTTP / HTTPS 代理 URL,以及逗号分隔的 no-proxy 列表。

## 代理作用范围

| 层 | 是否使用代理 |
|---|---|
| Electron 网络会话 | 是 |
| 模型请求(Pi 子进程) | 是 |
| `web_search`、`web_fetch` 抓取 | 是 |
| Browser 面板(Renderer 进程) | 是 |
| Pi SDK 子进程外发 HTTPS | 是 |
| 本地 / `127.0.0.1` 请求 | 否(视为 `no_proxy`) |
| 仅 `localhost` 的 Ollama | 否 |

## 脱敏保证

代理凭证是敏感数据。它们**不**能出现在:

- server 日志(`~/.mkagent/logs/mkagent-server-*.log`)
- Sentry breadcrumbs
- session JSONL
- session 导出包

共享的 network interceptor 在任何 I/O 之前脱敏以下字段:

```text
authorization, cookie, set-cookie, x-api-key, token, key, secret,
password, credential, auth
```

Sentry 相关行为见 [`releases.md`](./releases.md#遥测sentry)。

## 配置

workspace 设置 → "Network proxy":

```text
HTTP proxy:        http://user:pass@proxy.example:8080
HTTPS proxy:       (可选;fallback 到 HTTP proxy)
No proxy:          localhost,127.0.0.1,.local
```

`No proxy` 解析为逗号分隔的 host/CIDR 列表。支持通配符(`*.local`)与 CIDR 段(`10.0.0.0/8`)。

## 环境变量覆盖

应用启动前 export 标准的代理环境变量,可以临时覆盖应用内设置:

| 变量 | 层 |
|---|---|
| `HTTP_PROXY` / `http_proxy` | headless server 内 Node 端 HTTP client |
| `HTTPS_PROXY` / `https_proxy` | 同上,HTTPS |
| `NO_PROXY` / `no_proxy` | 逗号分隔的 no-proxy 列表 |
| `ALL_PROXY` | `HTTP_PROXY`/`HTTPS_PROXY` 未设置时的默认 |

Electron 启动时也认这些环境变量。应用启动后,MkAgent 自己发起的连接走应用内设置;只有系统级请求(自动更新、Sentry)继续用环境变量。

## 沙箱提示

macOS 上设置了 NSLocalNetworkUsageDescription,这样 Browser 面板在用户明确同意后能访问 LAN 地址。没有这条提示,LAN 访问会被静默拒绝,且不会出现在隐私面板中。

## 优先使用系统代理

如果自定义应用级代理不必要,优先操作系统代理:

- macOS:System Settings → Network → Proxies
- Linux:通过 systemd user environment 设 `HTTP_PROXY`
- Windows:Settings → Network & Internet → Proxy

这样可以避免把凭证写进 MkAgent 的设置文件,也不会进入未来的 import / export 场景。
