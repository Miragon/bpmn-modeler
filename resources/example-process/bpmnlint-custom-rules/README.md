# bpmnlint-plugin-custom-rules (example)

A minimal [bpmnlint](https://github.com/bpmn-io/bpmnlint) plugin showing how a
team can enforce its own BPMN conventions in the **BPMN Modeler** — the modeler
runs bpmnlint in the extension host, so custom `bpmnlint-plugin-*` rules resolve
from your workspace `node_modules` exactly like the `bpmnlint` CLI.

## What it contains

- **`rules/no-todo-in-name.js`** — flags any element whose name still contains
  `TODO`. A stand-in for a real convention (naming schemes, required extension
  properties, deployment constraints) that the built-in rules can't express.
- **`index.js`** — the plugin entry point: exposes the rule (as a path reference,
  per the bpmnlint plugin contract) and a `recommended` shareable config.

## How it's wired

This plugin lives at the workspace root; the workspace
[`.bpmnlintrc`](../.bpmnlintrc) (also at the project root) references it by its short
name `custom-rules` (bpmnlint expands it to the `bpmnlint-plugin-custom-rules`
package):

```jsonc
{
  "extends": ["bpmnlint:recommended", "plugin:custom-rules/recommended"],
  "rules": { "custom-rules/no-todo-in-name": "error" }
}
```

The example [`package.json`](../package.json) installs this folder as the
`bpmnlint-plugin-custom-rules` package via a `file:./bpmnlint-custom-rules`
dependency, so it lands in `node_modules/` where both the modeler and the CLI can
resolve it. The physical folder location is irrelevant to resolution — only the
installed package name matters.

## Try it

This folder is a self-contained project (its own `yarn.lock` + `.yarnrc.yml`
mark it separate from the repo's Yarn workspaces, and pin the `node-modules`
linker so plugin resolution works).

1. From `resources/example-process/`, install the plugin into `node_modules`
   (`npm install` works too):

   ```bash
   corepack yarn install
   ```

2. Confirm the CLI reports the custom rule:

   ```bash
   corepack yarn bpmnlint c7/lint-demo.bpmn
   #   Task_1  error  Element name must not contain "TODO" …  custom-rules/no-todo-in-name
   ```

3. Open `resources/example-process/` as a workspace in VS Code and open
   `c7/lint-demo.bpmn`. The task named `TODO implement me` shows an ❌ overlay, the
   finding appears in the **Problems** panel, and the status bar shows
   `✓ BPMNlint`. Rename the task so it no longer contains `TODO` and the marker
   clears live.

> If a plugin can't be resolved (not installed), the modeler skips only that rule
> and the status bar shows `BPMNlint: N rules skipped` (details in the tooltip) —
> the rest of the config keeps linting.
