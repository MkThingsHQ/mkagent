# 文档工具

Desktop 与 headless 包内置 `markitdown`、PDF、XLSX、DOCX、PPTX、图片、iCalendar 和 document-diff 的 wrapper，以及对应的 Python 脚本和 `uv`。富渲染支持 Markdown、代码、diff、终端输出、Mermaid、数据表格、PDF、Office 文档与图片。

修改 wrapper 或脚本后请运行 `bun run test:doc-tools`。打包校验会确认 `uv`、脚本和 wrapper 部署在运行时使用的路径。
