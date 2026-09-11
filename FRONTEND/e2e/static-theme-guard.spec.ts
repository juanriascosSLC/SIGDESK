import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * EXACT-FILE ALLOWLIST
 *
 * Each entry must specify:
 * - exact relative path from `FRONTEND/src/` (NO directory wildcards allowed)
 * - explicit reason justifying why this raw color is intentional and accessible in both themes
 * - allowed patterns for that exact file
 */
export interface AllowlistEntry {
  filePath: string;
  reason: string;
  allowedPatterns: (string | RegExp)[];
}

export const EXACT_FILE_ALLOWLIST: AllowlistEntry[] = [
  {
    filePath: 'index.css',
    reason: 'Central design token declarations for base, dark, and services department palettes.',
    allowedPatterns: [/#1d2026/, /#191c22/, /#e1e2eb/, /color-scheme:\s*dark/],
  },
  {
    filePath: 'components/ui/Dialog.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/60 backdrop-blur-sm).',
    allowedPatterns: [/bg-black\/60/],
  },
  {
    filePath: 'components/ui/Drawer.tsx',
    reason: 'Intentional semantic sliding drawer backdrop overlay (bg-black/60 backdrop-blur-sm).',
    allowedPatterns: [/bg-black\/60/],
  },
  {
    filePath: 'features/admin/catalog-builder/template-designer/TemplatePreview.tsx',
    reason: 'Intentional semantic full-screen preview backdrop overlay (bg-black/60).',
    allowedPatterns: [/bg-black\/60/],
  },
  {
    filePath: 'features/admin/catalog-builder/template-designer/page-designer/PageTemplatePreview.tsx',
    reason: 'Intentional semantic full-screen preview backdrop overlay (bg-black/60).',
    allowedPatterns: [/bg-black\/60/],
  },
  {
    filePath: 'features/automations/WorkflowBuilder.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/70).',
    allowedPatterns: [/bg-black\/70/],
  },
  {
    filePath: 'features/automations/WorkflowCanvasEditor.tsx',
    reason: 'Intentional modal backdrop (bg-black/70) and JavaScript props for React Flow / MiniMap theme styling.',
    allowedPatterns: [/bg-black\/70/, /#020617/, /#0891b2/, /#06b6d4/, /#f1f5f9/, /rgba\(2, 6, 23/],
  },
  {
    filePath: 'features/changes/ChangeBoard.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/75 backdrop-blur-md).',
    allowedPatterns: [/bg-black\/75/],
  },
  {
    filePath: 'features/changes/ChangeTasksBoard.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/70).',
    allowedPatterns: [/bg-black\/70/],
  },
  {
    filePath: 'features/changes/IncidentChangeDialog.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/75 backdrop-blur-md).',
    allowedPatterns: [/bg-black\/75/],
  },
  {
    filePath: 'features/problems/IncidentProblemDialog.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/75 backdrop-blur-md).',
    allowedPatterns: [/bg-black\/75/],
  },
  {
    filePath: 'features/problems/ProblemChangeDialog.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/75 backdrop-blur-md).',
    allowedPatterns: [/bg-black\/75/],
  },
  {
    filePath: 'features/problems/ProblemsList.tsx',
    reason: 'Intentional semantic modal backdrop overlay (bg-black/75 backdrop-blur-md).',
    allowedPatterns: [/bg-black\/75/],
  },
];

export interface DisallowedRule {
  name: string;
  check: (line: string) => boolean;
}

export const DISALLOWED_RULES: DisallowedRule[] = [
  {
    name: 'Hardcoded dark surface #1d2026',
    check: (line: string) => /#1d2026/i.test(line),
  },
  {
    name: 'Hardcoded dark surface #191c22',
    check: (line: string) => /#191c22/i.test(line),
  },
  {
    name: 'Hardcoded dark text #e1e2eb',
    check: (line: string) => /#e1e2eb/i.test(line),
  },
  {
    name: "Forced inline colorScheme: 'dark'",
    check: (line: string) => {
      if (/colorScheme\s*:\s*['"]dark['"]/i.test(line)) return true;
      if (/(?<!prefers-)color-scheme\s*:\s*dark/i.test(line)) return true;
      return false;
    },
  },
  {
    name: 'Global class substring theme workaround [class*="text-..."]',
    check: (line: string) => /\[class\*=["']?text-/i.test(line),
  },
  {
    name: 'Unscoped bg-slate-900',
    check: (line: string) => {
      const matches = line.match(/\b(?:[\w:-]+:)?bg-slate-900\b/g);
      if (!matches) return false;
      return matches.some((token) => !token.startsWith('dark:'));
    },
  },
  {
    name: 'Unscoped bg-slate-950',
    check: (line: string) => {
      const matches = line.match(/\b(?:[\w:-]+:)?bg-slate-950\b/g);
      if (!matches) return false;
      return matches.some((token) => !token.startsWith('dark:'));
    },
  },
];

export interface Violation {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

/**
 * Pure scanner function suitable for production files or synthetic fixture testing.
 */
export function scanFileContent(
  relPath: string,
  content: string,
  allowlist: AllowlistEntry[] = EXACT_FILE_ALLOWLIST
): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split('\n');
  const allowlistEntry = allowlist.find((e) => e.filePath === relPath);

  lines.forEach((line, idx) => {
    for (const rule of DISALLOWED_RULES) {
      if (rule.check(line)) {
        let isAllowed = false;
        if (allowlistEntry) {
          for (const allowed of allowlistEntry.allowedPatterns) {
            if (typeof allowed === 'string' && line.includes(allowed)) {
              isAllowed = true;
              break;
            } else if (allowed instanceof RegExp && allowed.test(line)) {
              isAllowed = true;
              break;
            }
          }
        }

        if (!isAllowed) {
          violations.push({
            file: relPath,
            line: idx + 1,
            pattern: rule.name,
            snippet: line.trim(),
          });
        }
      }
    }
  });

  return violations;
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (entry.isFile() && /\.(tsx?|css)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

test.describe('Theme Architecture - Static Regression Guard', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const allSourceFiles = getAllFiles(srcDir);

  test('production codebase has zero static theme violations', () => {
    const violations: Violation[] = [];

    for (const file of allSourceFiles) {
      const relPath = path.relative(srcDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');
      violations.push(...scanFileContent(relPath, content));
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} [${v.pattern}] -> ${v.snippet}`)
        .join('\n');
      expect.soft(violations.length, `Found ${violations.length} disallowed dark style occurrences:\n${report}`).toBe(0);
    }
    expect(violations.length).toBe(0);
  });

  test('all allowlist entries point to existing files and have non-empty reasons', () => {
    for (const entry of EXACT_FILE_ALLOWLIST) {
      const fullPath = path.join(srcDir, entry.filePath);
      expect(fs.existsSync(fullPath), `Allowlisted file must exist: ${entry.filePath}`).toBe(true);
      expect(entry.reason.trim().length, `Allowlist entry ${entry.filePath} must have a valid rationale`).toBeGreaterThan(10);
    }
  });

  test('no directory-wide wildcards exist in the allowlist', () => {
    for (const entry of EXACT_FILE_ALLOWLIST) {
      expect(entry.filePath.includes('*'), `Wildcards are strictly prohibited in allowlist: ${entry.filePath}`).toBe(false);
    }
  });

  test('technical debt files like Input.tsx are not allowlisted', () => {
    const inputEntry = EXACT_FILE_ALLOWLIST.find((entry) => entry.filePath.includes('Input.tsx'));
    expect(inputEntry, 'Input.tsx must not be in the allowlist; obsolete examples should be removed from code').toBeUndefined();
  });
});

test.describe('Static Guard Mutation Sensitivity Tests (Synthetic Fixtures)', () => {
  const dummyFile = 'components/TestComponent.tsx';

  test('rejects forced inline colorScheme: dark', () => {
    const snippet = '<div style={{ colorScheme: \'dark\', background: \'red\' }}>Test</div>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('colorScheme'))).toBe(true);
  });

  test('rejects hardcoded bg-[#1d2026]', () => {
    const snippet = '<div className="rounded-lg bg-[#1d2026] text-white">Surface</div>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('#1d2026'))).toBe(true);
  });

  test('rejects hardcoded bg-[#191c22]', () => {
    const snippet = '<div className="p-4 bg-[#191c22]">Background</div>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('#191c22'))).toBe(true);
  });

  test('rejects hardcoded text-[#e1e2eb]', () => {
    const snippet = '<span className="text-[#e1e2eb]">Readable text</span>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('#e1e2eb'))).toBe(true);
  });

  test('rejects substring selector theme workaround [class*="text-..."]', () => {
    const snippet = ':root:not(.dark) [class*="text-cyan-400"] { color: #0891b2; }';
    const violations = scanFileContent('styles.css', snippet);
    expect(violations.some((v) => v.pattern.includes('[class*="text-..."]'))).toBe(true);
  });

  test('rejects unscoped bg-slate-900', () => {
    const snippet = '<aside className="w-64 bg-slate-900 text-white">Sidebar</aside>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('Unscoped bg-slate-900'))).toBe(true);
  });

  test('rejects unscoped bg-slate-950', () => {
    const snippet = '<div className="min-h-screen bg-slate-950">App</div>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.some((v) => v.pattern.includes('Unscoped bg-slate-950'))).toBe(true);
  });

  test('accepts properly scoped dark:bg-slate-900 and dark:bg-slate-950', () => {
    const snippet = '<div className="bg-surface dark:bg-slate-900 dark:bg-slate-950/80">Scoped</div>';
    const violations = scanFileContent(dummyFile, snippet);
    expect(violations.filter((v) => v.pattern.includes('bg-slate-9'))).toHaveLength(0);
  });

  test('respects exact-file allowlist only for declared patterns', () => {
    const indexCss = '--surface-container: #1d2026;\n--surface-container-low: #191c22;\n--on-surface: #e1e2eb;';
    const violations = scanFileContent('index.css', indexCss);
    expect(violations).toHaveLength(0);

    // But if index.css introduces an unallowed pattern like forced inline colorScheme or unscoped bg-slate-900:
    const indexCssWithViolation = indexCss + '\n.bad { background-color: bg-slate-900; }';
    const violations2 = scanFileContent('index.css', indexCssWithViolation);
    expect(violations2.length).toBeGreaterThan(0);
  });
});
