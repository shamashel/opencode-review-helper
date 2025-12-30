import { readFile } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";

export interface ImportInfo {
  source: string; // The import path (e.g., "./utils", "@/lib/auth")
  specifiers: string[]; // Named imports (e.g., ["User", "createUser"])
  isDefault: boolean; // Has default import
  isNamespace: boolean; // import * as X
  line: number;
}

export interface ExportInfo {
  name: string;
  type: "named" | "default" | "reexport";
  line: number;
}

/**
 * Extract imports from a TypeScript/JavaScript file
 * Uses regex for speed - not perfect but handles common cases
 */
export async function extractImports(filePath: string): Promise<ImportInfo[]> {
  const ext = extname(filePath);
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return [];
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return parseImports(content);
  } catch {
    return [];
  }
}

/**
 * Parse imports from file content
 */
export function parseImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split("\n");

  // Patterns for different import styles
  const patterns = [
    // import { a, b } from "module"
    /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
    // import X from "module"
    /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
    // import * as X from "module"
    /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
    // import "module" (side effect)
    /^import\s+['"]([^'"]+)['"]/,
    // import X, { a, b } from "module"
    /^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
    // Dynamic import: const x = await import("module")
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    // require (CommonJS)
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip comments
    if (line.startsWith("//") || line.startsWith("/*")) continue;

    // Try each pattern
    // import { a, b } from "module"
    let match = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const specifiers = match[1].split(",").map((s) => {
        // Handle "X as Y" syntax
        const parts = s.trim().split(/\s+as\s+/);
        return parts[0].trim();
      }).filter(Boolean);
      imports.push({
        source: match[2],
        specifiers,
        isDefault: false,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }

    // import X, { a, b } from "module"
    match = line.match(/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const specifiers = match[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      imports.push({
        source: match[3],
        specifiers: [match[1], ...specifiers],
        isDefault: true,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }

    // import * as X from "module"
    match = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      imports.push({
        source: match[2],
        specifiers: [match[1]],
        isDefault: false,
        isNamespace: true,
        line: lineNum,
      });
      continue;
    }

    // import X from "module"
    match = line.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      imports.push({
        source: match[2],
        specifiers: [match[1]],
        isDefault: true,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }

    // import "module" (side effect only)
    match = line.match(/^import\s+['"]([^'"]+)['"]/);
    if (match) {
      imports.push({
        source: match[1],
        specifiers: [],
        isDefault: false,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }
  }

  return imports;
}

/**
 * Extract exports from a TypeScript/JavaScript file
 */
export async function extractExports(filePath: string): Promise<ExportInfo[]> {
  const ext = extname(filePath);
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return [];
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return parseExports(content);
  } catch {
    return [];
  }
}

/**
 * Parse exports from file content
 */
export function parseExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip comments
    if (line.startsWith("//") || line.startsWith("/*")) continue;

    // export default
    if (line.match(/^export\s+default\s+/)) {
      // Try to extract name: export default function X, export default class X
      const match = line.match(/^export\s+default\s+(?:function|class)\s+(\w+)/);
      exports.push({
        name: match ? match[1] : "default",
        type: "default",
        line: lineNum,
      });
      continue;
    }

    // export { a, b } or export { a, b } from "module"
    let match = line.match(/^export\s+\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/);
    if (match) {
      const isReexport = !!match[2];
      const names = match[1].split(",").map((s) => {
        // Handle "X as Y" - export the "Y" name
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      }).filter(Boolean);
      
      for (const name of names) {
        exports.push({
          name,
          type: isReexport ? "reexport" : "named",
          line: lineNum,
        });
      }
      continue;
    }

    // export const/let/var/function/class/type/interface
    match = line.match(/^export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/);
    if (match) {
      exports.push({
        name: match[1],
        type: "named",
        line: lineNum,
      });
      continue;
    }

    // export * from "module"
    match = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      exports.push({
        name: `* from ${match[1]}`,
        type: "reexport",
        line: lineNum,
      });
      continue;
    }
  }

  return exports;
}

/**
 * Resolve an import path to a file path
 * Handles relative imports, not aliases (those need tsconfig)
 */
export function resolveImportPath(
  importSource: string,
  fromFile: string,
  extensions: string[] = [".ts", ".tsx", ".js", ".jsx"]
): string | null {
  // Skip node_modules and non-relative imports
  if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
    return null;
  }

  const dir = dirname(fromFile);
  const basePath = resolve(dir, importSource);

  // Return with original path - caller should check existence
  // Could be basePath, basePath.ts, basePath/index.ts, etc.
  return basePath;
}

/**
 * Build a dependency graph from changed files
 * Returns map of file -> files it imports (that are also in the changeset)
 */
export async function buildDependencyGraph(
  files: string[],
  cwd: string
): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();
  const fileSet = new Set(files.map((f) => resolve(cwd, f)));

  for (const file of files) {
    const fullPath = resolve(cwd, file);
    const imports = await extractImports(fullPath);
    const deps: string[] = [];

    for (const imp of imports) {
      const resolved = resolveImportPath(imp.source, fullPath);
      if (!resolved) continue;

      // Check if any variation of this path is in our file set
      const possiblePaths = [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + ".js",
        resolved + ".jsx",
        resolved + "/index.ts",
        resolved + "/index.tsx",
        resolved + "/index.js",
      ];

      for (const possible of possiblePaths) {
        if (fileSet.has(possible)) {
          // Convert back to relative path
          const relPath = files.find((f) => resolve(cwd, f) === possible);
          if (relPath && !deps.includes(relPath)) {
            deps.push(relPath);
          }
          break;
        }
      }
    }

    graph.set(file, deps);
  }

  return graph;
}
