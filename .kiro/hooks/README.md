# Agent hooks

These JSON files follow the official Kiro hook schema documented at [https://kiro.dev/docs/hooks/](https://kiro.dev/docs/hooks/) (schema `version: "v1"`, page updated 2026-10-21).

Each file is a standalone document of the form:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "example",
      "trigger": "PostFileSave",
      "matcher": "\\.(ts|tsx)$",
      "action": { "type": "command", "command": "npm test" }
    }
  ]
}
```

`action.type` is `"command"` (shell, project root, session JSON on STDIN) or `"agent"` (inject a prompt). Triggers are PascalCase (`PostFileSave`, `Stop`, …).

## Confirm this format in the installed Kiro

This draft was written before Kiro was installed on the author's machine. After opening the project in Kiro (IDE 1.0 or CLI V3 and later, which use this standalone `v1` format):

1. Confirm the hook files appear in the Agent Hooks panel and load without a schema error.
2. If Kiro reports an unknown field or trigger, ask Kiro to migrate the files rather than inventing a new format. IDE 0.x and CLI 2.x used a different shape (`when` / `then`, or object-form hooks).
3. Narrow or disable a hook if it is too noisy (for example, run a narrower test command once `npm test` exists).

Do not treat these examples as a substitute for the hook editor in your installed Kiro version.
