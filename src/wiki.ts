import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { walkRepo } from './scan/walk.js';
import { MANIFEST_FILE, WIKI_DIR, type WikiManifest, type WikiPage } from './types.js';

export function wikiDir(root: string): string {
  return path.join(root, WIKI_DIR);
}

export function loadManifest(root: string): WikiManifest | null {
  const p = path.join(wikiDir(root), MANIFEST_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as WikiManifest;
  } catch (err) {
    throw new Error(`Could not parse ${p}: ${(err as Error).message}`);
  }
}

export function saveManifest(root: string, manifest: WikiManifest): void {
  const dir = wikiDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

export function flattenPages(pages: WikiPage[]): WikiPage[] {
  const out: WikiPage[] = [];
  const visit = (ps: WikiPage[]) => {
    for (const p of ps) {
      out.push(p);
      if (p.children) visit(p.children);
    }
  };
  visit(pages);
  return out;
}

/**
 * Hash the current content of a page's sources. Sources may be files or
 * directories (directories cover every tracked file beneath them).
 */
export function hashSources(root: string, sources: string[]): string {
  const tracked = walkRepo(root);
  const entries: string[] = [];
  const wants = sources.map((s) => s.replace(/\/+$/, ''));
  for (const f of tracked) {
    const hit = wants.some((s) => f.rel === s || f.rel.startsWith(s + '/'));
    if (!hit) continue;
    let content: Buffer;
    try { content = fs.readFileSync(f.abs); } catch { continue; }
    entries.push(`${f.rel}:${createHash('sha256').update(content).digest('hex')}`);
  }
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

export type PageStatus = 'fresh' | 'stale' | 'untracked' | 'missing-file';

export interface StatusEntry {
  page: WikiPage;
  status: PageStatus;
}

export function wikiStatus(root: string, manifest: WikiManifest): StatusEntry[] {
  const dir = wikiDir(root);
  return flattenPages(manifest.pages).map((page) => {
    if (!fs.existsSync(path.join(dir, page.file))) return { page, status: 'missing-file' as const };
    if (!page.sources?.length || !page.sourcesHash) return { page, status: 'untracked' as const };
    const now = hashSources(root, page.sources);
    return { page, status: now === page.sourcesHash ? ('fresh' as const) : ('stale' as const) };
  });
}

/** Recompute and store sourcesHash for every page that lists sources. */
export function sealHashes(root: string, manifest: WikiManifest): number {
  let updated = 0;
  for (const page of flattenPages(manifest.pages)) {
    if (!page.sources?.length) continue;
    page.sourcesHash = hashSources(root, page.sources);
    updated++;
  }
  manifest.generatedAt = new Date().toISOString();
  saveManifest(root, manifest);
  return updated;
}
