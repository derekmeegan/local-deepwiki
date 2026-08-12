import type { Node } from 'web-tree-sitter';
import type { SymbolInfo } from '../types.js';

type Kind = SymbolInfo['kind'];

export interface LanguageSpec {
  id: string;
  wasm: string;
  extensions: string[];
  /** node type -> symbol kind for straightforward declarations */
  symbolTypes: Record<string, Kind>;
  /** node types that contain import/include information */
  importTypes: string[];
  /** extract the imported module string from an import node */
  importSource?: (node: Node) => string | null;
  /** is this symbol part of the public surface? */
  isExported?: (node: Node, name: string) => boolean;
  /** handle nodes the generic table can't (returns null to fall through) */
  custom?: (node: Node) => { kind: Kind; name: string; node: Node }[] | null;
}

const firstString = (node: Node): string | null => {
  if (node.type.includes('string')) return stripQuotes(node.text);
  for (const child of node.namedChildren) {
    if (!child) continue;
    const s = firstString(child);
    if (s) return s;
  }
  return null;
};

const stripQuotes = (s: string) =>
  s.replace(/^[bruf]*["'`]+/i, '').replace(/["'`]+$/, '');

const hasAncestor = (node: Node, types: string[], stopAt = 6): boolean => {
  let cur = node.parent, depth = 0;
  while (cur && depth < stopAt) {
    if (types.includes(cur.type)) return true;
    cur = cur.parent;
    depth++;
  }
  return false;
};

const hasChildModifier = (node: Node, word: string): boolean => {
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'modifiers' || child.type === 'visibility_modifier' || child.type === 'modifier') {
      if (child.text.includes(word)) return true;
    }
    if (child.text === word && child.startIndex - node.startIndex < 40) return true;
  }
  return false;
};

const jsFamily = (id: string, wasm: string, extensions: string[]): LanguageSpec => ({
  id, wasm, extensions,
  symbolTypes: {
    function_declaration: 'function',
    generator_function_declaration: 'function',
    class_declaration: 'class',
    abstract_class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    enum_declaration: 'enum',
    method_definition: 'method',
  },
  importTypes: ['import_statement'],
  importSource: firstString,
  isExported: (node) => hasAncestor(node, ['export_statement'], 3),
  custom: (node) => {
    // const foo = () => {} / const foo = function () {}
    if (node.type === 'variable_declarator') {
      const value = node.childForFieldName('value');
      const name = node.childForFieldName('name');
      if (name && value && ['arrow_function', 'function_expression', 'generator_function'].includes(value.type)) {
        return [{ kind: 'function', name: name.text, node }];
      }
    }
    return null;
  },
});

export const LANGUAGES: LanguageSpec[] = [
  jsFamily('typescript', 'tree-sitter-typescript.wasm', ['.ts', '.mts', '.cts']),
  jsFamily('tsx', 'tree-sitter-tsx.wasm', ['.tsx']),
  jsFamily('javascript', 'tree-sitter-javascript.wasm', ['.js', '.mjs', '.cjs', '.jsx']),
  {
    id: 'python',
    wasm: 'tree-sitter-python.wasm',
    extensions: ['.py'],
    symbolTypes: { function_definition: 'function', class_definition: 'class' },
    importTypes: ['import_statement', 'import_from_statement'],
    importSource: (node) => {
      const mod = node.childForFieldName('module_name') ?? node.namedChildren[0];
      return mod ? mod.text : null;
    },
    isExported: (node, name) => !name.startsWith('_'),
  },
  {
    id: 'go',
    wasm: 'tree-sitter-go.wasm',
    extensions: ['.go'],
    symbolTypes: { function_declaration: 'function', method_declaration: 'method' },
    importTypes: ['import_spec'],
    importSource: firstString,
    isExported: (_node, name) => /^[A-Z]/.test(name),
    custom: (node) => {
      if (node.type === 'type_spec') {
        const name = node.childForFieldName('name');
        const type = node.childForFieldName('type');
        if (!name) return null;
        const kind: Kind = type?.type === 'struct_type' ? 'struct'
          : type?.type === 'interface_type' ? 'interface' : 'type';
        return [{ kind, name: name.text, node }];
      }
      return null;
    },
  },
  {
    id: 'rust',
    wasm: 'tree-sitter-rust.wasm',
    extensions: ['.rs'],
    symbolTypes: {
      function_item: 'function', struct_item: 'struct', enum_item: 'enum',
      trait_item: 'trait', mod_item: 'module', type_item: 'type', const_item: 'constant',
    },
    importTypes: ['use_declaration'],
    importSource: (node) => node.namedChildren[0]?.text ?? null,
    isExported: (node) => hasChildModifier(node, 'pub'),
    custom: (node) => {
      if (node.type === 'impl_item') {
        const type = node.childForFieldName('type');
        const trait = node.childForFieldName('trait');
        if (type) {
          const name = trait ? `${trait.text} for ${type.text}` : type.text;
          return [{ kind: 'impl', name, node }];
        }
      }
      return null;
    },
  },
  {
    id: 'java',
    wasm: 'tree-sitter-java.wasm',
    extensions: ['.java'],
    symbolTypes: {
      class_declaration: 'class', interface_declaration: 'interface',
      enum_declaration: 'enum', method_declaration: 'method',
      constructor_declaration: 'method', record_declaration: 'class',
    },
    importTypes: ['import_declaration'],
    importSource: (node) => node.namedChildren.find((c) => c && c.type.includes('identifier'))?.text ?? null,
    isExported: (node) => hasChildModifier(node, 'public'),
  },
  {
    id: 'ruby',
    wasm: 'tree-sitter-ruby.wasm',
    extensions: ['.rb'],
    symbolTypes: { method: 'method', singleton_method: 'method', class: 'class', module: 'module' },
    importTypes: [],
  },
  {
    id: 'c_sharp',
    wasm: 'tree-sitter-c-sharp.wasm',
    extensions: ['.cs'],
    symbolTypes: {
      class_declaration: 'class', interface_declaration: 'interface',
      struct_declaration: 'struct', enum_declaration: 'enum',
      method_declaration: 'method', record_declaration: 'class',
    },
    importTypes: ['using_directive'],
    importSource: (node) => node.namedChildren[0]?.text ?? null,
    isExported: (node) => hasChildModifier(node, 'public'),
  },
  {
    id: 'php',
    wasm: 'tree-sitter-php.wasm',
    extensions: ['.php'],
    symbolTypes: {
      function_definition: 'function', method_declaration: 'method',
      class_declaration: 'class', interface_declaration: 'interface',
      trait_declaration: 'trait', enum_declaration: 'enum',
    },
    importTypes: ['namespace_use_declaration'],
    importSource: (node) => node.namedChildren[0]?.text ?? null,
  },
  {
    id: 'c',
    wasm: 'tree-sitter-cpp.wasm', // the C++ grammar parses C files fine for our purposes
    extensions: ['.c', '.h'],
    symbolTypes: { function_definition: 'function', struct_specifier: 'struct', enum_specifier: 'enum' },
    importTypes: ['preproc_include'],
    importSource: (node) => {
      const p = node.childForFieldName('path');
      return p ? stripQuotes(p.text.replace(/^</, '').replace(/>$/, '')) : null;
    },
  },
  {
    id: 'cpp',
    wasm: 'tree-sitter-cpp.wasm',
    extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh'],
    symbolTypes: {
      function_definition: 'function', struct_specifier: 'struct',
      class_specifier: 'class', enum_specifier: 'enum',
    },
    importTypes: ['preproc_include'],
    importSource: (node) => {
      const p = node.childForFieldName('path');
      return p ? stripQuotes(p.text.replace(/^</, '').replace(/>$/, '')) : null;
    },
  },
];

export function languageForFile(rel: string): LanguageSpec | undefined {
  const dot = rel.lastIndexOf('.');
  if (dot === -1) return undefined;
  const ext = rel.slice(dot).toLowerCase();
  return LANGUAGES.find((l) => l.extensions.includes(ext));
}
