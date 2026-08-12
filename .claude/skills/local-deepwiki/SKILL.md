---
name: local-deepwiki
description: Generate and maintain a deepwiki-style wiki for this repository in .deepwiki/. Use when the user asks to generate/update the wiki or deepwiki, document the codebase, or when they ask questions about the codebase's architecture that the wiki can help answer. The wiki is plain markdown, browsed in the terminal with `deepwiki tui`.
---

# local-deepwiki

You are the wiki engine. There is no LLM inside the tools — **you** read the code and write the pages. The `deepwiki` CLI gives you three things: an AST scan of the repo, a staleness tracker, and viewers the user opens to read what you wrote.

Run CLI commands as `deepwiki …` if installed, otherwise `npx local-deepwiki …`.

## The contract

Everything lives in `.deepwiki/`:

- `wiki.json` — the manifest. A tree of pages: `{ name, description, pages: [{ id, title, file, summary?, sources?, sourcesHash?, children? }] }`. Viewers render the sidebar from this. `sources` is the list of repo files/directories a page documents — it drives staleness detection.
- `*.md` — the pages, plain markdown. Cross-link pages by relative file name (e.g. `[Storage](storage.md)`).
- `analysis.json` — machine-written AST scan output (gitignored; regenerate any time).

## Depth modes

The manifest's optional `depth` field records which register the wiki is written in — respect it on updates.

- **`standard`** (default) — an orientation wiki: 5–15 pages, each under ~200 lines. Optimized for "where do I look."
- **`deep`** — use when the user asks for a deep, thorough, or comprehensive wiki, or when `wiki.json` already says `"depth": "deep"`. Optimized for "how does it actually work":
  - Every major subsystem becomes a **section**: a parent page giving the subsystem's role and map, plus `children` pages drilling into its components. Put child files in a subdirectory named after the section (`extension/understudy.md`).
  - Child pages go granular: per-module public API tables (from the scan), key types and their invariants, lifecycle walkthroughs of the important code paths, error/edge-case behavior, and design rationale where the code or docs state it. Read the source deeply enough to cite specific functions — a deep page with no `file:line` references is not a deep page.
  - Pages may run 200–400 lines. Split into a further child rather than exceeding that.
  - Parent pages carry the subsystem-wide `sources` (the directory); children carry their narrower sources, so staleness points at the exact child to rewrite.
  - Set `"depth": "deep"` in `wiki.json`.

## Generating a wiki from scratch

1. **Scan.** Run `deepwiki scan`. Read the printed summary. The full data is in `.deepwiki/analysis.json` — it is large, so query it instead of reading it whole:
   - symbols of a file: `jq '.files[] | select(.path=="src/x.ts") | .symbols' .deepwiki/analysis.json`
   - dependency edges: `jq '.edges' .deepwiki/analysis.json`
   - public surface of a directory: `jq '[.files[] | select(.path | startswith("src/scan/")) | {path, symbols: [.symbols[] | select(.exported) | {kind, name, signature}]}]'`
2. **Plan an adaptive structure.** Decide the page tree from what the repo actually is — do not apply a fixed template. A CLI tool doesn't get a "Database" page; a monorepo gets a page per package; a web app might split frontend/backend. Guidelines:
   - Always include an **Overview** page (what the project is, how to run it, tech stack, a repo-map mermaid diagram).
   - Usually include an **Architecture** page (the major components and how data/control flows between them — use the scan's dependency edges as evidence, not guesswork).
   - Add one page per meaningful subsystem/module — group by responsibility, not by directory listing. 5–15 pages for most repos; nest with `children` when a subsystem needs depth.
   - Read the load-bearing source files before writing about them. The AST scan tells you *where* to look (largest areas, most-depended-on files, public symbols); your reading supplies the *why*.
3. **Write the pages** into `.deepwiki/`. Style:
   - Explain intent and design, not line-by-line narration. Answer "why is it built this way" and "where do I look to change X".
   - **The wiki is read in a terminal.** For structure and flows, prefer compact ASCII diagrams in plain fenced code blocks (boxes and arrows, ≤ 60 columns). Mermaid is allowed but renders as source text, so use it only when the source itself reads well (small `flowchart LR` chains). Every node must correspond to something real in the code.
   - Reference code as `path/file.ts:123` so readers can jump to it. End each page with a `## Sources` section listing the files it was derived from.
   - Cross-link related pages liberally.
4. **Write `wiki.json`.** For each page set `sources` to the files/directories it documents (directories cover everything beneath them). Set `name` (repo name) and `description` (one line).
5. **Seal.** Run `deepwiki status --update` to record source hashes, then `deepwiki status` to confirm everything is `fresh`.
6. **Tell the user** how to browse: `deepwiki tui` (interactive) or `deepwiki tree` (page list).

## Updating an existing wiki

1. Run `deepwiki status --json`. Only pages marked `stale` (their sources changed) or `missing-file` need work.
2. Re-run `deepwiki scan` to refresh the analysis, then rewrite **only the stale pages** — use `git log`/`git diff` on the page's `sources` to see what changed and update the affected sections rather than regenerating from nothing.
3. If the codebase grew a new subsystem, add a page and register it in `wiki.json`.
4. Finish with `deepwiki status --update`.

## Answering questions about the codebase

When the user asks how something works, use the wiki as your index, not your answer:

1. Check `deepwiki tree` / `wiki.json` for the relevant page and read it — it points at the load-bearing files.
2. Read those files to verify (pages can drift; `deepwiki status` tells you how much to trust them).
3. Answer from the code, citing `file:line`. If you discovered that a page is wrong or incomplete, fix the page while you're there and re-run `deepwiki status --update`.

## Rules

- Never invent structure the scan and your reading don't support. Every claim in a page should be checkable against a file in `## Sources`.
- Keep pages under ~200 lines in standard mode (~400 in deep mode); split into child pages instead of writing monoliths.
- `.deepwiki/*.md` and `wiki.json` are meant to be committed; `analysis.json` is not (it's gitignored).
- Do not put an LLM chat UI, API keys, or generated HTML into the wiki — plain markdown only. The TUI handles rendering.
