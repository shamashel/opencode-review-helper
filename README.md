# opencode-review-helper

OpenCode plugin for reviewing AI-generated code changes. Helps humans efficiently review large changesets by suggesting optimal review order and identifying potential breaking changes.

## Features

- **Review Order**: Analyzes changed files and suggests optimal review sequence based on dependencies, file type priority, and complexity
- **Impact Analysis**: Finds code outside the changeset that could be affected by the changes (direct consumers, transitive dependencies, test coverage gaps)

## Installation

```bash
bunx opencode-review-helper setup
```

This will:
1. Add the plugin to your `~/.config/opencode/opencode.jsonc`
2. Let you choose which model to use for the impact-explorer sub-agent (default: `google/gemini-3-flash`)

Restart opencode after setup to load the plugin. The plugin uses `@latest` so it will auto-update when you restart OpenCode.

## Usage

```
/review-order
```

This runs the full workflow:
1. Analyzes changed files and determines initial review order
2. Finds external files impacted by the changes
3. Merges everything into a single prioritized list

Output is a unified table showing all files to review, with changed files first (prioritized by dependencies and impact) followed by external files that may need attention.

## Agents

Three agents available for direct use or extension:

| Agent | Purpose |
|-------|---------|
| `review-helper` | Orchestrator - runs full `/review-order` workflow |
| `review-helper:review-order` | Determines optimal file review order |
| `review-helper:impact-explorer` | Finds external impacted code |

The orchestrator does NOT make up its own recommendations—it only presents what the subagents return. It also does NOT automatically run tests or apply fixes.

### Examples

Run impact analysis only:
```bash
opencode run --agent review-helper:impact-explorer "Analyze impact of current changes"
```

Get review order without impact merge:
```bash
opencode run --agent review-helper:review-order "Get review order for changed files"
```

## Configuration

Create `~/.config/opencode/review-helper.json` or `.opencode/review-helper.json` in your project:

```json
{
  "models": {
    "explorer": "google/gemini-3-flash"
  },
  "review_order": {
    "type_priority": [
      "migration",
      "schema",
      "model",
      "service",
      "..."
    ],
    "instructions": "Always review database changes before business logic"
  },
  "impact_analysis": {
    "max_depth": 2,
    "max_results_per_level": 50,
    "exclude_patterns": ["**/*.test.ts", "**/__tests__/**"]
  }
}
```

*Default `type_priority` includes 18 keywords. See [src/config.ts](src/config.ts) for full list.*

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `models.explorer` | Model for sub-agent exploration | `google/gemini-3-flash` |
| `review_order.type_priority` | File type keywords in priority order | See config.ts |
| `review_order.instructions` | Custom ordering instructions | - |
| `impact_analysis.max_depth` | Transitive analysis depth (1-3) | `2` |
| `impact_analysis.max_results_per_level` | Max results per category | `50` |
| `impact_analysis.exclude_patterns` | Glob patterns to skip | Test files |

## License

MIT
