import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

export interface ReviewHelperConfig {
  models: {
    explorer: string;
  };
  review_order: {
    type_priority: string[];
    instructions?: string;
  };
  impact_analysis: {
    max_depth: number;
    max_results_per_level: number;
    exclude_patterns: string[];
  };
}

const DEFAULT_CONFIG: ReviewHelperConfig = {
  models: {
    explorer: "google/gemini-3-flash",
  },
  review_order: {
    type_priority: [
      "migration",
      "schema",
      "prisma",
      "model",
      "entity",
      "type",
      "interface",
      "util",
      "lib",
      "service",
      "resolver",
      "controller",
      "api",
      "route",
      "component",
      "hook",
      "test",
      "spec",
    ],
  },
  impact_analysis: {
    max_depth: 2,
    max_results_per_level: 50,
    exclude_patterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**", "**/__mocks__/**"],
  },
};

/**
 * Get config file paths in order of precedence (higher = overrides lower)
 */
function getConfigPaths(projectDir?: string): string[] {
  const paths: string[] = [];

  // Global config
  paths.push(join(homedir(), ".config", "opencode", "review-helper.json"));

  // Project-local config
  if (projectDir) {
    paths.push(join(projectDir, ".opencode", "review-helper.json"));
  }

  return paths;
}

/**
 * Load and merge config from all sources
 */
export async function loadConfig(projectDir?: string): Promise<ReviewHelperConfig> {
  let config = { ...DEFAULT_CONFIG };

  for (const configPath of getConfigPaths(projectDir)) {
    try {
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        config = deepMerge(config, parsed);
      }
    } catch (error) {
      // Skip invalid config files
      console.warn(`Warning: Could not load config from ${configPath}`);
    }
  }

  return config;
}

/**
 * Save config to the global config file
 */
export async function saveGlobalConfig(config: Partial<ReviewHelperConfig>): Promise<void> {
  const configPath = join(homedir(), ".config", "opencode", "review-helper.json");
  const configDir = dirname(configPath);

  // Ensure directory exists
  await mkdir(configDir, { recursive: true });

  // Load existing config and merge
  let existing: Partial<ReviewHelperConfig> = {};
  try {
    if (existsSync(configPath)) {
      const content = await readFile(configPath, "utf-8");
      existing = JSON.parse(content);
    }
  } catch {
    // Start fresh
  }

  const merged = deepMerge(existing, config);
  await writeFile(configPath, JSON.stringify(merged, null, 2) + "\n");
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Get the explorer model from config
 */
export async function getExplorerModel(projectDir?: string): Promise<string> {
  const config = await loadConfig(projectDir);
  return config.models.explorer;
}
