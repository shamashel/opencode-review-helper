# Agent Instructions

## Release Process

1. **Test changes locally**
   - Run `yarn build` to verify compilation
   - Test manually in OpenCode by restarting after changes
   - Run unit tests if available

2. **Commit and push changes**
   - Create a descriptive commit message
   - Push to the repository

3. **Suggest release command**
   - For bug fixes: `yarn release:patch`
   - For new features: `yarn release:minor`
   - For breaking changes: `yarn release:major`

4. **Wait for human verification**
   - Do NOT run the release command automatically
   - The human-in-the-loop must approve and execute

## Architecture Notes

### Agent Registration

OpenCode plugins cannot return an `agent` property directly. Agents must be injected via the `config` hook:

```typescript
config: async (openCodeConfig) => {
  openCodeConfig.agent = {
    ...openCodeConfig.agent,
    "my-agent": {
      description: "...",
      mode: "subagent",
      prompt: "...",
      tools: { ... },
    },
  };
}
```

The `agents/` directory contains markdown files for reference/documentation only - they are not automatically loaded by OpenCode.
