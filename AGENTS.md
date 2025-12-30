# Agent Instructions

## Local Testing

To test the plugin locally:

1. Update `~/.config/opencode/opencode.jsonc` to use the local path:
   ```jsonc
   "plugin": [
     "/home/mike/Projects/OpenSource/review-helper",
     // ... other plugins
   ]
   ```

2. Run `npm run build` to compile changes

3. Use the `/review-order` command or run:
   ```bash
   opencode run --agent review-helper --model anthropic/claude-sonnet-4-20250514 "/review-order"
   ```

4. Remember to revert the config to `"opencode-review-helper@latest"` after testing

## Release Process

1. **Test changes locally**
   - Run `npm run build` to verify compilation
   - Test manually in OpenCode using `/review-order` command
   - Run unit tests if available

2. **Commit and push changes**
   - Create a descriptive commit message
   - Push to the repository

3. **Suggest release command**
   - For bug fixes: `npm run release:patch`
   - For new features: `npm run release:minor`
   - For breaking changes: `npm run release:major`

4. **Wait for human verification**
   - Do NOT run the release command automatically
   - The human-in-the-loop must approve and execute

## Architecture Notes

### Agent Registration

OpenCode plugins cannot return an `agent` property directly. Agents must be injected via the `config` hook in `src/index.ts`.

Agent definitions live in `src/agents/`:
- `review-helper.ts` - Primary orchestrator agent
- `review-order.ts` - Subagent for determining file review order
- `impact-explorer.ts` - Subagent for analyzing external impact

### Slash Commands

Commands are registered via the `config` hook:

```typescript
openCodeConfig.command = {
  ...openCodeConfig.command,
  "review-order": {
    template: "...",
    description: "...",
    agent: "review-helper",
  },
};
```
