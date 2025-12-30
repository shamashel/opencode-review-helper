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

Restart opencode after setup to load the plugin.

## Usage

The plugin provides a `review-helper:code-reviewer` agent that combines both tools. It:

1. Runs `review_order` to determine file review sequence
2. Runs `impact_analysis` to find affected external code
3. Formats the tool outputs into a combined report

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

Output:
- Prioritized file list with rationale
- Dependency graph showing import relationships
- Scores based on: type priority, dependents count, complexity

### `impact_analysis`

Finds code outside the changeset that could break.

Output:
- Direct consumers (files that import changed code)
- Transitive impact (files that use files that use changed code)
- Test coverage gaps (changed files without tests)

## License

MIT
