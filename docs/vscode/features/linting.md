# Linting

Check your diagram with [bpmnlint](https://github.com/bpmn-io/bpmnlint) while you edit, with the same rules your CI runs.

Findings appear as overlays on the affected elements, as error and warning counts on the canvas, and in the VS Code **Problems** panel. Fix an issue and its overlay clears right away, no save needed. Hover an overlay to read its findings, or click it (or focus it and press <kbd>Enter</kbd>) to pin the list; <kbd>Esc</kbd> closes it.

## Default rules

Without a `.bpmnlintrc` the modeler lints against a bundled default, offline and without installing anything:

- `bpmnlint:recommended` for every diagram (missing start or end event, disconnected elements, implicit splits and joins, …).
- For Camunda 7 and Camunda 8 diagrams, the [`bpmnlint-plugin-camunda-compat`](https://github.com/camunda/bpmnlint-plugin-camunda-compat) rules for the target engine, so constructs it cannot run are flagged while you model.

Any `.bpmnlintrc` replaces the default completely, even an empty `{}`.

## Use your own config

Add a `.bpmnlintrc` at the workspace root or in the config folder (`.camunda/` by default):

```json
{
    "extends": "bpmnlint:recommended",
    "rules": {
        "label-required": "off",
        "no-overlapping-elements": "warn"
    }
}
```

The modeler walks from the diagram's folder up to the workspace root and uses the first `<dir>/.bpmnlintrc` or `<dir>/<configFolder>/.bpmnlintrc` it finds. Configs are not merged, so modeler and CI read the same file. Built-in presets are `bpmnlint:recommended`, `bpmnlint:all` and `bpmnlint:correctness`; see the [rule reference](https://github.com/bpmn-io/bpmnlint/blob/main/docs/rules/README.md).

## Custom rules and plugins

Any `bpmnlint-plugin-*` package that resolves from the folder of the `.bpmnlintrc` works, from npm or local via `file:`:

```json
{
    "devDependencies": {
        "bpmnlint-plugin-custom-rules": "file:./bpmnlint-custom-rules"
    }
}
```

Run `npm install`, then reference the plugin by its short name:

```json
{
    "extends": ["bpmnlint:recommended", "plugin:custom-rules/recommended"],
    "rules": { "custom-rules/no-todo-in-name": "error" }
}
```

Rules run in the extension host, which needs [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust). Check parity with `npx bpmnlint <diagram>.bpmn`. A runnable example lives in [`resources/example-process/`](https://github.com/Miragon/bpmn-modeler/tree/main/resources/example-process).

If a referenced rule or plugin is not installed, only that entry is skipped. The status bar then shows `BPMNlint: N rules skipped` and the *bpmn.modeler* output channel names them.

## Status bar

| Status bar | Meaning |
|---|---|
| `BPMNlint` | Your `.bpmnlintrc` is in use (hover for its path). |
| `BPMNlint (default)` | No `.bpmnlintrc` found, the bundled default is in use. |
| `BPMNlint: N rules skipped` | Some rules or plugins could not be resolved. |
| `BPMNlint: off` | Linting is turned off. |
| `BPMNlint: failed` | The `.bpmnlintrc` could not be read, or the lint run failed. The *bpmn.modeler* output channel (IntelliJ: `idea.log`) has the error. |

## Turn linting off

| Setting | Default | Description |
|---|---|---|
| `miragon.bpmnModeler.linting.enabled` | `true` | Turn off if you only design and do not want execution rules. |

**Miragon BPMN Modeler: Toggle Linting**, the `BPMNlint: off` status bar item and the lint button on the canvas switch it too. Linting covers BPMN only, not DMN.

## Next steps

- [Editor modes](/vscode/features/modes): Implement is the mode with linting.
- [Deployment](/vscode/features/deployment): deploy once the diagram is clean.
- [Configuration](/vscode/configuration): every setting in one table.
