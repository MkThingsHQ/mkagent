# 发布、更新与遥测

开源仓库中的版本 tag 会触发 macOS DMG/ZIP、Windows NSIS、Linux AppImage、各平台 headless server 与基于 Bun 的 CLI bundle 构建。源码与可下载产物现在统一放在 [MkThingsHQ/mkagent](https://github.com/MkThingsHQ/mkagent/releases/latest)。发布环境需要 Apple 与 Windows 签名凭证；workflow 使用仓库范围的 GitHub Actions token 发布。

## 发布流水线

```text
  main ──▶ release:prepare ──▶ 审核版本提交 ──▶ 带注释的 v* tag
                                                   │
                                                   ▼
                                          校验 + 多平台构建
                                                       │
                                                       ▼
                              签名 + 公证(Apple)、签名(Windows)
                                                       │
                                                       ▼
                  上传安装包 + manifest + blockmap + checksum
                          到 MkThingsHQ/mkagent GitHub Releases
                                                       │
                                                       ▼
                              electron-updater 读取同一仓库
```

安装包、manifest（如 `latest-mac.yml`、`latest.yml`、`latest-linux.yml`）、blockmap、checksum 和版本说明统一放在主仓库的 GitHub Releases 中，不提交进 Git；不再使用单独的 release-only 仓库。

## 版本与 Changelog 规范

MkAgent 使用语义化版本和 `v<major>.<minor>.<patch>` tag。[`CHANGELOG.md`](../../CHANGELOG.md) 是累计变更记录的唯一来源；`apps/electron/resources/release-notes/<version>.md` 是随应用内置、并原样发布到公开 GitHub Release 的用户版说明。

只从干净的 `main` 分支准备版本：

```bash
# 先把 CHANGELOG.md 中 Unreleased 的占位文字替换为真实变更。
bun run release:prepare 0.2.0
bun run release:check v0.2.0
git diff --check
git add CHANGELOG.md package.json bun.lock apps/*/package.json packages/*/package.json \
  apps/electron/resources/release-notes/0.2.0.md scripts/craft-source-overrides.json
git commit -m "chore(release): prepare v0.2.0"
git tag -a v0.2.0 -m "MkAgent v0.2.0"
git push origin main v0.2.0
```

`release:prepare` 会同步所有 workspace package 版本、刷新 `bun.lock`、把 Unreleased 内容移入带日期的版本段，并创建应用内置的 release notes。tag workflow 会再次独立检查这些元数据是否一致。

## 安装包矩阵

| 平台                    | 构建                     | 命名                               | 签名                               | 备注                                                                                  |
| ----------------------- | ------------------------ | ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| macOS arm64             | DMG + ZIP                | `MkAgent-0.1.0-arm64.{dmg,zip}`    | ad-hoc(dev)/ Developer ID(release) | `hardenedRuntime: true`,`gatekeeperAssess: false`,设置 NSLocalNetworkUsageDescription |
| macOS x64               | DMG + ZIP                | `MkAgent-0.1.0-x64.{dmg,zip}`      | 同上                               | 给 Intel Mac 用                                                                       |
| Windows x64             | NSIS                     | `MkAgent-0.1.0-x64.exe`            | ad-hoc(dev)/ Authenticode(release) | 每用户安装到 `%LOCALAPPDATA%\Programs\`;`deleteAppDataOnUninstall: true`              |
| Linux x64               | AppImage                 | `MkAgent-0.1.0-x64.AppImage`       | 无                                 | desktop 类别:Utility                                                                  |
| Headless server(每架构) | `bun build --compile`    | `mkagent-server-<platform>-<arch>` | 无                                 | 给 WebUI 与 CLI 用户消费                                                              |
| CLI                     | `bun build --target=bun` | `MkAgent-cli-bun.tar.gz`           | 无                                 | JavaScript bundle；用户机器需要 Bun                                                   |

`MKAGENT_DEV_RUNTIME=1` 加 `CSC_IDENTITY_AUTO_DISCOVERY=false` 就能产出本地可装的构建,无需任何签名 secret。

## 更新

Electron 通过 `electron-updater` 命中 `MkThingsHQ/mkagent` 上的 GitHub Releases API。公开仓库及其更新 manifest 不需要客户端携带 GitHub token。

| 字段         | 设置位置                                                     |
| ------------ | ------------------------------------------------------------ |
| `appId`      | `apps/electron/electron-builder.yml` → `app.mkagent.desktop` |
| Provider     | `github`                                                     |
| Owner / repo | `MkThingsHQ` / `mkagent`                                     |
| Manifest     | 由 electron-builder 在 release 时自动生成                    |

降级需要手动装老版本;自动更新只会往前走。

## 遥测:Sentry

Sentry 沿用 desktop 默认行为。除非构建时设置了 `SENTRY_ELECTRON_INGEST_URL`,main / renderer 初始化默认不生效。

| 层              | 捕获内容                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| Main            | 未捕获异常、breadcrumb 事件(凭证形字段已脱敏)、一个 hash 后的 machine id |
| Renderer(React) | boundary 错误、console 错误、agent / input error 报告                    |
| Preload         | bridge 侧错误                                                            |

始终脱敏的 breadcrumb / request header 字段:`authorization`、`cookie`、`x-api-key`、`token`、`key`、`secret`、`password`、`credential`、`auth`。source map 会生成但**不**上传;要还原 source 级栈需要 Vite / esbuild plugin 启用与 Sentry CI 变量。

## 跨 builder 可复现性

`electron-builder.yml` 的 `files` / `extraResources` 块是 Lite 边界的一等产物,它们决定了 MkAgent 更小的安装包体积;具体数字见 [`comparison-with-craft.md`](./comparison-with-craft.md)。发布前对其中任一块的改动都必须同时更新该文档,以及同文件顶部的 `appId` / `productName` / `copyright`。

## GitHub 发布环境

在仓库中创建受保护的 Actions environment `release`，并设置以下 environment secrets：

| Secret                                                     | 用途                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `CSC_LINK`、`CSC_KEY_PASSWORD`                             | Developer ID 证书及密码                                                                  |
| `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` | Apple 公证                                                                               |
| `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`                     | Windows Authenticode 证书及密码                                                          |

workflow 使用具有 `contents: write` 权限的仓库范围 `GITHUB_TOKEN` 创建 draft Release，上传并核对完整产物矩阵，全部成功后才发布为 Latest。失败后可重跑并更新 draft，但不会覆盖已经发布的版本。

## 发布前 checklist

```bash
git status --short                # 工作区干净
git log -n 5 --oneline            # 检查版本 bump 与其 commit
bun run release:check v0.2.0
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

只有上面所有命令在 tag commit 上通过才能发布。Apple 与 Windows 签名凭据配置完成前不要创建 tag；正式版会主动失败，不会退化成无签名安装包。
