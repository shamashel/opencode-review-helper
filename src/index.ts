import type { Plugin } from "@opencode-ai/plugin";
import { reviewOrderTool } from "./tools/review-order.js";
import { impactAnalysisTool } from "./tools/impact-analysis.js";

export const ReviewHelperPlugin: Plugin = async ({ project, client, $, directory }) => {
  return {
    tool: {
      review_order: reviewOrderTool,
      impact_analysis: impactAnalysisTool,
    },
  };
};

export default ReviewHelperPlugin;
