export interface SymbolInfo {
  kind: 'function' | 'method' | 'class' | 'interface' | 'type' | 'enum' | 'struct' | 'trait' | 'impl' | 'module' | 'constant' | 'variable';
  name: string;
  line: number;
  endLine: number;
  exported: boolean;
  signature?: string;
  doc?: string;
  parent?: string;
}

export interface ImportInfo {
  raw: string;
  line: number;
  resolved?: string; // repo-relative path when the import points inside the repo
  external: boolean;
}

export interface FileAnalysis {
  path: string; // repo-relative, posix separators
  language: string;
  loc: number;
  bytes: number;
  sha256: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
}

export interface Analysis {
  generator: string;
  root: string;
  generatedAt: string;
  stats: {
    files: number;
    parsedFiles: number;
    loc: number;
    byLanguage: Record<string, { files: number; loc: number }>;
  };
  topDirs: string[];
  files: FileAnalysis[];
  /** Internal dependency edges between repo files, resolved from imports. */
  edges: { from: string; to: string }[];
}

export interface WikiPage {
  id: string;
  title: string;
  file: string; // relative to .deepwiki/
  summary?: string;
  /** Repo-relative files or directories this page documents. Used for staleness. */
  sources?: string[];
  /** sha256 over the sorted (path, content-hash) pairs of everything under `sources`. */
  sourcesHash?: string;
  children?: WikiPage[];
}

export interface WikiManifest {
  name: string;
  description?: string;
  generator?: string;
  generatedAt?: string;
  /** Authoring register: 'standard' (orientation, default) or 'deep' (granular sections with children). */
  depth?: 'standard' | 'deep';
  pages: WikiPage[];
}

export const WIKI_DIR = '.deepwiki';
export const ANALYSIS_FILE = 'analysis.json';
export const MANIFEST_FILE = 'wiki.json';
