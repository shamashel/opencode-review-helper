import type { Plugin } from "@opencode-ai/plugin";
import { reviewOrderTool } from "./tools/review-order.js";
import { impactAnalysisTool } from "./tools/impact-analysis.js";
import { loadConfig } from "./config.js";

const REVIEW_HELPER_DESCRIPTION = `Comprehensive code reviewer for AI-generated changes. Analyzes:
- Optimal review order based on file dependencies
- Impact on code outside the changeset (transitive)

Does NOT automatically run tests or fix code. For debugging help, explicitly ask.

Examples:
<example>
Context: User completed AI-assisted implementation
user: "Review the changes Claude just made"
assistant: "I'll analyze the changes for review order and impact."
</example>

<example>
Context: Large PR review
user: "What should I look at first in this PR?"
assistant: "I'll determine the optimal review order based on dependencies."
</example>

<example>
Context: Concern about breaking changes
user: "What else might this break?"
assistant: "I'll analyze transitive impact on code outside these changes."
</example>`;

const REVIEW_HELPER_PROMPT = `You are a code review assistant that runs two tools and reports their output.

## CRITICAL CONSTRAINT

You are a **relay agent**. Your ONLY job is to:
1. Run the \`review_order\` tool
2. Run the \`impact_analysis\` tool  
3. Present their outputs verbatim

DO NOT:
- Add your own analysis, observations, or recommendations
- Summarize or interpret the results
- Read files to add context
- Suggest next steps
- Add sections beyond what the tools return

## Workflow

### Step 1: Run review_order
Call the \`review_order\` tool. It returns a prioritized file list.

### Step 2: Run impact_analysis  
Call the \`impact_analysis\` tool. It returns affected code outside the changeset.

### Step 3: Output results
Present ONLY what the tools returned. Use this exact format:

## Review Order
[paste review_order output here]

## Impact Analysis
[paste impact_analysis output here]

That's it. Nothing else.`;

const IMPACT_EXPLORER_DESCRIPTION = `Sub-agent for transitive reference exploration. Called by impact_analysis tool for deep dependency crawling.`;

const IMPACT_EXPLORER_PROMPT = `You explore references to symbols transitively.

## Input

You receive:
- \`symbol\`: Name to find references for
- \`source_file\`: Where symbol is defined
- \`exclude_files\`: Files already in changeset (skip these)
- \`depth\`: Current depth level

## Process

1. Find all references to \`symbol\`:
   - Search for import statements containing the symbol
   - Search for direct usage of the symbol name
2. Filter out files in \`exclude_files\`
3. For each reference, note:
   - File path
   - Line number  
   - Usage type (import, call, extends, etc.)

## Output

Return structured list:
\`\`\`
References to \`UserModel\`:
- src/api/auth.ts:15 (import)
- src/api/orders.ts:42 (call)
- src/services/email.ts:8 (import)
\`\`\`

Be fast and focused. Find references, don't analyze the code deeply.`;

export const ReviewHelperPlugin: Plugin = async ({ project, client, $, directory }) => {
  return {
    tool: {
      review_order: reviewOrderTool,
      impact_analysis: impactAnalysisTool,
    },

    config: async (openCodeConfig) => {
      const pluginConfig = await loadConfig(directory);
      const explorerModel = pluginConfig.models?.explorer ?? "google/gemini-3-flash";

      openCodeConfig.agent = {
        ...openCodeConfig.agent,
        "review-helper": {
          description: REVIEW_HELPER_DESCRIPTION,
          mode: "primary",
          color: "#FF6B6B",
          prompt: REVIEW_HELPER_PROMPT,
          tools: {
            review_order: true,
            impact_analysis: true,
            Read: true,
            Grep: true,
            Glob: true,
            task: true,
          },
        },
        "review-helper:impact-explorer": {
          description: IMPACT_EXPLORER_DESCRIPTION,
          mode: "subagent",
          model: explorerModel,
          color: "#00CED1",
          prompt: IMPACT_EXPLORER_PROMPT,
          tools: {
            Read: true,
            Grep: true,
            Glob: true,
          },
        },
      };
    },
  };
};

export default ReviewHelperPlugin;
