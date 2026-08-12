import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadManifest, wikiDir, wikiStatus, flattenPages } from '../wiki.js';
import type { WikiManifest, WikiPage } from '../types.js';

const ESC = '\x1b[';
const style = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, italic: `${ESC}3m`,
  underline: `${ESC}4m`, invert: `${ESC}7m`,
  blue: `${ESC}34m`, cyan: `${ESC}36m`, yellow: `${ESC}33m`, green: `${ESC}32m`, magenta: `${ESC}35m`,
};

interface NavEntry { page: WikiPage; depth: number }

function navEntries(manifest: WikiManifest): NavEntry[] {
  const out: NavEntry[] = [];
  const visit = (pages: WikiPage[], depth: number) => {
    for (const p of pages) {
      out.push({ page: p, depth });
      if (p.children) visit(p.children, depth + 1);
    }
  };
  visit(manifest.pages, 0);
  return out;
}

/** Very small markdown -> ANSI renderer. Returns display lines (may contain ANSI codes). */
export function renderMarkdown(md: string, width: number): string[] {
  const out: string[] = [];
  const lines = md.split('\n');
  let inCode = false;
  let codeLang = '';

  // Links first — once ANSI escapes are inserted, a naive [..](..) match can
  // start at the "[" inside an escape sequence and eat it.
  const inline = (s: string): string => s
    .replace(/\[([^\]\x1b]+)\]\(([^)\x1b]+)\)/g, `${style.underline}$1${style.reset}${style.dim} ($2)${style.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${style.bold}$1${style.reset}`)
    .replace(/(?<![\w`])_([^_\x1b]+)_(?![\w`])/g, `${style.italic}$1${style.reset}`)
    .replace(/`([^`\x1b]+)`/g, `${style.cyan}$1${style.reset}`);

  const wrap = (s: string, indent = 0): string[] => {
    const pad = ' '.repeat(indent);
    // eslint-disable-next-line no-control-regex
    const visible = (t: string) => t.replace(/\x1b\[[0-9;]*m/g, '').length;
    const words = s.split(' ');
    const res: string[] = [];
    let cur = pad;
    for (const w of words) {
      if (visible(cur) + visible(w) + 1 > width && visible(cur) > indent) {
        res.push(cur);
        cur = pad + w;
      } else {
        cur = cur === pad ? pad + w : cur + ' ' + w;
      }
    }
    if (cur.trim()) res.push(cur);
    return res.length ? res : [''];
  };

  // eslint-disable-next-line no-control-regex
  const visibleLen = (t: string) => t.replace(/\x1b\[[0-9;]*m/g, '').length;
  const clip = (t: string, max: number) => {
    if (visibleLen(t) <= max) return t;
    let outStr = '';
    let n = 0;
    for (let i = 0; i < t.length && n < max - 1; i++) {
      if (t[i] === '\x1b') {
        const m = t.slice(i).match(/^\x1b\[[0-9;]*m/);
        if (m) { outStr += m[0]; i += m[0].length - 1; continue; }
      }
      outStr += t[i];
      n++;
    }
    return outStr + style.reset + '…';
  };

  const tableBuf: string[] = [];
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .filter((r) => !/^\|?[\s\-:|]+\|?$/.test(r)) // drop separator rows
      .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim())));
    tableBuf.length = 0;
    if (!rows.length) return;
    const cols = Math.max(...rows.map((r) => r.length));
    const widths = Array.from({ length: cols }, (_, i) =>
      Math.max(...rows.map((r) => visibleLen(r[i] ?? ''))));
    // shrink widest columns until the table fits
    const overhead = cols * 3 + 1;
    let total = widths.reduce((a, b) => a + b, 0) + overhead;
    while (total > width && Math.max(...widths) > 8) {
      const iMax = widths.indexOf(Math.max(...widths));
      widths[iMax]--;
      total--;
    }
    const line = (l: string, m: string, r: string) =>
      `${style.dim}${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${r}${style.reset}`;
    out.push(line('┌', '┬', '┐'));
    rows.forEach((r, ri) => {
      const cells = widths.map((w, i) => {
        const cell = clip(r[i] ?? '', w);
        return ` ${ri === 0 ? style.bold : ''}${cell}${style.reset}${' '.repeat(Math.max(0, w - visibleLen(clip(r[i] ?? '', w))))} `;
      });
      out.push(`${style.dim}│${style.reset}${cells.join(`${style.dim}│${style.reset}`)}${style.dim}│${style.reset}`);
      if (ri === 0 && rows.length > 1) out.push(line('├', '┼', '┤'));
    });
    out.push(line('└', '┴', '┘'));
  };

  for (const raw of lines) {
    if (!inCode && raw.trimStart().startsWith('|')) {
      tableBuf.push(raw.trim());
      continue;
    }
    flushTable();
    if (raw.trimStart().startsWith('```')) {
      if (!inCode) {
        codeLang = raw.trim().slice(3).trim();
        out.push(`${style.dim}┌─ ${codeLang || 'code'} ${'─'.repeat(Math.max(1, width - (codeLang || 'code').length - 5))}${style.reset}`);
      } else {
        out.push(`${style.dim}└${'─'.repeat(Math.max(1, width - 1))}${style.reset}`);
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${style.dim}│${style.reset} ${raw.slice(0, width - 2)}`);
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      out.push('');
      const text = h[2];
      if (h[1].length === 1) {
        out.push(`${style.bold}${style.blue}${text}${style.reset}`);
        out.push(`${style.blue}${'═'.repeat(Math.min(width, Math.max(4, text.length)))}${style.reset}`);
      } else if (h[1].length === 2) {
        out.push(`${style.bold}${style.magenta}${text}${style.reset}`);
        out.push(`${style.dim}${'─'.repeat(Math.min(width, Math.max(4, text.length)))}${style.reset}`);
      } else {
        out.push(`${style.bold}${text}${style.reset}`);
      }
      continue;
    }
    const bullet = raw.match(/^(\s*)[-*]\s+(.*)/);
    if (bullet) {
      const indent = bullet[1].length;
      const wrapped = wrap(inline(bullet[2]), indent + 4);
      out.push(`${' '.repeat(indent)}  ${style.yellow}•${style.reset} ${wrapped[0]?.trimStart() ?? ''}`);
      out.push(...wrapped.slice(1));
      continue;
    }
    const num = raw.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (num) {
      const wrapped = wrap(inline(num[3]), num[1].length + 4);
      out.push(`${num[1]}  ${style.yellow}${num[2]}.${style.reset} ${wrapped[0]?.trimStart() ?? ''}`);
      out.push(...wrapped.slice(1));
      continue;
    }
    if (raw.startsWith('>')) {
      out.push(...wrap(`${style.dim}▌ ${inline(raw.replace(/^>\s?/, ''))}${style.reset}`, 0));
      continue;
    }
    if (raw.trim() === '---' || raw.trim() === '***') {
      out.push(`${style.dim}${'─'.repeat(width)}${style.reset}`);
      continue;
    }
    if (!raw.trim()) { out.push(''); continue; }
    out.push(...wrap(inline(raw)));
  }
  flushTable();
  return out;
}

export function printTree(root: string): void {
  const manifest = loadManifest(root);
  if (!manifest) {
    console.log('No wiki found (.deepwiki/wiki.json missing). Ask your coding agent to generate one.');
    return;
  }
  const statuses = new Map(wikiStatus(root, manifest).map((e) => [e.page.id, e.status]));
  console.log(`${manifest.name} — ${flattenPages(manifest.pages).length} pages`);
  const visit = (pages: WikiPage[], prefix: string) => {
    pages.forEach((p, i) => {
      const last = i === pages.length - 1;
      const status = statuses.get(p.id);
      const mark = status === 'stale' ? ' [stale]' : status === 'missing-file' ? ' [missing]' : '';
      console.log(`${prefix}${last ? '└── ' : '├── '}${p.title}${mark}  (${p.file})`);
      if (p.children) visit(p.children, prefix + (last ? '    ' : '│   '));
    });
  };
  visit(manifest.pages, '');
}

export function runTui(root: string): void {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    printTree(root);
    return;
  }
  const manifest = loadManifest(root);
  if (!manifest) {
    console.log('No wiki found (.deepwiki/wiki.json missing). Ask your coding agent to generate one.');
    process.exitCode = 1;
    return;
  }
  const statuses = new Map(wikiStatus(root, manifest).map((e) => [e.page.id, e.status]));
  const entries = navEntries(manifest);
  let selected = 0;
  let scroll = 0;
  let contentCache: { id: string; lines: string[]; width: number } | null = null;

  const out = process.stdout;
  const draw = () => {
    const cols = out.columns ?? 80;
    const rows = out.rows ?? 24;
    const navWidth = Math.min(34, Math.max(24, Math.floor(cols * 0.28)));
    const contentWidth = cols - navWidth - 3;
    const bodyRows = rows - 2;

    const page = entries[selected]?.page;
    if (page && (!contentCache || contentCache.id !== page.id || contentCache.width !== contentWidth)) {
      let md: string;
      try {
        md = fs.readFileSync(path.join(wikiDir(root), page.file), 'utf8');
      } catch {
        md = `_Missing file: ${page.file}_`;
      }
      contentCache = { id: page.id, lines: renderMarkdown(md, contentWidth), width: contentWidth };
      scroll = 0;
    }
    const contentLines = contentCache?.lines ?? [];
    scroll = Math.max(0, Math.min(scroll, Math.max(0, contentLines.length - bodyRows)));

    const navTop = Math.max(0, Math.min(selected - Math.floor(bodyRows / 2), entries.length - bodyRows));
    let screen = `${ESC}2J${ESC}H`;
    // header
    const staleCount = [...statuses.values()].filter((s) => s === 'stale').length;
    const title = ` ${manifest.name} `;
    const right = staleCount ? `${staleCount} stale · q quit ` : 'j/k move · u/d scroll · q quit ';
    screen += style.invert + title + ' '.repeat(Math.max(0, cols - title.length - right.length)) + right + style.reset + '\n';

    for (let row = 0; row < bodyRows; row++) {
      const e = entries[navTop + row];
      let navCell = '';
      if (e) {
        const isSel = navTop + row === selected;
        const stale = statuses.get(e.page.id) === 'stale';
        let label = `${'  '.repeat(e.depth)}${e.page.title}`;
        if (label.length > navWidth - 4) label = label.slice(0, navWidth - 5) + '…';
        navCell = (isSel ? `${style.invert} ${label}` : ` ${label}`);
        const plainLen = 1 + label.length;
        navCell += ' '.repeat(Math.max(0, navWidth - plainLen - (stale ? 2 : 0)));
        if (stale) navCell += `${isSel ? '' : style.yellow}*${style.reset} `;
        else navCell += isSel ? '' : '';
        if (isSel) navCell += style.reset;
      } else {
        navCell = ' '.repeat(navWidth);
      }
      // normalize nav cell to navWidth visible chars is approximate; pad with spaces
      const content = contentLines[scroll + row] ?? '';
      screen += navCell + `${style.dim}│${style.reset} ` + content + '\n';
    }
    const pct = contentLines.length > bodyRows
      ? ` ${Math.round(((scroll + bodyRows) / contentLines.length) * 100)}%`
      : ' all';
    screen += style.dim + ` ${entries[selected]?.page.file ?? ''} ·${pct} · enter/l focus · r reload` + style.reset;
    out.write(screen);
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  out.write(`${ESC}?1049h${ESC}?25l`); // alt screen, hide cursor

  const cleanup = () => {
    out.write(`${ESC}?25h${ESC}?1049l`);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
  process.on('exit', cleanup);

  const bodyRows = () => (out.rows ?? 24) - 2;
  process.stdin.on('data', (key: string) => {
    switch (key) {
      case 'q':
      case '\x03': // ctrl-c
        cleanup();
        process.exit(0);
        break;
      case 'j':
      case `${ESC}B`:
        selected = Math.min(entries.length - 1, selected + 1);
        break;
      case 'k':
      case `${ESC}A`:
        selected = Math.max(0, selected - 1);
        break;
      case 'd':
      case ' ':
      case `${ESC}6~`:
        scroll += Math.floor(bodyRows() / 2);
        break;
      case 'u':
      case 'b':
        scroll -= Math.floor(bodyRows() / 2);
        break;
      case 'g':
        scroll = 0;
        break;
      case 'G':
        scroll = Number.MAX_SAFE_INTEGER;
        break;
      case 'r':
        contentCache = null;
        break;
      default:
        break;
    }
    draw();
  });
  out.on('resize', draw);
  draw();
}
