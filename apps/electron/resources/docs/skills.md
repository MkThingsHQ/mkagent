# Skills Configuration Guide

Skills are reusable instructions stored in a directory containing `SKILL.md`. They are invoked from the picker, a mention, or a slash command such as `/commit`.

## Skill precedence

MkAgent discovers skills at three levels, with the more specific level taking precedence:

1. Global: `~/.agents/skills/{slug}/SKILL.md`
2. Workspace: `~/.mkagent/workspaces/{workspace}/skills/{slug}/SKILL.md`
3. Project: `<project>/.agents/skills/{slug}/SKILL.md`

This allows a workspace or project skill to override a more general skill with the same slug.

## Skill storage

```text
skills/{slug}/
├── SKILL.md          # Required definition
├── icon.svg          # Recommended UI icon
├── icon.png          # Alternative raster icon
├── scripts/          # Optional helper scripts
└── references/       # Optional supporting material
```

## `SKILL.md` format

Use YAML frontmatter followed by Markdown instructions:

```markdown
---
name: "Code Review"
description: "Review code changes for quality, security, and tests"
globs:
  - "*.ts"
  - "*.tsx"
alwaysAllow:
  - "Read"
---

# Code Review

Review correctness, security, maintainability, and test coverage.
Report findings with precise file and line references.
```

## Metadata fields

### `name` (required)

Display name shown in the Skill list.

### `description` (required)

One or two sentences explaining when the Skill should be used.

### `globs` (optional)

File patterns associated with the Skill:

```yaml
globs:
  - "*.test.ts"
  - "*.spec.tsx"
  - "**/__tests__/**"
```

### `alwaysAllow` (optional)

Tool names recognized by the Skill metadata and displayed in its details:

```yaml
alwaysAllow:
  - "Read"
  - "Bash"
```

### `icon` (optional)

An emoji or URL. Relative icon values are not supported. A colocated `icon.svg`, `icon.png`, `icon.jpg`, or `icon.jpeg` is discovered automatically without an `icon` field.

MkAgent does not provide Craft Sources, so `requiredSources` is not part of the retained Skill contract.

## Creating a Skill

### 1. Create the directory

For a workspace Skill:

```bash
mkdir -p ~/.mkagent/workspaces/{workspace}/skills/code-review
```

For a project Skill:

```bash
mkdir -p .agents/skills/code-review
```

### 2. Write focused instructions

```markdown
---
name: "Release Check"
description: "Validate a release before publishing"
globs:
  - "**/package.json"
---

# Release Check

1. Run the repository validation commands.
2. Inspect packaged artifacts.
3. Verify the version and release notes.
4. Report failures and the exact commands run.
```

Keep one Skill focused on one workflow. Name required tools explicitly, include acceptance criteria, and put reusable scripts or templates beside `SKILL.md`.

### 3. Add an icon

- Prefer SVG for crisp scaling.
- Use at least 64×64 pixels for PNG/JPEG.
- Keep the icon visually relevant to the workflow.
- Use only assets whose license permits redistribution.

### 4. Validate

After creating or editing a Skill, run:

```text
skill_validate({ skillSlug: "code-review" })
```

Validation checks:

- lowercase slug using letters, numbers, and hyphens
- readable `SKILL.md`
- valid YAML frontmatter
- required `name` and `description`
- non-empty Markdown instructions
- supported icon format

## Example: commit messages

```markdown
---
name: "Commit"
description: "Create focused conventional commits"
alwaysAllow:
  - "Bash"
---

# Commit Message Guidelines

Use an imperative subject under 72 characters. Explain why the change is needed, keep unrelated changes out of the commit, and run the relevant checks before committing.
```

## Best practices

1. Be specific and actionable.
2. Include examples of the expected result.
3. State important boundaries and forbidden actions.
4. Keep the Skill small enough to read before use.
5. Add verification criteria.
6. Validate after every edit.

## Troubleshooting

**Skill not loading**

- Check that the slug is lowercase and hyphenated.
- Verify `SKILL.md` is in one of the supported directories.
- Validate the YAML frontmatter and Markdown body.

**Skill not appearing for a project**

- Confirm the working directory is inside the project containing `.agents/skills`.
- Reopen the picker after the filesystem watcher refreshes.

**Icon not showing**

- Use SVG, PNG, JPG, or JPEG.
- Check that the file is readable and the relative path is correct.
