# `bpmnlint-plugin-custom-rules` (example)

A minimal [bpmnlint](https://github.com/bpmn-io/bpmnlint) plugin that shows how a team enforces its
own BPMN conventions in the modeler. The modeler resolves `bpmnlint-plugin-*` packages from the
workspace's `node_modules`, as the `bpmnlint` CLI does.

## What it contains

- `rules/no-todo-in-name.js` flags every element whose name still contains `TODO`, a stand-in for a
  convention the built-in rules cannot express.
- `index.js` is the plugin entry: it exposes the rule as a path reference, as the bpmnlint plugin
  contract asks, and a `recommended` config.

## How it is wired

[`../.bpmnlintrc`](../.bpmnlintrc) refers to the plugin by its short name `custom-rules`, which
bpmnlint expands to `bpmnlint-plugin-custom-rules`:

```json
{
    "extends": ["bpmnlint:recommended", "plugin:custom-rules/recommended"],
    "rules": { "custom-rules/no-todo-in-name": "error" }
}
```

[`../package.json`](../package.json) installs this folder under that package name through a
`file:./bpmnlint-custom-rules` dependency. Only the installed package name matters for resolution,
not where the folder lies. `example-process/` is its own Yarn project with the `node-modules` linker,
outside the repository's workspaces.

## Try it

1. In `resources/example-process/`, install the plugin (`npm install` works too):

    ```bash
    corepack yarn install
    ```

2. Check that the CLI reports the rule:

    ```bash
    corepack yarn bpmnlint c7/lint-demo.bpmn
    #   Task_1  error  Element name must not contain "TODO" …  custom-rules/no-todo-in-name
    ```

3. Open `resources/example-process/` as a workspace in VS Code and open `c7/lint-demo.bpmn`. The
   modeler skips the package until you allow it: click **Review…** in the notification and allow it
   in the Add-ons view ([Allow a rule package](https://miragon.github.io/bpmn-modeler/vscode/features/linting#allow-a-rule-package)).
4. The task `TODO implement me` now shows an error marker, the finding is in the **Problems** view
   and the status bar shows **BPMNlint**. Rename the task and the marker clears.

A package that is not installed is skipped and the status bar shows `BPMNlint: N rules skipped`;
the rest of the config keeps linting.
