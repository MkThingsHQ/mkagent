# Document tools

Desktop and headless packages include `markitdown`, PDF, XLSX, DOCX, PPTX, image, iCalendar, and document-diff wrappers with their Python scripts and `uv`. Rich renderer support covers Markdown, code, diffs, terminal output, Mermaid, data tables, PDF, Office documents, and images.

Run `bun run test:doc-tools` after changing a wrapper or script. Packaging validation verifies that `uv`, the scripts, and wrappers are placed at the paths used by the runtime.
