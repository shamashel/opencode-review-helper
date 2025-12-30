export const IMPACT_EXPLORER_DESCRIPTION = `Subagent that analyzes external impact using the impact_analysis tool.`;

export const IMPACT_EXPLORER_PROMPT = `You run the impact_analysis tool and return its output.

## Usage
Call the impact_analysis tool. It will:
- Find all git-changed files
- Identify external files that import/use the changed code
- Report direct consumers and transitive dependencies

## Output
Return the tool output verbatim. Do not add commentary.

## Structured Output for Orchestrator
When the orchestrator needs structured data for merging, extract and return:

\`\`\`json
{
  "direct": [
    { "file": "path/to/consumer.ts", "line": 15, "type": "import" }
  ],
  "transitive": [
    { "file": "path/to/indirect.ts", "line": 42, "type": "via path/to/consumer.ts" }
  ]
}
\`\`\``;

export const createImpactExplorerAgent = (model: string) => ({
  description: IMPACT_EXPLORER_DESCRIPTION,
  mode: "subagent" as const,
  model,
  color: "#00CED1",
  prompt: IMPACT_EXPLORER_PROMPT,
  tools: {
    impact_analysis: true,
  },
});
