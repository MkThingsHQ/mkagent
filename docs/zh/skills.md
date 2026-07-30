# Skills

Skills 在 global、workspace、project 三个位置发现,优先级 `global < workspace < project`。每个 Skill 目录里必须有 `SKILL.md`,带 YAML frontmatter 与 Markdown 说明。配套脚本、references、templates 放在同一目录下。

## 发现路径

```text
1. ~/.mkagent/skills/                       (global)
2. ~/.mkagent/workspaces/<slug>/skills/     (workspace)
3. <workingDirectory>/.mkagent/skills/      (project)
4. <workingDirectory>/.claude/skills/       (历史 project,等价于 .mkagent)
```

同名 Skill 在多个位置出现时,优先级最高的胜出;其他位置会被 shadow,但不会被删除。

## `SKILL.md` 格式

```markdown
---
name: pptx-deck-authoring
description: 从研究笔记生成结构化的 PowerPoint 演示文稿
license: Apache-2.0
allowed-tools: [bash, edit, read]
---

# PPTX Deck Authoring

先规划演示文稿结构,起草每页标题,然后跑 `pptx-tool` 落地。
```

| Frontmatter 键 | 必填 | 备注 |
|---|---|---|
| `name` | 是 | URL-safe 标识 |
| `description` | 是 | 一句话描述,出现在 picker 与 watcher 中 |
| `license` | 否 | 在 Skill 详情面板里展示 |
| `allowed-tools` | 否 | Pi 的提示 hint;权限引擎仍以全局策略为准 |
| `requiredSources` | 忽略 | 历史字段;Sources 不在 MkAgent 中 |
| `minMkagent` | 否 | 最低版本门槛 |

## 操作

| 操作 | 入口 |
|---|---|
| 列表 / 搜索 | Settings → Skills / 聊天 → Skills 面板 |
| 详情 | 点击 Skill 行展开 |
| 编辑 | Settings → Skills → edit(原地写) |
| 导入 | Settings → Skills → import;复制到全局 Skills 目录 |
| Picker / `@mention` | 聊天 → `\@<skill-name>` 把指令插入到 prompt |
| Watcher | 文件系统 watcher,改写 / 编辑后无需重启即可在 picker 中刷新 |

Pi 把 Skill 指令当作 system-prompt 的一部分,顺序为 `global → workspace → project`;后面的 Skill 可以按名字引用前面的 Skill。

## Mini chat 与 Skills

Skills 支持通过 LLM 辅助的 mini chat 来起草新指令。mini chat 与全局 mini chat 共用同一个 LLM;它通过现有的 `mini_completion` API 调用,遵循 workspace 的 mini-model 设置。

## 限制

- Skill Markdown body 在运行时读,不在构建期读;Skills 太大 picker 会变慢。
- Skill 模板目前放在 `SKILL.md` 旁边;没有独立的 `templates/` 目录约定。
- 跨 Skill 引用(`@another-skill`)只在 prompt 中出现,不会被解析为 Skill。
