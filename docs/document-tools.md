# Document tools

Desktop and headless packages include `markitdown`, PDF, XLSX, DOCX, PPTX, image, iCalendar, and document-diff wrappers. Each wrapper is a thin POSIX / `cmd` shell launcher that delegates to a Python script under `apps/electron/resources/scripts/`, plus a `uv`-installed runtime.

## Wrappers and scripts

| Wrapper | Script | Purpose |
|---|---|---|
| `markitdown` | `markitdown_cli.py` | Markdown conversion for arbitrary documents |
| `pdf-tool` | `pdf_tool.py` | PDF text extraction, page selection, table extraction |
| `xlsx-tool` | `xlsx_tool.py` | XLSX sheet enumeration, table extraction, cell range extraction |
| `docx-tool` | `docx_tool.py` | DOCX paragraph and table extraction |
| `pptx-tool` | `pptx_tool.py` | PPTX slide text extraction |
| `img-tool` | `img_tool.py` | Image metadata, OCR (optional tesseract), re-encode |
| `ical-tool` | `ical_tool.py` | iCalendar event / todo enumeration |
| `doc-diff` | `doc_diff.py` | Word-level / structure-aware diff between two documents |

All wrappers exist as both `*-tool` (POSIX shell) and `*-tool.cmd` (Windows) variants under `apps/electron/resources/bin/`. The packaged app ships them under `Contents/Resources/app/dist/resources/bin/`.

## Runtime resolution

The wrapper invokes Python 3.12 under `uv`. MkAgent resolves the runtime in this order:

```text
1. process.env.MKAGENT_UV                     (explicit override)
2. ctx.resourcesBasePath + "/uv"              (bundled in MkAgent dev builds)
3. ctx.appRootPath + "/vendor/uv"             (legacy layout)
4. PATH (system `uv`)
```

`mkagent-public` releases do **not** bundle a per-platform `uv` binary; Craft Agents does. Both wrappers still work because system `uv` plus a Python 3.12 interpreter resolves the script's environment.

## Renderers

The renderer supports rich previews for the formats above. The Shiki code highlighting and KaTeX math rendering are shared with the chat markdown pipeline; the document tools are pure server-side helpers invoked by Pi tools.

## Smoke tests

Run `bun run test:doc-tools` after changing a wrapper or script. The Python smoke fixtures live in `apps/electron/resources/scripts/tests/` and are executed via `python3 -m unittest`. Each test asserts a known-good extraction on a tracked fixture.

Packaging validation verifies that `uv`, the scripts, and wrappers are placed at the paths used by the runtime — `scripts/build-server.ts` and the per-platform `apps/electron/scripts/build-dmg.sh` (and `apps/electron/scripts/install-app.sh`) include the check.

## Adding a new tool

1. Drop the Python script under `apps/electron/resources/scripts/` with a focused CLI surface.
2. Add a matching `*-tool` and `*-tool.cmd` under `apps/electron/resources/bin/`.
3. Register the tool with the same JSON-RPC channel as the other document tools.
4. Add a smoke test fixture under `apps/electron/resources/scripts/tests/`.
5. Update this file, `apps/electron/resources/bin/`, and the renderer preview component if visible output changes.
6. Run `bun run test:doc-tools` and `bun run validate:ci`.

## Limitations

- Tools run in a single Python process per call; large documents may exceed memory unless the script streams output.
- Image OCR requires an optional tesseract install and is off by default.
- `markitdown_cli.py` is a thin wrapper; complex Office formats sometimes need the official Python library directly.
