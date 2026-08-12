#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { scanRepo, summarize } from './scan/scanner.js';
import { loadManifest, sealHashes, wikiStatus } from './wiki.js';
import { runTui, printTree } from './tui/tui.js';
import { installSkill, ensureWikiDir } from './init.js';
import { ANALYSIS_FILE, WIKI_DIR } from './types.js';

const program = new Command();

program
  .name('deepwiki')
  .description('local-deepwiki — an AST scanner, staleness tracker, and terminal wiki browser.\nThe wiki itself is written by your own coding agent (see the bundled skill).')
  .version('0.1.0');

const resolveRoot = (p?: string) => path.resolve(p ?? '.');

program
  .command('scan')
  .argument('[path]', 'repo root', '.')
  .description('AST-parse the repo (tree-sitter) and write .deepwiki/analysis.json')
  .option('--json', 'print full analysis JSON to stdout instead of a summary')
  .option('-o, --out <file>', 'output file', path.join(WIKI_DIR, ANALYSIS_FILE))
  .action(async (p: string, opts: { json?: boolean; out: string }) => {
    const root = resolveRoot(p);
    const started = Date.now();
    const analysis = await scanRepo(root, {
      onProgress: (done, total) => {
        if (process.stderr.isTTY && (done % 25 === 0 || done === total)) {
          process.stderr.write(`\rparsing ${done}/${total} files…`);
        }
      },
    });
    if (process.stderr.isTTY) process.stderr.write('\r\x1b[2K');
    const outPath = path.resolve(root, opts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(analysis, null, 1));
    if (opts.json) {
      console.log(JSON.stringify(analysis));
    } else {
      console.log(summarize(analysis));
      console.log(`\nFull analysis written to ${path.relative(root, outPath)} in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
      console.log(`Query it with jq, e.g.: jq '.files[] | select(.path == "some/file") | .symbols' ${path.relative(root, outPath)}`);
    }
  });

program
  .command('status')
  .argument('[path]', 'repo root', '.')
  .description('compare each wiki page\'s recorded source hashes against the working tree')
  .option('--json', 'machine-readable output')
  .option('--update', 'recompute and store hashes for all pages (run after regenerating pages)')
  .action((p: string, opts: { json?: boolean; update?: boolean }) => {
    const root = resolveRoot(p);
    const manifest = loadManifest(root);
    if (!manifest) {
      console.error(`No ${WIKI_DIR}/wiki.json found. Ask your coding agent to generate the wiki (local-deepwiki skill).`);
      process.exitCode = 1;
      return;
    }
    if (opts.update) {
      const n = sealHashes(root, manifest);
      console.log(`Updated source hashes for ${n} page(s).`);
      return;
    }
    const entries = wikiStatus(root, manifest);
    if (opts.json) {
      console.log(JSON.stringify(entries.map((e) => ({
        id: e.page.id,
        file: e.page.file,
        status: e.status,
        sources: e.page.sources ?? [],
      })), null, 2));
      return;
    }
    for (const e of entries) {
      const icon = e.status === 'fresh' ? '✓' : e.status === 'stale' ? '✗' : '?';
      console.log(`${icon} ${e.status.padEnd(12)} ${e.page.id.padEnd(28)} ${e.page.file}`);
    }
    const stale = entries.filter((e) => e.status !== 'fresh');
    console.log(stale.length
      ? `\n${stale.length} page(s) need attention. Ask your coding agent to update them.`
      : '\nWiki is up to date with the working tree.');
    if (stale.some((e) => e.status === 'stale')) process.exitCode = 2;
  });

program
  .command('tui')
  .argument('[path]', 'repo root', '.')
  .description('browse the wiki in the terminal (prints the page tree when not a TTY)')
  .action((p: string) => {
    runTui(resolveRoot(p));
  });

program
  .command('tree')
  .argument('[path]', 'repo root', '.')
  .description('print the wiki page tree')
  .action((p: string) => {
    printTree(resolveRoot(p));
  });

program
  .command('init')
  .argument('[path]', 'repo root', '.')
  .description('install the local-deepwiki skill into .claude/skills/ and create .deepwiki/')
  .action((p: string) => {
    const root = resolveRoot(p);
    const { installed } = installSkill(root);
    ensureWikiDir(root);
    console.log(`Installed skill → ${installed}`);
    console.log(`Created ${WIKI_DIR}/ (analysis.json is gitignored; wiki pages are meant to be committed).`);
    console.log('\nNext: ask your coding agent to "generate the deepwiki for this repo".');
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
