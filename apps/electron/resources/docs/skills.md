# Skills

Skills are reusable instructions stored in a directory containing `SKILL.md`. MkAgent discovers them at three levels, with later levels taking precedence:

1. Global: `~/.mkagent/skills`
2. Workspace: `~/.mkagent/workspaces/<workspace>/skills`
3. Project: `<project>/.agents/skills`

The file uses YAML frontmatter followed by Markdown:

```markdown
---
name: release-check
description: Validate a release before publishing
globs:
  - "**/package.json"
---

Run the project checks, inspect packaged artifacts, and report failures.
```

The Skills view supports discovery, details, files, import, editing, picker/mention, and filesystem watching. A selected Skill is injected into the Pi agent prompt. `requiredSources` is ignored because MkAgent does not provide Sources.

Keep a Skill focused, name required tools explicitly, include verification criteria, and place supporting scripts or templates beside `SKILL.md`.
