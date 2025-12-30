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

### Slash Command: `/review-order`

The quickest way to use this plugin:

```
/review-order
```

This runs the full workflow:
1. Analyzes changed files and determines initial review order
2. Finds external files impacted by the changes
3. Merges everything into a single prioritized list

Output is a unified table showing all files to review, with changed files first (prioritized by dependencies and impact) followed by external files that may need attention.

### Agent: `review-helper`

The plugin provides a `review-helper` agent that orchestrates two subagents:

- `review-helper:review-order` - Determines optimal file review order
- `review-helper:impact-explorer` - Finds external code impacted by changes

The agent does NOT make up its own recommendations or analysis—it only presents what the tools return. It also does NOT automatically run tests or apply fixes.

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
      "resolver",
      "component",
      "test"
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

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `models.explorer` | Model for sub-agent exploration | `google/gemini-3-flash` |
| `review_order.type_priority` | File type keywords in priority order | See above |
| `review_order.instructions` | Custom ordering instructions | - |
| `impact_analysis.max_depth` | Transitive analysis depth (1-3) | `2` |
| `impact_analysis.max_results_per_level` | Max results per category | `50` |
| `impact_analysis.exclude_patterns` | Glob patterns to skip | Test files |

## Tools

The plugin also exposes two tools directly:

### `review_order`

Suggests optimal order to review changed files.

Arguments:
- `files` (optional): Specific files to analyze. If omitted, uses git diff.
- `instructions` (optional): Custom ordering instructions
- `impact_data` (optional): Impact analysis results to merge external files into the list

Output:
- Prioritized file list with rationale
- Dependency graph showing import relationships
- Scores based on: type priority, dependents count, complexity, external impact

### `impact_analysis`

Finds code outside the changeset that could break.

Output:
- Direct consumers (files that import changed code)
- Transitive impact (files that use files that use changed code)
- Test coverage gaps (changed files without tests)

## License

MIT
