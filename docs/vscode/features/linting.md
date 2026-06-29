# Linting

The BPMN Modeler can validate your diagram **while you edit** using
[bpmnlint](https://github.com/bpmn-io/bpmnlint) — the same linter you can run in
CI. When a `.bpmnlintrc` is found, rule violations appear as ⚠️/❌ overlays on the
offending elements and a summary button (error/warning counts) is shown on the
canvas. If no `.bpmnlintrc` exists, the feature stays dormant and the modeler
looks exactly as it did before.

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

## Current scope

- **Built-in rules only.** Custom / 3rd-party rule packages (`extends` to
  external npm configs, `plugin:*`, or `pkg/rule` keys) are **skipped with a
  warning** logged to the *bpmn.modeler* output channel — built-in rules keep
  linting and the editor never crashes on an unsupported entry.
- **BPMN only.** DMN linting is not supported.
