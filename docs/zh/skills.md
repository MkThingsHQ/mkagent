# Skills

Skills 在 global、workspace 与 project 三个位置被发现，优先级为 `global < workspace < project`。Skills UI 与 watcher 暴露列表、详情、文件、导入、编辑、picker/mention 与 Pi prompt 注入。

每个 Skill 目录都必须包含带 YAML frontmatter 与 Markdown 内容的 `SKILL.md`。脚本、参考与模板等附属文件与 `SKILL.md` 同级存放。遗留的 `requiredSources` 字段无效，因为 Sources 不属于 MkAgent。
