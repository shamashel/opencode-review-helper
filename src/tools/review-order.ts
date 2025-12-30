import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { getChangedFiles, type ChangedFile } from "../utils/git.js";
import { buildDependencyGraph } from "../utils/imports.js";
import { loadConfig } from "../config.js";
import { resolve, extname, basename } from "node:path";

interface FileScore {
  file: string;
  score: number;
  reasons: string[];
  dependencies: string[];
  dependents: string[];
}

interface ReviewOrderResult {
  order: Array<{
    rank: number;
    file: string;
    reason: string;
    score: number;
  }>;
  dependency_graph: Record<string, string[]>;
}

function getFileTypePriority(file: string, typePriority: string[]): number {
  const lowerFile = file.toLowerCase();
  const ext = extname(file);
  const base = basename(file, ext).toLowerCase();

  for (let i = 0; i < typePriority.length; i++) {
    const type = typePriority[i].toLowerCase();
    if (
      lowerFile.includes(type) ||
      base.includes(type) ||
      lowerFile.includes(`/${type}/`) ||
      lowerFile.includes(`/${type}s/`)
    ) {
      return typePriority.length - i;
    }
  }
  return 0;
}

function computeScores(
  files: ChangedFile[],
  dependencyGraph: Map<string, string[]>,
  typePriority: string[]
): FileScore[] {
  const fileNames = files.map((f) => f.file);
  const dependentsMap = new Map<string, string[]>();

  for (const file of fileNames) {
    dependentsMap.set(file, []);
  }

  for (const [file, deps] of dependencyGraph) {
    for (const dep of deps) {
      const existing = dependentsMap.get(dep) || [];
      existing.push(file);
      dependentsMap.set(dep, existing);
    }
  }

  const scores: FileScore[] = [];

  for (const changedFile of files) {
    const file = changedFile.file;
    const reasons: string[] = [];
    let score = 0;

    const typePriorityScore = getFileTypePriority(file, typePriority);
    if (typePriorityScore > 0) {
      score += typePriorityScore * 10;
      reasons.push(`Type priority: ${typePriorityScore}`);
    }

    const dependents = dependentsMap.get(file) || [];
    if (dependents.length > 0) {
      score += dependents.length * 15;
      reasons.push(`${dependents.length} file(s) depend on this`);
    }

    const dependencies = dependencyGraph.get(file) || [];
    if (dependencies.length === 0 && dependents.length > 0) {
      score += 20;
      reasons.push("Foundation file (no deps, has dependents)");
    }

    const complexity = changedFile.additions + changedFile.deletions;
    if (complexity > 100) {
      score += 10;
      reasons.push(`High churn: ${complexity} lines changed`);
    } else if (complexity > 50) {
      score += 5;
      reasons.push(`Moderate churn: ${complexity} lines changed`);
    }

    if (file.includes("index.")) {
      score += 5;
      reasons.push("Index/barrel file");
    }

    scores.push({
      file,
      score,
      reasons,
      dependencies,
      dependents,
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

function generateReason(fileScore: FileScore): string {
  if (fileScore.reasons.length === 0) {
    return "Standard file";
  }

  const topReasons = fileScore.reasons.slice(0, 2);
  return topReasons.join("; ");
}

export const reviewOrderTool: ToolDefinition = tool({
  description:
    "Analyze changed files and suggest optimal review order based on dependencies, file type priority, and complexity. Returns a prioritized list with rationale for reviewing each file.",
  args: {
    files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Files to analyze. If omitted, uses git diff to find changed files."),
    instructions: tool.schema
      .string()
      .optional()
      .describe("Additional ordering instructions (e.g., 'review migrations before models')"),
  },
  async execute(args, ctx) {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    let filesToAnalyze: ChangedFile[];

    if (args.files && args.files.length > 0) {
      filesToAnalyze = args.files.map((f) => ({
        file: f,
        status: "modified" as const,
        additions: 0,
        deletions: 0,
      }));
    } else {
      filesToAnalyze = await getChangedFiles(cwd);
    }

    if (filesToAnalyze.length === 0) {
      return JSON.stringify({
        order: [],
        dependency_graph: {},
        message: "No changed files found",
      });
    }

    const dependencyGraph = await buildDependencyGraph(
      filesToAnalyze.map((f) => f.file),
      cwd
    );

    const scores = computeScores(
      filesToAnalyze,
      dependencyGraph,
      config.review_order.type_priority
    );

    const result: ReviewOrderResult = {
      order: scores.map((s, i) => ({
        rank: i + 1,
        file: s.file,
        reason: generateReason(s),
        score: s.score,
      })),
      dependency_graph: Object.fromEntries(dependencyGraph),
    };

    let output = "## Review Order\n\n";
    output += "| # | File | Reason | Score |\n";
    output += "|---|------|--------|-------|\n";

    for (const item of result.order) {
      output += `| ${item.rank} | \`${item.file}\` | ${item.reason} | ${item.score} |\n`;
    }

    if (Object.keys(result.dependency_graph).length > 0) {
      output += "\n## Dependency Graph\n\n";
      for (const [file, deps] of Object.entries(result.dependency_graph)) {
        if (deps.length > 0) {
          output += `- \`${file}\` imports: ${deps.map((d) => `\`${d}\``).join(", ")}\n`;
        }
      }
    }

    if (args.instructions) {
      output += `\n## Custom Instructions\n\nUser requested: "${args.instructions}"\n`;
      output += "Note: Custom instructions should be applied by the reviewing agent when prioritizing.\n";
    }

    return output;
  },
});
