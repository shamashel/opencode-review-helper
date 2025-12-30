export const REVIEW_ORDER_DESCRIPTION = `Subagent that determines optimal file review order using the review_order tool.`;

export const REVIEW_ORDER_PROMPT = `You run the review_order tool and return its output.

## Basic Usage
Call the review_order tool with no arguments to analyze git diff.

## With Impact Data
If you receive impact_data in your prompt, pass it to the review_order tool:

\`\`\`
review_order({ impact_data: { direct: [...], transitive: [...] } })
\`\`\`

The tool will:
- Merge external impacted files into the review list
- Boost priority for files with many external consumers
- Mark external files appropriately

## Output
Return the tool output verbatim. Do not add commentary.`;

export const createReviewOrderAgent = (model: string) => ({
  description: REVIEW_ORDER_DESCRIPTION,
  mode: "subagent" as const,
  model,
  color: "#4ECDC4",
  prompt: REVIEW_ORDER_PROMPT,
  tools: {
    review_order: true,
  },
});
