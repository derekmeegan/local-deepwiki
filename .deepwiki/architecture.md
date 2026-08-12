# Architecture

The system is three loosely-coupled parts sharing one contract: the **`.deepwiki/` directory**.

## The contract

Everything meaningful is a file:

- `wiki.json` — the manifest (`WikiManifest` in `src/types.ts:57`). A tree of pages, each with `id`, `title`, `file`, optional `children` (nested section pages), and optionally `sources` (repo files/dirs the page documents) and `sourcesHash` (content hash of those sources at write time). A wiki-level `depth` field records the authoring register (standard or deep).
- `*.md` — pages: plain, terminal-friendly markdown.
- `analysis.json` — the AST scan output (`Analysis` in `src/types.ts:29`). Machine-written, gitignored, regenerated at will.

Because the contract is files, the three parts never talk to each other directly:

```
scanner (src/scan) ──writes──► analysis.json
                                    │ reads
                                    ▼
                             coding agent
                                    │ writes
                                    ▼
                         wiki.json + *.md pages
                            │              │
              hashes sources│              │ renders
                            ▼              ▼
        staleness model (src/wiki.ts)   TUI (src/tui)
              fresh / stale verdicts ──────┘
```

## Staleness: the incremental-update mechanism

`src/wiki.ts` implements the model:

- `hashSources(root, sources)` (`src/wiki.ts:43`) walks the repo (respecting `.gitignore` via `src/scan/walk.ts`), collects every tracked file under the page's `sources`, and hashes the sorted `(path, sha256)` pairs into one digest.
- `wikiStatus` (`src/wiki.ts:66`) compares each page's stored `sourcesHash` against a fresh computation → `fresh` | `stale` | `untracked` | `missing-file`.
- `sealHashes` (`src/wiki.ts:78`) recomputes and stores hashes after the agent finishes writing — invoked by `deepwiki status --update`.

This is what lets an agent update only what changed: `deepwiki status --json` is a precise work list, and `git diff` on a stale page's `sources` shows what to rewrite. The exit code (2 when stale) also makes it usable in CI.

## Why the agent is outside the box

Contrast with tools like deepwiki-rs, which embed an LLM client, provider config, caching, and prompt pipelines (~24k LOC of orchestration). Here that entire layer is deleted: the user's agent already has code-reading tools, judgment, and an interface. The package only supplies what must be **deterministic** (parsing, hashing) or **rendered** (the TUI). That's why the whole thing is ~1.2k LOC.

## Sources

- `src/types.ts`
- `src/wiki.ts`
- `src/scan/walk.ts`
