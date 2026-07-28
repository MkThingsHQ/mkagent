# Skills

Skills are discovered in global, workspace, and project locations with priority `global < workspace < project`. The Skills UI and watcher expose list, detail, files, import, editing, picker/mention, and Pi prompt injection.

Each Skill directory must contain `SKILL.md` with YAML frontmatter and Markdown instructions. Supporting scripts, references, and templates remain beside it. The legacy `requiredSources` field has no effect because Sources are not part of MkAgent.
