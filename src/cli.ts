#!/usr/bin/env node

import { saveGlobalConfig, loadConfig } from "./config.js";
import { createInterface } from "node:readline";

const MODELS = [
  { value: "google/gemini-3-flash", label: "Google Gemini 3 Flash (fast, recommended)" },
  { value: "google/gemini-3-flash-lite", label: "Google Gemini 3 Flash Lite (fastest)" },
  { value: "anthropic/claude-3-haiku", label: "Anthropic Claude 3 Haiku" },
  { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
];

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setup() {
  console.log("\n🔍 OpenCode Review Helper - Setup\n");

  console.log("Select a model for the impact-explorer sub-agent:\n");
  MODELS.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.label}`);
  });
  console.log(`  ${MODELS.length + 1}. Custom (enter model string)`);
  console.log();

  const choice = await prompt(`Choice [1-${MODELS.length + 1}]: `);
  const choiceNum = parseInt(choice, 10);

  let selectedModel: string;

  if (choiceNum >= 1 && choiceNum <= MODELS.length) {
    selectedModel = MODELS[choiceNum - 1].value;
  } else if (choiceNum === MODELS.length + 1) {
    selectedModel = await prompt("Enter model string (e.g., provider/model): ");
    if (!selectedModel.includes("/")) {
      console.error("Invalid model format. Expected: provider/model");
      process.exit(1);
    }
  } else {
    console.log("Invalid choice, using default: google/gemini-3-flash");
    selectedModel = "google/gemini-3-flash";
  }

  await saveGlobalConfig({
    models: {
      explorer: selectedModel,
    },
  });

  console.log(`\n✅ Configuration saved!`);
  console.log(`   Explorer model: ${selectedModel}`);
  console.log(`   Config location: ~/.config/opencode/review-helper.json\n`);

  console.log("To use the plugin, add to your opencode.jsonc:\n");
  console.log('  { "plugin": ["opencode-review-helper"] }\n');
}

function showHelp() {
  console.log(`
opencode-review-helper - OpenCode plugin for AI code review

Commands:
  setup    Configure the plugin (model selection)
  help     Show this help message

Usage in opencode.jsonc:
  { "plugin": ["opencode-review-helper"] }

Tools provided:
  review_order     - Suggests optimal order to review changed files
  impact_analysis  - Finds code outside changeset that could be affected

Learn more: https://github.com/shamashel/opencode-review-helper
`);
}

const command = process.argv[2];

switch (command) {
  case "setup":
    setup().catch(console.error);
    break;
  case "help":
  case "--help":
  case "-h":
  default:
    showHelp();
    break;
}
