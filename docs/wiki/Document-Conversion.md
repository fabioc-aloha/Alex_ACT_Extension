# Document Conversion

Alex ships with a right-click document converter that moves files between Markdown, Word (`.docx`), HTML (`.html`), plain text (`.txt`), and email messages (`.eml`). It runs **locally**. It does not cost anything against your Copilot quota. It is one of the everyday utilities that pairs well with [project memory](Project-Memory) and the [Plugin Mall](The-Plugin-Mall).

## How to use it

1. Open the **Explorer** panel in VS Code (`Ctrl+Shift+E`, Mac: `Cmd+Shift+E`).
2. Right-click any supported file.
3. Pick **ACT Convert** from the context menu.
4. Choose the output format.

The converted file lands next to the source with the new extension.

## Supported formats

Markdown is the hub. Each other format converts to or from Markdown:

| From | To |
| --- | --- |
| `.md` | `.docx` (Word), `.html`, `.txt` (plain text), `.eml` (email message) |
| `.docx` | `.md` |
| `.html` | `.md` |

There is no direct `.docx` ↔ `.html` path: go through Markdown if you need it (`.docx` → `.md` → `.html`). PDF is not supported in either direction.

Round-tripping through Markdown (`.docx` → `.md` → `.docx`) is reasonably faithful for typical document structure: headings, lists, tables, code blocks, links, basic formatting. Heavily formatted Word documents with custom styles, embedded objects, or complex tables may lose fidelity. For round-tripping critical documents, do a visual diff before trusting the output.

## When to use it

Common patterns:

- **Draft in Markdown, ship in Word.** Write the proposal, research paper, or report in Markdown (easier to version, easier for Alex to help with), convert to `.docx` for the stakeholder who wants Word.
- **Receive in Word, edit in Markdown.** Convert an incoming `.docx` to `.md`, work with Alex on it (Alex reads and writes Markdown natively), convert back when done.
- **Web content in, Markdown out.** Save a web page or paste an `.html` fragment, convert to `.md`, then work on it as text.
- **Email a Markdown draft.** Convert to `.eml` and the file opens directly in Outlook, Apple Mail, or any mail client as a ready-to-edit message with formatting preserved.
- **Strip to plain text.** Convert `.md` to `.txt` when you need something a pasteboard, a terminal, or a log file will accept cleanly.

## When not to use it

- **Highly formatted Word documents with brand styles, custom fonts, embedded charts.** The conversion preserves structure, not visual identity. If the document needs to match a specific corporate template, do the final layout in Word.
- **PDFs.** PDF conversion is not supported. If you need to publish a fixed-layout artifact, export to PDF from Word after converting `.md` → `.docx`.

## Privacy

Conversion runs **locally** in the extension process. The file content does not leave your machine and is not sent to any AI provider. This is unlike chat traffic, which goes through GitHub Copilot to a model provider. For conversion, no model is involved.

## Related reading

- [Project Memory](Project-Memory): for managing documents Alex works on across sessions.
- [The Plugin Mall](The-Plugin-Mall): skills like `markdown-mermaid` and `doc-hygiene` that pair well with conversion workflows.

---

*Last reviewed: 2026-05-25*
