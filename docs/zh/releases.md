# 发布、更新与遥测

私有源仓库发布构建 macOS DMG/ZIP、Windows NSIS、Linux AppImage、各平台的 headless server 与 CLI 二进制。发布环境需要 Apple 与 Windows 签名凭证,以及一个仅能向 `open-fox/mkagent-public` 写发布产物的最小权限 token。

## 发布流水线

```text
  develop ──▶ 版本 bump ──▶ tag ──▶ validate:ci + 多平台构建
                                                       │
                                                       ▼
                              签名 + 公证(Apple)、签名(Windows)
                                                       │
                                                       ▼
                  推送安装包 + manifest + blockmap + checksum
                            到 open-fox/mkagent-public(仅 release 仓库)
                                                       │
                                                       ▼
                              electron-updater 读取 public 仓库
```

`mkagent-public` 只装发布产物:安装包、manifest(如 `latest-mac.yml`、`latest.yml`、`latest-linux.yml`)、blockmap、checksum、下载说明。不含源码。

## 安装包矩阵

| 平台 | 构建 | 命名 | 签名 | 备注 |
|---|---|---|---|---|
| macOS arm64 | DMG + ZIP | `MkAgent-0.1.0-arm64.{dmg,zip}` | ad-hoc(dev)/ Developer ID(release) | `hardenedRuntime: true`,`gatekeeperAssess: false`,设置 NSLocalNetworkUsageDescription |
| macOS x64 | DMG + ZIP | `MkAgent-0.1.0-x64.{dmg,zip}` | 同上 | 给 Intel Mac 用 |
| Windows x64 | NSIS | `MkAgent-0.1.0-x64.exe` | ad-hoc(dev)/ Authenticode(release) | 每用户安装到 `%LOCALAPPDATA%\Programs\`;`deleteAppDataOnUninstall: true` |
| Linux x64 | AppImage | `MkAgent-0.1.0-x64.AppImage` | 无 | desktop 类别:Utility |
| Headless server(每架构) | `bun build --compile` | `mkagent-server-<platform>-<arch>` | 无 | 给 WebUI 与 CLI 用户消费 |
| CLI | `bun build` | `apps/cli/dist/mkagent` | 无 | 以单文件 Bun 二进制发布 |

`MKAGENT_DEV_RUNTIME=1` 加 `CSC_IDENTITY_AUTO_DISCOVERY=false` 就能产出本地可装的构建,无需任何签名 secret。

## 更新

Electron 通过 `electron-updater` 命中 `open-fox/mkagent-public` 上的 GitHub Releases API。客户端不含 GitHub token;只需要 manifest 文件作为认证。

| 字段 | 设置位置 |
|---|---|
| `appId` | `apps/electron/electron-builder.yml` → `app.mkagent.desktop` |
| Provider | `github` |
| Owner / repo | `open-fox` / `mkagent-public` |
| Manifest | 由 electron-builder 在 release 时自动生成 |

降级需要手动装老版本;自动更新只会往前走。

## 遥测:Sentry

Sentry 沿用 desktop 默认行为。除非构建时设置了 `SENTRY_ELECTRON_INGEST_URL`,main / renderer 初始化默认不生效。

| 层 | 捕获内容 |
|---|---|
| Main | 未捕获异常、breadcrumb 事件(凭证形字段已脱敏)、一个 hash 后的 machine id |
| Renderer(React) | boundary 错误、console 错误、agent / input error 报告 |
| Preload | bridge 侧错误 |

始终脱敏的 breadcrumb / request header 字段:`authorization`、`cookie`、`x-api-key`、`token`、`key`、`secret`、`password`、`credential`、`auth`。source map 会生成但**不**上传;要还原 source 级栈需要 Vite / esbuild plugin 启用与 Sentry CI 变量。

## 跨 builder 可复现性

`electron-builder.yml` 的 `files` / `extraResources` 块是 Lite 边界的一等产物,它们决定了 MkAgent 更小的安装包体积;具体数字见 [`comparison-with-craft.md`](./comparison-with-craft.md)。发布前对其中任一块的改动都必须同时更新该文档,以及同文件顶部的 `appId` / `productName` / `copyright`。

## 发布前 checklist

```bash
git status --short                # 工作区干净
git log -n 5 --oneline            # 检查版本 bump 与其 commit
bun run validate:ci
bun run audit:craft-reuse
bun run lint:craft-test-coverage
bun run typecheck:all
bun run test
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
```

只有上面所有命令在 tag commit 上通过才能发布。
