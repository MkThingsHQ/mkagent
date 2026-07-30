# 网络代理

Settings 中可以启用 HTTP 与 HTTPS 代理 URL，以及一个以逗号分隔的 no-proxy 列表。Electron 把该设置应用到自身的网络会话，模型、search、fetch 和 Pi 子进程的请求则会获得对应的代理环境变量。

代理凭证属于敏感信息，不得出现在日志、Sentry 事件、会话 JSONL 或导出包中。在不需要应用层自定义代理时，优先使用操作系统代理。
