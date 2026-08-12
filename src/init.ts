import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Locate the packaged SKILL.md (works from dist/ and from src/ during dev). */
export function packagedSkillPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', 'skills', 'local-deepwiki', 'SKILL.md'),
    path.join(here, '..', '..', 'skills', 'local-deepwiki', 'SKILL.md'),
    // pre-0.1.1 package layout
    path.join(here, '..', 'skill', 'SKILL.md'),
    path.join(here, '..', '..', 'skill', 'SKILL.md'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Bundled SKILL.md not found in the local-deepwiki package.');
}

export function installSkill(root: string): { installed: string } {
  const src = packagedSkillPath();
  const dest = path.join(root, '.claude', 'skills', 'local-deepwiki', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return { installed: path.relative(root, dest) };
}

export function ensureWikiDir(root: string): void {
  const dir = path.join(root, '.deepwiki');
  fs.mkdirSync(dir, { recursive: true });
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'analysis.json\n');
  }
}
