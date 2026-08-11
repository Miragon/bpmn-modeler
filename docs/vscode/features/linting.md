# Linting

The BPMN Modeler can validate your diagram **while you edit** using
[bpmnlint](https://github.com/bpmn-io/bpmnlint) — the same linter you can run in
CI. When a `.bpmnlintrc` is found, rule violations appear as ⚠️/❌ overlays on the
offending elements, a summary button (error/warning counts) is shown on the
canvas, and each finding is also published to the VS Code **Problems** panel
(searchable and clickable, even without the diagram open). If no `.bpmnlintrc`
exists, the feature stays dormant and the modeler looks exactly as it did before.

The lint runs in the **extension host** (a full Node.js context), not in the
webview. That is what lets it resolve your workspace's own
`bpmnlint-plugin-*` packages and `plugin:*` configs against `node_modules` —
exactly like the `bpmnlint` CLI — so custom rules work in the modeler, not just
built-ins. See [Custom rules & plugins](#custom-rules-plugins) below.

## Usage

1. Add a `.bpmnlintrc` at your workspace root (or under your
   [`configFolder`](/vscode/configuration), default `.camunda/`):

   ```json
   {
       "extends": "bpmnlint:recommended"
   }
   ```

2. Open (or reopen) a `.bpmn` file with a known issue — e.g. a task without a
   label or a process missing an end event. Violations show up as overlays on
   the diagram, and the in-canvas lint button summarises the counts. The VS Code
   status bar shows `$(check) BPMNlint` (hover for the config path).

3. Fix the issue and the overlay clears **live** — no save required.

## Configuring rules

Discovery uses bpmnlint's nearest-config semantics: walking from the BPMN file's
directory up to the workspace root, the first `.bpmnlintrc` found wins (checking
`<dir>/.bpmnlintrc` then `<dir>/<configFolder>/.bpmnlintrc` at each level). No
merging is performed, so the modeler and CI lint against the same file.

Tune rules with the standard `.bpmnlintrc` syntax — turn a rule off, downgrade it
to a warning, or start from a different built-in preset:

```json
{
    "extends": "bpmnlint:recommended",
    "rules": {
        "label-required": "off",
        "no-overlapping-elements": "warn"
    }
}
```

The built-in presets are `bpmnlint:recommended`, `bpmnlint:all`, and
`bpmnlint:correctness`. See the
[bpmnlint rule reference](https://github.com/bpmn-io/bpmnlint/blob/main/docs/rules/README.md)
for the full list of rules and what each one checks.

## Custom rules & plugins

Custom rules are where project-specific conventions live — connector result
mapping, naming schemes, required extension properties, deployment constraints —
the things the built-in structural rules can't check. Because the modeler lints
in the extension host, a `bpmnlint-plugin-*` package installed in your workspace
works with no extra setup.

1. **Add the plugin to your workspace.** Any `bpmnlint-plugin-<name>` package that
   is resolvable from the `.bpmnlintrc`'s folder works — a normal dependency, or
   a local one via a `file:` reference:

   ```jsonc
   // package.json
   {
     "devDependencies": {
       "bpmnlint-plugin-custom-rules": "file:./bpmnlint-custom-rules"
     }
   }
   ```

   ```bash
   npm install   # so node_modules/bpmnlint-plugin-custom-rules exists
   ```

2. **Reference it from `.bpmnlintrc`** by its short name (bpmnlint expands
   `custom-rules` to `bpmnlint-plugin-custom-rules`):

   ```jsonc
   {
     "extends": ["bpmnlint:recommended", "plugin:custom-rules/recommended"],
     "rules": { "custom-rules/no-todo-in-name": "error" }
   }
   ```

3. **Open a diagram.** Violations of your custom rule now show up as overlays and
   Problems-panel entries just like the built-ins. Verify parity with
   `npx bpmnlint <diagram>.bpmn`.

Resolution is anchored at the folder of the `.bpmnlintrc` that discovery picked,
so monorepos with per-module configs and plugins keep working. Rule modules are
`require()`d in the extension host, which VS Code already gates behind
[Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust) —
nothing untrusted runs in the webview.

A **runnable example** lives in
[`resources/example-process/`](https://github.com/Miragon/bpmn-modeler/tree/main/resources/example-process):
a tiny `bpmnlint-plugin-custom-rules` plugin, a `.bpmnlintrc` that uses it, and a
`lint-demo.bpmn` whose task triggers the custom rule.

### When a plugin can't be resolved

If the config references a rule or plugin config that isn't installed, the modeler
**skips only that entry** (the rest of the config keeps linting) and makes it
visible instead of silently dropping it: the status bar switches to
`BPMNlint: N rules skipped` with the skipped names in the tooltip, and a warning
is logged to the *bpmn.modeler* output channel. Install the missing
`bpmnlint-plugin-*` package to clear it.

## Current scope

- **BPMN only.** DMN linting is not supported.
