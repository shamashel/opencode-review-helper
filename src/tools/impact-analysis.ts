import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { extractExports } from "../utils/imports.js";
import { findAllReferencesToFile, type Reference } from "../utils/references.js";
import { loadConfig } from "../config.js";
import { resolve, relative } from "node:path";
import { existsSync } from "node:fs";

interface ImpactResult {
  file: string;
  symbol?: string;
  line: number;
  type: string;
  context: string;
}

interface TestGap {
  file: string;
  reason: string;
}

interface ImpactAnalysisResult {
  direct: ImpactResult[];
  transitive: ImpactResult[];
  test_gaps: TestGap[];
  truncated: boolean;
  total_found: number;
}

function hasTestFile(file: string, cwd: string): boolean {
  const testPatterns = [
    file.replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"),
    file.replace(/\.(ts|tsx|js|jsx)$/, ".spec.$1"),
    file.replace(/^src\//, "src/__tests__/").replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"),
    file.replace(/^src\//, "test/").replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"),
    file.replace(/^src\//, "tests/").replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"),
  ];

  for (const pattern of testPatterns) {
    if (existsSync(resolve(cwd, pattern))) {
      return true;
    }
  }

  return false;
}

export const impactAnalysisTool: ToolDefinition = tool({
  description:
    "Find code outside the changeset that could be affected by the changes. Analyzes imports and references to identify direct consumers and transitive dependencies. Helps identify potential breaking changes.",
  args: {
    files: tool.schema
      .array(tool.schema.string())
      .describe("Changed files to analyze for impact"),
    depth: tool.schema
      .number()
      .optional()
      .default(2)
      .describe("Transitive depth (1=direct only, 2+=transitive). Max 3."),
    max_results: tool.schema
      .number()
      .optional()
      .default(50)
      .describe("Maximum results per category to prevent overwhelming output"),
  },
  async execute(args, ctx) {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    const depth = Math.min(args.depth ?? 2, 3);
    const maxResults = args.max_results ?? config.impact_analysis.max_results_per_level;
    const excludeFiles = new Set(args.files);

    const directImpacts: ImpactResult[] = [];
    const transitiveImpacts: ImpactResult[] = [];
    const testGaps: TestGap[] = [];
    const seenFiles = new Set<string>();
    let totalFound = 0;

    for (const file of args.files) {
      const fullPath = resolve(cwd, file);

      if (!hasTestFile(file, cwd)) {
        const isTestFile = file.includes(".test.") || file.includes(".spec.") || file.includes("__tests__");
        if (!isTestFile) {
          testGaps.push({
            file,
            reason: "No corresponding test file found",
          });
        }
      }

      const exports = await extractExports(fullPath);
      const exportedSymbols = exports.map((e) => e.name).filter((n) => n !== "default" && !n.startsWith("*"));

      const references = await findAllReferencesToFile(file, exportedSymbols, {
        cwd,
        excludeFiles: args.files,
        maxResults,
      });

      for (const ref of references) {
        if (excludeFiles.has(ref.file)) continue;
        if (seenFiles.has(`${ref.file}:${ref.line}`)) continue;

        seenFiles.add(`${ref.file}:${ref.line}`);
        totalFound++;

        if (directImpacts.length < maxResults) {
          directImpacts.push({
            file: ref.file,
            line: ref.line,
            type: ref.type,
            context: ref.context,
          });
        }
      }
    }

    if (depth >= 2 && directImpacts.length > 0) {
      const directFiles = [...new Set(directImpacts.map((d) => d.file))];

      for (const file of directFiles.slice(0, 10)) {
        if (transitiveImpacts.length >= maxResults) break;

        const fullPath = resolve(cwd, file);
        const exports = await extractExports(fullPath);
        const exportedSymbols = exports.map((e) => e.name).filter((n) => n !== "default" && !n.startsWith("*"));

        const allExcluded = [...args.files, ...directFiles];
        const references = await findAllReferencesToFile(file, exportedSymbols, {
          cwd,
          excludeFiles: allExcluded,
          maxResults: Math.min(20, maxResults - transitiveImpacts.length),
        });

        for (const ref of references) {
          if (excludeFiles.has(ref.file)) continue;
          if (seenFiles.has(`${ref.file}:${ref.line}`)) continue;

          seenFiles.add(`${ref.file}:${ref.line}`);
          totalFound++;

          transitiveImpacts.push({
            file: ref.file,
            line: ref.line,
            type: `via ${file}`,
            context: ref.context,
          });
        }
      }
    }

    const truncated = totalFound > maxResults;

    let output = "## Impact Analysis\n\n";

    if (directImpacts.length === 0 && transitiveImpacts.length === 0) {
      output += "No external code found that imports or uses the changed files.\n";
      output += "This could mean:\n";
      output += "- The changed files are leaf nodes (not imported elsewhere)\n";
      output += "- The changed files are entry points\n";
      output += "- Consumers are in node_modules or excluded directories\n\n";
    } else {
      output += `Found ${totalFound} references outside the changeset`;
      if (truncated) {
        output += ` (showing first ${maxResults})`;
      }
      output += ".\n\n";
    }

    if (directImpacts.length > 0) {
      output += "### Direct Consumers\n\n";
      output += "Files that directly import/use the changed code:\n\n";
      output += "| File | Line | Type | Context |\n";
      output += "|------|------|------|--------|\n";

      for (const impact of directImpacts.slice(0, 25)) {
        const truncatedContext = impact.context.length > 60
          ? impact.context.slice(0, 57) + "..."
          : impact.context;
        output += `| \`${impact.file}\` | ${impact.line} | ${impact.type} | \`${truncatedContext}\` |\n`;
      }

      if (directImpacts.length > 25) {
        output += `\n_...and ${directImpacts.length - 25} more direct consumers_\n`;
      }
      output += "\n";
    }

    if (transitiveImpacts.length > 0) {
      output += "### Transitive Impact\n\n";
      output += "Files that use code which uses the changed code:\n\n";
      output += "| File | Line | Via | Context |\n";
      output += "|------|------|-----|--------|\n";

      for (const impact of transitiveImpacts.slice(0, 15)) {
        const truncatedContext = impact.context.length > 50
          ? impact.context.slice(0, 47) + "..."
          : impact.context;
        output += `| \`${impact.file}\` | ${impact.line} | ${impact.type} | \`${truncatedContext}\` |\n`;
      }

      if (transitiveImpacts.length > 15) {
        output += `\n_...and ${transitiveImpacts.length - 15} more transitive impacts_\n`;
      }
      output += "\n";
    }

    if (testGaps.length > 0) {
      output += "### Test Coverage Gaps\n\n";
      output += "Changed files without corresponding test files:\n\n";

      for (const gap of testGaps) {
        output += `- \`${gap.file}\`: ${gap.reason}\n`;
      }
      output += "\n";
    }

    output += "### Recommendations\n\n";

    if (directImpacts.length > 5) {
      output += "- **High impact**: Many files depend on these changes. Review carefully for breaking changes.\n";
    }

    if (transitiveImpacts.length > 0) {
      output += "- **Transitive risk**: Changes may have cascading effects. Consider integration testing.\n";
    }

    if (testGaps.length > 0) {
      output += "- **Test coverage**: Consider adding tests for changed files without test coverage.\n";
    }

    if (directImpacts.length === 0 && transitiveImpacts.length === 0 && testGaps.length === 0) {
      output += "- Changes appear isolated. Standard review process should suffice.\n";
    }

    return output;
  },
});
