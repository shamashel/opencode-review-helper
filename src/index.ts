import type { Plugin } from "@opencode-ai/plugin";
import { reviewOrderTool } from "./tools/review-order.js";
import { impactAnalysisTool } from "./tools/impact-analysis.js";
import { loadConfig } from "./config.js";
import {
  reviewHelperAgent,
  createReviewOrderAgent,
  createImpactExplorerAgent,
} from "./agents/index.js";

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
        "review-helper": reviewHelperAgent,
        "review-helper:review-order": createReviewOrderAgent(explorerModel),
        "review-helper:impact-explorer": createImpactExplorerAgent(explorerModel),
      };

      openCodeConfig.command = {
        ...openCodeConfig.command,
        "review-order": {
          template: "Run the review-order workflow: get initial file order, analyze impact, then produce final prioritized review order with external impacted files merged in.",
          description: "Get optimal file review order with impact analysis",
          agent: "review-helper",
        },
      };
    },
  };
};

export default ReviewHelperPlugin;
