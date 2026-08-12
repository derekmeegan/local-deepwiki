# local-deepwiki

**local-deepwiki** turns your own coding agent into a DeepWiki engine — and keeps the whole thing in the terminal. There is no hosted service, no web app, and no LLM API call anywhere in this codebase. The intelligence is the agent you already run (Claude Code, Cursor, etc.); this package supplies the three things that agent can't do well on its own:

1. **`deepwiki scan`** — a deterministic tree-sitter AST scan of the repository (symbols, signatures, doc comments, import graph) so the agent plans the wiki from evidence instead of vibes.
2. **Staleness tracking** — every wiki page records which source files it documents and a hash of their contents; `deepwiki status` tells the agent exactly which pages drifted.
3. **`deepwiki tui`** — a terminal browser for the wiki the agent wrote. Q&A doesn't happen in a viewer; you just ask your agent, which uses the wiki as its index.

```
┌──────────────┐  deepwiki scan   ┌────────────┐
│ coding agent │ ◄─────────────── │  your repo │
│ (reads the   │  AST analysis    └────────────┘
│  skill)      │
└──────┬───────┘
       │ writes .deepwiki/*.md + wiki.json
       ▼
  deepwiki tui  ── browse it, right here
```

## Quick start

```bash
npx local-deepwiki init          # installs the skill into .claude/skills/ + creates .deepwiki/
# then ask your agent: "generate the deepwiki for this repo"
npx local-deepwiki tui           # browse in the terminal
```

## Tech stack

- TypeScript (ESM, Node ≥ 20), compiled with `tsc`
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) + `@vscode/tree-sitter-wasm` prebuilt grammars — AST parsing with zero native builds
- `commander` for the CLI; the TUI is dependency-free ANSI

## Where things live

| Path | What |
|---|---|
| `src/cli.ts` | CLI entry point (`scan`, `status`, `tui`, `tree`, `init`) |
| `src/scan/` | File walker, language configs, tree-sitter extraction — see [Scanner](scanner.md) |
| `src/wiki.ts` | Manifest + staleness model — see [Architecture](architecture.md) |
| `src/tui/` | The terminal browser — see [Terminal Viewer](tui.md) |
| `skill/SKILL.md` | The agent playbook — see [The Skill](skill.md) |

## Sources

- `package.json`
- `src/cli.ts`
- `skill/SKILL.md`
