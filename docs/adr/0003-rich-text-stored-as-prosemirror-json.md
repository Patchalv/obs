# Thread and Thread Response bodies are stored as ProseMirror JSON, not Markdown

**Status:** accepted

Staff members need a proper rich-text editor for Threads and Thread Responses: headings, formatting, lists, links, Mentions and emoji. We use TipTap as the editor. The open question was the storage format, because whichever we pick is what every row is written in and what every later reader has to handle.

## Decision

- **Source of truth:** the body is stored as ProseMirror JSON (`jsonb`), which is TipTap's native document format.
- **Search and snippets:** the server extracts plain text into a `body_text` column, and Postgres full-text search indexes that.
- **Mentions** are structured nodes that hold the Staff member's ID, so renaming someone never breaks a Mention. They are also copied into a `mention` table, so an edit can tell newly Mentioned people from those already Mentioned.
- **Allowlist on the server:**
  - Headings.
  - Bold, italic, underline and strikethrough.
  - Inline code and code blocks.
  - Bullet and numbered lists.
  - Blockquotes.
  - Links, only `http`, `https` or `mailto`.
  - Mentions.
  - Emoji, as Unicode.

  The server rejects any document with other node types or link schemes. The front end is never trusted to have filtered it.

## Considered options

- **Markdown source in a `text` column:** rejected.
  - **For it:** Markdown is easy to read in exports, emails and raw database rows, and simple to search.
  - **Against it:** saving editor content as Markdown and loading it back loses or changes formatting, such as underline, nested lists and line breaks. Mentions and any later feature (checklists, inline Attachments) would each need custom syntax.
- **Plain text:** rejected, because it doesn't meet the editor requirement.

## Consequences

- Reading a body anywhere other than the editor (exports, a future email digest, agents) needs a renderer. Converting to HTML or Markdown is mechanical and can be added when needed.
- Renaming or removing a node type later means migrating stored documents, so the allowlist should change rarely and on purpose.
- `body_text` must be re-extracted on every save, and kept in step with the extraction code when that changes.
