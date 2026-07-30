# Skills

Skills are discovered in global, workspace, and project locations with priority `global < workspace < project`. Each Skill directory must contain `SKILL.md` with YAML frontmatter and Markdown instructions. Supporting scripts, references, and templates remain beside it.

## Discovery paths

```text
1. ~/.mkagent/skills/                     (global)
2. ~/.mkagent/workspaces/<slug>/skills/   (workspace)
3. <workingDirectory>/.mkagent/skills/    (project)
4. <workingDirectory>/.claude/skills/      (legacy project, equivalent to .mkagent)
```

A Skill with the same name in multiple locations resolves to the higher-priority location; the others are shadowed but not deleted.

## `SKILL.md` format

```markdown
---
name: pptx-deck-authoring
description: Author a structured PowerPoint deck from research notes
license: Apache-2.0
allowed-tools: [bash, edit, read]
---

# PPTX Deck Authoring

Plan the deck structure, draft slide titles, then run `pptx-tool` to materialize.
```

| Frontmatter key | Required | Notes |
|---|---|---|
| `name` | yes | URL-safe identifier |
| `description` | yes | one-line description used by the picker and the watcher |
| `license` | optional | shows up in the Skill details panel |
| `allowed-tools` | optional | Pi prompt hint; the permission engine still applies regardless |
| `requiredSources` | ignored | legacy field; Sources are not part of MkAgent |
| `minMkAgent` | optional | minimum version gate |

## Operations

| Operation | Where |
|---|---|
| List / search | Settings → Skills / chat → Skills panel |
| Detail | Click a Skill row to expand |
| Edit | Settings → Skills → edit (writes in place) |
| Import | Settings → Skills → import; copies to the global Skills directory |
| Picker / `@mention` | Chat → `\@<skill-name>` to insert instructions into the prompt |
| Watcher | File-system watcher picks up writes/edits and rehydrates the picker without restart |

Pi sees Skill instructions as a system-prompt addition in the order `global → workspace → project`; later Skills can reference earlier ones by name.

## Mini chat and Skills

Skills support an LLM-assisted mini chat for drafting new instructions. The mini chat is the same LLM that backs the global mini chat; it is invoked through the existing `mini_completion` API and respects the workspace's mini-model setting.

## Limitations

- Skill Markdown body is read at runtime, not at build time; large Skills slow the picker.
- Skill templates currently live next to `SKILL.md`; no separate `templates/` directory contract.
- Cross-Skill references (`@another-skill`) are in-prompt only; they are not resolved like Skills.
