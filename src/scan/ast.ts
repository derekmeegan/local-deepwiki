import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { Parser, Language, type Node } from 'web-tree-sitter';
import type { LanguageSpec } from './languages.js';
import type { SymbolInfo, ImportInfo } from '../types.js';

const require = createRequire(import.meta.url);

let initialized = false;
const languageCache = new Map<string, Language>();

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await Parser.init({
    locateFile: () => require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  });
  initialized = true;
}

async function loadLanguage(spec: LanguageSpec): Promise<Language> {
  const cached = languageCache.get(spec.id);
  if (cached) return cached;
  const wasmPath = require.resolve(`@vscode/tree-sitter-wasm/wasm/${spec.wasm}`);
  const lang = await Language.load(wasmPath);
  languageCache.set(spec.id, lang);
  return lang;
}

const CONTAINER_KINDS = new Set(['class', 'interface', 'struct', 'trait', 'impl', 'module', 'enum']);

function docCommentAbove(node: Node): string | undefined {
  // Walk up through wrappers (export_statement, decorated_definition, ...) so the
  // comment sibling check happens at statement level.
  let stmt: Node = node;
  while (stmt.parent && ['export_statement', 'decorated_definition', 'lexical_declaration', 'variable_declaration'].includes(stmt.parent.type)) {
    stmt = stmt.parent;
  }
  const prev = stmt.previousNamedSibling;
  if (prev && prev.type.includes('comment') && stmt.startPosition.row - prev.endPosition.row <= 1) {
    const text = prev.text
      .replace(/^\/\*+|\*+\/$/g, '')
      .split('\n')
      .map((l) => l.replace(/^\s*(\/\/\/?|\*|#)\s?/, '').trim())
      .filter(Boolean);
    const first = text[0];
    if (first && !first.startsWith('eslint') && !first.startsWith('@ts-')) {
      return first.length > 160 ? first.slice(0, 157) + '...' : first;
    }
  }
  // Python docstring
  if (node.type === 'function_definition' || node.type === 'class_definition') {
    const body = node.childForFieldName('body');
    const first = body?.namedChildren[0];
    if (first?.type === 'expression_statement' && first.namedChildren[0]?.type === 'string') {
      const doc = first.namedChildren[0]!.text.replace(/^[bruf]*("""|'''|"|')/i, '').replace(/("""|'''|"|')$/, '').trim();
      const line = doc.split('\n')[0].trim();
      if (line) return line.length > 160 ? line.slice(0, 157) + '...' : line;
    }
  }
  return undefined;
}

function signatureOf(node: Node, source: string): string {
  const start = node.startIndex;
  const bodyChild = node.childForFieldName('body');
  const end = bodyChild ? bodyChild.startIndex : Math.min(node.endIndex, start + 300);
  let sig = source.slice(start, end).replace(/\s+/g, ' ').trim();
  if (sig.length > 200) sig = sig.slice(0, 197) + '...';
  return sig;
}

function enclosingContainer(node: Node, spec: LanguageSpec): string | undefined {
  let cur = node.parent;
  while (cur) {
    const kind = spec.symbolTypes[cur.type];
    if (kind && CONTAINER_KINDS.has(kind)) {
      const name = cur.childForFieldName('name');
      return name?.text;
    }
    if (cur.type === 'impl_item') {
      return cur.childForFieldName('type')?.text;
    }
    cur = cur.parent;
  }
  return undefined;
}

export interface ExtractResult {
  symbols: SymbolInfo[];
  imports: ImportInfo[];
}

export async function extractFile(spec: LanguageSpec, source: string): Promise<ExtractResult> {
  await ensureInit();
  const lang = await loadLanguage(spec);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  const symbols: SymbolInfo[] = [];
  const imports: ImportInfo[] = [];
  if (!tree) { parser.delete(); return { symbols, imports }; }

  const push = (kind: SymbolInfo['kind'], name: string, node: Node) => {
    if (!name || name.length > 200) return;
    const parent = kind === 'method' || kind === 'function' ? enclosingContainer(node, spec) : undefined;
    const effectiveKind = kind === 'function' && parent ? 'method' : kind;
    symbols.push({
      kind: effectiveKind,
      name,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      exported: spec.isExported ? spec.isExported(node, name) : true,
      signature: signatureOf(node, source),
      doc: docCommentAbove(node),
      ...(parent ? { parent } : {}),
    });
  };

  const visit = (node: Node) => {
    const custom = spec.custom?.(node);
    if (custom) {
      for (const c of custom) push(c.kind, c.name, c.node);
    } else {
      const kind = spec.symbolTypes[node.type];
      if (kind) {
        const nameNode = node.childForFieldName('name');
        if (nameNode) push(kind, nameNode.text, node);
      }
    }
    if (spec.importTypes.includes(node.type)) {
      const raw = spec.importSource ? spec.importSource(node) : null;
      if (raw) imports.push({ raw, line: node.startPosition.row + 1, external: true });
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };

  visit(tree.rootNode);
  tree.delete();
  parser.delete();
  return { symbols, imports };
}

export function fileExists(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
