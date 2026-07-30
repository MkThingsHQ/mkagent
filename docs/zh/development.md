# 开发环境

依赖要求为 Bun 1.3.14、Python 3.12 和 `uv`。使用 `bun install --frozen-lockfile` 安装依赖。

常用命令：

```bash
bun run electron:start
bun run server:dev:webui
bun run apps/cli/src/index.ts --help
bun run typecheck:all
bun run lint
bun run test
```

在新增抽象前优先沿用现有包的边界和命名。参考 checkout 始终保持只读。一个模块的改动必须包含对应的测试和文档，提交前通过 `git diff --check`。

仅在隔离开发或测试时覆盖数据目录：

```bash
MKAGENT_CONFIG_DIR=/tmp/mkagent-dev bun run server:dev:webui
```
