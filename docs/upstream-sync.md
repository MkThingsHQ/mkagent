# Upstream synchronization

## Baseline

- Repository: <https://github.com/craft-ai-agents/craft-agents-oss>
- Tag: `v0.11.2`
- Commit: `a60ebc1a5a7c`

## Policy

- Keep the `upstream` remote fetch-only in normal development.
- Review upstream changes by existing module and retain upstream file and symbol names where the responsibility is unchanged.
- Import changes as small, module-scoped commits.
- Do not reintroduce features listed as removed in `docs/feature-matrix.md`.
- Run the affected upstream tests and MkAgent integration tests before accepting a sync.
- Never modify the local craft, echo, or xagent reference checkouts from MkAgent work.
