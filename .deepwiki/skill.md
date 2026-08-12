# The Skill

`skills/local-deepwiki/SKILL.md` is the actual "wiki engine" — a playbook the user's coding agent loads. `deepwiki init` (`src/init.ts:19`) copies it into the target repo's `.claude/skills/local-deepwiki/SKILL.md` (Claude Code's convention; other agents can be pointed at the file directly).

## What it instructs the agent to do

```
user: "generate the deepwiki"
  │
  ▼
agent ── deepwiki scan ──► summary + analysis.json
  │
  ├─ plan adaptive page tree, read load-bearing files
  ├─ write .deepwiki/*.md + wiki.json
  └─ deepwiki status --update   (seal hashes)
  │
  ▼
user browses with: deepwiki tui
```

Three workflows:

1. **Generate** — scan, plan a structure *adapted to the repo* (no fixed taxonomy: a CLI gets no "Database" page), read the load-bearing files the scan points at, write pages with terminal-friendly diagrams + `file:line` references + a `## Sources` footer, register everything in `wiki.json`, seal hashes.
2. **Update** — `deepwiki status --json` is the work list; only stale pages get rewritten, using `git diff` on their sources to scope the edit.
3. **Answer questions** — the wiki is the agent's *index*, not its answer: find the page, verify against the code it cites, answer with `file:line`, and repair the page if it drifted.

## Design stance

- The wiki must be **checkable**: every claim traceable to a file in `## Sources`. The AST scan keeps the structure honest; the hashes keep it current.
- Pages are plain markdown written for a terminal — compact ASCII diagrams over large mermaid, no HTML, no chat UI, no keys. Rendering belongs to the TUI, intelligence belongs to the agent.
- `.deepwiki/*.md` and `wiki.json` are committed like any other docs; `analysis.json` is disposable and gitignored (`ensureWikiDir`, `src/init.ts:27`).

## Sources

- `skills/local-deepwiki/SKILL.md`
- `src/init.ts`
