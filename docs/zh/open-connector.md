# OpenConnector

MkAgent Desktop 把 [OpenConnector](https://github.com/oomol-lab/open-connector) 作为仅监听 loopback 的 sidecar 一同打包。该集成通过 `vendor/open-connector` Git submodule 固定在 OpenConnector `v1.3.5`，并且只在 Electron 应用中可用。WebUI、headless server 与 CLI 不会启动 sidecar、显示控制台或向模型暴露这些工具。

## 控制台

在 Desktop 侧边栏打开 **OpenConnector**，然后选择三个分区之一：

| 分区 | 用途 |
|---|---|
| Providers | 浏览 provider 并配置连接 |
| Actions | 查找可用 action 并查看输入指南 |
| Runs | 查看 action 执行记录与结果；外部操作结果不确定时，先在这里确认再决定是否重试 |

控制台由内置 sidecar 在 `127.0.0.1` 上提供，并嵌入 MkAgent。MkAgent 会自动生成本地鉴权材料，无需把 token 复制到 UI。

## Pi 工具

Desktop Pi 会话会暴露且仅暴露五个 OpenConnector 工具：

| 模型侧工具名 | 权限 |
|---|---|
| `mcp__open_connector__list_apps` | 只读发现 |
| `mcp__open_connector__list_connections` | 只读发现 |
| `mcp__open_connector__search_actions` | 只读发现 |
| `mcp__open_connector__get_action_guide` | 只读发现 |
| `mcp__open_connector__execute_action` | 可能修改外部服务；受权限门控 |

四个发现工具在 `safe` / Explore mode 中按只读操作放行；`execute_action` 在该模式中会被拦截。在 Ask mode 中，它会触发作用域限定到 action 与 connection 的权限询问；`allow-all` / Execute mode 仍是显式选择，启用后不再询问。权限 key 只标识 action 与 connection，不会复制 action 输入值。

如果 `execute_action` 调用丢失响应，MkAgent 不会自动重试，因为外部结果可能未知。决定重试前，请先查看 **Runs**。

## 数据与 secrets

OpenConnector 的数据库与自动生成的 secrets 位于：

```text
$CONFIG_DIR/connectors/open-connector/
```

使用默认配置根时，路径为 `~/.mkagent/connectors/open-connector/`。自动生成的 `secrets.json` 包含 admin token、runtime token 与 encryption key。不要编辑、分享或提交该文件。在支持 POSIX 权限的平台上，MkAgent 会把目录设为 `0700`、文件设为 `0600`。

## 开发准备

clone 仓库或修改 submodule 指针后，在仓库根目录准备固定版本的 runtime：

```bash
bun run open-connector:prepare
```

该命令会按需初始化 `vendor/open-connector`、安装 lockfile 锁定的 npm 依赖、重新生成 catalog 与 provider registry、完成 runtime typecheck/build，并构建 Web 控制台。`bun run electron:dev` 和 Electron 资源构建也会自动执行同一套准备流程。

## 产品边界

这项定向集成**不会**恢复 Craft 的通用 Sources 产品。MkAgent 仍然没有 API Source UI、用户可配置的 MCP Source 或 MCP pool、Source OAuth 流程、`session-mcp-server` 或 `bridge-mcp-server`；新增的只有固定版本的 OpenConnector sidecar 与上面五个固定 Pi 工具。
