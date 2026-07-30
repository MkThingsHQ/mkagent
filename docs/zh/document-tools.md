# 文档工具

桌面与 headless 包自带 `markitdown`、PDF、XLSX、DOCX、PPTX、图片、iCalendar、document-diff 的包装器。每个包装器都是一层薄薄的 POSIX / `cmd` shell 启动器,把 `apps/electron/resources/scripts/` 下的 Python 脚本交给 `uv` 管理的 runtime。

## 包装器与脚本

| Wrapper | Script | 用途 |
|---|---|---|
| `markitdown` | `markitdown_cli.py` | 任意文档 → Markdown |
| `pdf-tool` | `pdf_tool.py` | PDF 文本提取、选页、表格提取 |
| `xlsx-tool` | `xlsx_tool.py` | XLSX sheet 列表、表格提取、cell range 提取 |
| `docx-tool` | `docx_tool.py` | DOCX 段落与表格提取 |
| `pptx-tool` | `pptx_tool.py` | PPTX slide 文本提取 |
| `img-tool` | `img_tool.py` | 图片元数据、可选 OCR(tesseract)、re-encode |
| `ical-tool` | `ical_tool.py` | iCalendar event / todo 枚举 |
| `doc-diff` | `doc_diff.py` | 两份文档的 word-level / 结构化 diff |

所有包装器在 `apps/electron/resources/bin/` 下同时有 `*-tool`(POSIX shell)与 `*-tool.cmd`(Windows)两个版本。打包后的产物放在 `Contents/Resources/app/dist/resources/bin/`。

## Runtime 解析

包装器通过 `uv` 调用 Python 3.12。MkAgent 按以下顺序解析 runtime:

```text
1. process.env.MKAGENT_UV                      (显式覆盖)
2. ctx.resourcesBasePath + "/uv"              (MkAgent dev 构建自带)
3. ctx.appRootPath + "/vendor/uv"             (旧布局)
4. PATH (系统 `uv`)
```

`mkagent-public` release 不打包 per-platform `uv` 二进制——Craft Agents 会;两者包装器都能跑,因为系统 `uv` + Python 3.12 就能解析脚本的依赖。

## Renderer

renderer 支持上述格式的富预览。Shiki 代码高亮与 KaTeX 数学渲染与聊天 markdown 渲染共用同一管线;文档工具是纯 server 端、Pi 调用的 helper。

## Smoke 测试

修改包装器或脚本之后跑 `bun run test:doc-tools`。Python smoke fixture 在 `apps/electron/resources/scripts/tests/` 下,通过 `python3 -m unittest` 触发,每个测试都在 tracked fixture 上断言一个已知良好的 extraction。

打包校验还会确认 `uv`、脚本与包装器都落在 runtime 期望的路径上——`scripts/build-server.ts` 与各平台 `apps/electron/scripts/build-dmg.sh`(以及 `apps/electron/scripts/install-app.sh`)里包含这一步。

## 新增工具流程

1. 把 Python 脚本放到 `apps/electron/resources/scripts/` 下,保持 CLI surface 收敛。
2. 在 `apps/electron/resources/bin/` 下新增 `*-tool` 与 `*-tool.cmd`。
3. 用与其他文档工具一致的 JSON-RPC channel 注册工具。
4. 在 `apps/electron/resources/scripts/tests/` 下加 smoke fixture。
5. 同步更新本文档、`apps/electron/resources/bin/` 与 renderer 预览组件(如有视觉输出变更)。
6. 跑 `bun run test:doc-tools` 与 `bun run validate:ci`。

## 限制

- 工具每次调用跑一个 Python 进程;大文档可能撞到内存上限,除非脚本自己 stream。
- 图片 OCR 需要可选的 tesseract,默认关闭。
- `markitdown_cli.py` 是薄包装;复杂 Office 格式有时需要直接用官方 Python 库。
