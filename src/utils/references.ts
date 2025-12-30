import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const execAsync = promisify(exec);

export interface Reference {
  file: string;
  line: number;
  column?: number;
  context: string; // The line of code containing the reference
  type: "import" | "usage" | "unknown";
}

export interface ReferenceFinderOptions {
  cwd: string;
  excludeFiles?: string[];
  maxResults?: number;
}

/**
 * Find references to a symbol using grep (fallback when LSP unavailable)
 * This is a best-effort search - not as accurate as LSP but works everywhere
 */
export async function findReferencesGrep(
  symbol: string,
  options: ReferenceFinderOptions
): Promise<Reference[]> {
  const { cwd, excludeFiles = [], maxResults = 50 } = options;
  const references: Reference[] = [];
  const excludeSet = new Set(excludeFiles.map((f) => resolve(cwd, f)));

  try {
    // Use ripgrep if available, fall back to grep
    let cmd: string;
    try {
      await execAsync("which rg");
      // ripgrep with word boundary
      cmd = `rg -n --no-heading -w "${symbol}" --type ts --type js --type tsx --type jsx 2>/dev/null || true`;
    } catch {
      // Fall back to grep
      cmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -w "${symbol}" . 2>/dev/null || true`;
    }

    const { stdout } = await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 });

    for (const line of stdout.trim().split("\n")) {
      if (!line || references.length >= maxResults) break;

      // Parse grep/rg output: file:line:content
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (!match) continue;

      const [, filePath, lineNum, context] = match;
      const fullPath = resolve(cwd, filePath);

      // Skip excluded files
      if (excludeSet.has(fullPath)) continue;

      // Determine reference type
      let type: Reference["type"] = "unknown";
      const trimmedContext = context.trim();
      if (trimmedContext.startsWith("import ") || trimmedContext.includes(" from ")) {
        type = "import";
      } else if (trimmedContext.includes(symbol)) {
        type = "usage";
      }

      references.push({
        file: relative(cwd, fullPath),
        line: parseInt(lineNum, 10),
        context: trimmedContext.slice(0, 200), // Truncate long lines
        type,
      });
    }
  } catch (error) {
    // Grep failed, return empty
  }

  return references;
}

/**
 * Find files that import a specific file
 * More accurate than symbol search for finding dependents
 */
export async function findImportersOf(
  targetFile: string,
  options: ReferenceFinderOptions
): Promise<Reference[]> {
  const { cwd, excludeFiles = [], maxResults = 50 } = options;
  const references: Reference[] = [];
  const excludeSet = new Set(excludeFiles.map((f) => resolve(cwd, f)));

  // Generate patterns to search for
  // e.g., "./utils/auth" or "../utils/auth" or "@/utils/auth"
  const baseName = targetFile
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/index$/, "");

  // Search for imports containing this file path
  const searchPatterns = [
    baseName,
    baseName.split("/").pop() || baseName, // Just the filename
  ];

  try {
    for (const pattern of searchPatterns) {
      if (references.length >= maxResults) break;

      // Search for import statements containing this pattern
      const cmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -E "from ['\"].*${pattern}['\"]" . 2>/dev/null || true`;

      const { stdout } = await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 });

      for (const line of stdout.trim().split("\n")) {
        if (!line || references.length >= maxResults) break;

        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (!match) continue;

        const [, filePath, lineNum, context] = match;
        const fullPath = resolve(cwd, filePath);

        // Skip excluded files and the target file itself
        if (excludeSet.has(fullPath)) continue;
        if (resolve(cwd, targetFile) === fullPath) continue;

        // Avoid duplicates
        if (references.some((r) => r.file === relative(cwd, fullPath) && r.line === parseInt(lineNum, 10))) {
          continue;
        }

        references.push({
          file: relative(cwd, fullPath),
          line: parseInt(lineNum, 10),
          context: context.trim().slice(0, 200),
          type: "import",
        });
      }
    }
  } catch (error) {
    // Grep failed
  }

  return references;
}

/**
 * Find all references to exports from a file
 * Combines symbol search with import search for better coverage
 */
export async function findAllReferencesToFile(
  targetFile: string,
  exportedSymbols: string[],
  options: ReferenceFinderOptions
): Promise<Reference[]> {
  const allRefs: Reference[] = [];
  const seen = new Set<string>();

  // First, find direct importers
  const importers = await findImportersOf(targetFile, options);
  for (const ref of importers) {
    const key = `${ref.file}:${ref.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      allRefs.push(ref);
    }
  }

  // Then search for each exported symbol
  for (const symbol of exportedSymbols) {
    if (allRefs.length >= (options.maxResults || 50)) break;

    // Skip common/generic names that would have too many false positives
    if (symbol.length < 3 || ["get", "set", "map", "use", "is"].includes(symbol.toLowerCase())) {
      continue;
    }

    const symbolRefs = await findReferencesGrep(symbol, {
      ...options,
      maxResults: Math.min(20, (options.maxResults || 50) - allRefs.length),
    });

    for (const ref of symbolRefs) {
      const key = `${ref.file}:${ref.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        allRefs.push(ref);
      }
    }
  }

  return allRefs.slice(0, options.maxResults || 50);
}
