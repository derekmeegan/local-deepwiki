# Terminal Viewer

`deepwiki tui` is the only viewer — the wiki lives where you already work. It is read-only and contains no generation logic: if a page is wrong, the fix is asking your agent, not the viewer.

## `runTui` (`src/tui/tui.ts:138`)

A dependency-free ANSI TUI:

- **Two panes**: page tree on the left (stale pages marked `*`), rendered content on the right. Header shows the wiki name and stale count; footer shows the current file and scroll position.
- **Keys**: `j`/`k` or arrows to move between pages, `d`/`u`/`space` to scroll, `g`/`G` top/bottom, `r` reload, `q` quit.
- Uses the alternate screen buffer and hides the cursor, so quitting leaves your scrollback clean.

## Markdown → ANSI

`renderMarkdown` (`src/tui/tui.ts:27`) is a small renderer, not a full CommonMark implementation: colored/underlined headings, word-wrapped prose, bullets and numbered lists, blockquotes, inline bold/italic/code/links, boxed code fences, and **real table rendering** — pipe rows are buffered and drawn as box-character grids with per-column widths, bold headers, and ANSI-aware cell clipping (`clip`/`flushTable` inside `renderMarkdown`). Inline styling applies links before bold/italic/code, since a naive `[..](..)` match after ANSI insertion can consume the `[` of an escape sequence. Fenced diagram blocks (ASCII or mermaid source) display as-is inside the box — which is why the skill tells agents to prefer compact ASCII diagrams.

## Non-interactive fallback

When stdout or stdin is not a TTY, `runTui` degrades to `printTree` (`src/tui/tui.ts:117`) — the same output as `deepwiki tree`: the page hierarchy with stale/missing markers. That makes `deepwiki tui | cat` safe, and gives agents and scripts a stable way to see wiki structure.

## Sources

- `src/tui/tui.ts`
