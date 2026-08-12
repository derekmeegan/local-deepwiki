import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_IGNORES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.next', '.nuxt', '.svelte-kit', 'coverage', '.deepwiki', '.idea', '.vscode',
  'bower_components', '.terraform', 'Pods', 'DerivedData', '.gradle',
]);

function parseGitignore(root: string): ((rel: string, isDir: boolean) => boolean) | null {
  const giPath = path.join(root, '.gitignore');
  if (!fs.existsSync(giPath)) return null;
  const patterns: { re: RegExp; dirOnly: boolean; negate: boolean }[] = [];
  for (let line of fs.readFileSync(giPath, 'utf8').split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    let negate = false;
    if (line.startsWith('!')) { negate = true; line = line.slice(1); }
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.startsWith('/');
    if (anchored) line = line.slice(1);
    // glob -> regex (supports *, **, ?)
    let re = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '*') {
        if (line[i + 1] === '*') { re += '.*'; i++; }
        else re += '[^/]*';
      } else if (c === '?') re += '[^/]';
      else if ('.+^$()[]{}|\\'.includes(c)) re += '\\' + c;
      else re += c;
    }
    const full = anchored || line.includes('/') ? `^${re}(/|$)` : `(^|/)${re}(/|$)`;
    try { patterns.push({ re: new RegExp(full), dirOnly, negate }); } catch { /* skip bad pattern */ }
  }
  if (!patterns.length) return null;
  return (rel: string, isDir: boolean) => {
    let ignored = false;
    for (const p of patterns) {
      if (p.dirOnly && !isDir && !p.re.test(rel)) continue;
      if (p.re.test(rel)) ignored = !p.negate;
    }
    return ignored;
  };
}

export interface WalkedFile {
  abs: string;
  rel: string; // posix
  size: number;
}

const MAX_FILE_BYTES = 1_500_000;

export function walkRepo(root: string): WalkedFile[] {
  const gitignore = parseGitignore(root);
  const results: WalkedFile[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (DEFAULT_IGNORES.has(e.name)) continue;
        if (gitignore?.(rel, true)) continue;
        visit(abs);
      } else if (e.isFile()) {
        if (gitignore?.(rel, false)) continue;
        let size = 0;
        try { size = fs.statSync(abs).size; } catch { continue; }
        if (size > MAX_FILE_BYTES) continue;
        results.push({ abs, rel, size });
      }
    }
  };
  visit(root);
  results.sort((a, b) => a.rel.localeCompare(b.rel));
  return results;
}
