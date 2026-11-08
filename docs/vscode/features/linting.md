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

The modeler walks from the diagram's folder up to the workspace root and uses the first `<dir>/.bpmnlintrc` or `<dir>/<configFolder>/.bpmnlintrc` it finds. Configs are not merged, so modeler and CI read the same file. Open diagrams switch to a config that is added, changed or removed, also when the folder holding it is moved in, moved out or deleted. Built-in presets are `bpmnlint:recommended`, `bpmnlint:all` and `bpmnlint:correctness`; see the [rule reference](https://github.com/bpmn-io/bpmnlint/blob/main/docs/rules/README.md).

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

A rule package is a program: it runs in the extension host with your user's rights, not only inside the editor. The modeler runs a package from your workspace only after you [allow it](#allow-a-rule-package). Check parity with `npx bpmnlint <diagram>.bpmn`.

The modeler takes bpmnlint's own rules and configs (`bpmnlint:recommended`, `label-required`, …) from its bundled bpmnlint, also when your workspace installs `bpmnlint`, so a different installed version can report slightly differently than your CI. A `moddleExtensions` entry must name a JSON descriptor, such as `camunda-bpmn-moddle/resources/camunda.json`; an entry that names a script is skipped and reported like a missing one. A runnable example lives in [`resources/example-process/`](https://github.com/Miragon/bpmn-modeler/tree/main/resources/example-process).

If a referenced rule or plugin is not installed, only that entry is skipped. The status bar then shows `BPMNlint: N rules skipped` and the *bpmn.modeler* output channel names them.

## Allow a rule package

When a lint needs a rule package you have not allowed yet, the diagram is linted without it right away, and a notification says how many are waiting, for example *1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped.*

1. Click **Review…** to see the list. Each entry shows the package's name and version, whether it is *new* or *changed since you allowed it*, and its folder.
2. Check the packages you trust and confirm. Every open diagram that was linted without one of them lints again with it.

A package you leave unchecked is not offered again until the window reloads or its files change, and its rules stay skipped. Closing the notification without **Review…** counts the same as leaving every package unchecked. Only one question is open at a time, shared with the questions about [BPMN plugins](/vscode/features/bpmn-plugins#allow-a-plugin).

The modeler asks only when a rule would be skipped. When its bundled rules cover what your config takes from a package you have not allowed, for example the rules of `bpmnlint-plugin-camunda-compat`, it lints with the bundled rules without asking and notes that in the output channel.

An approval is for one package folder and its exact content:

- It covers the package and the dependencies it declares in its `package.json` (`dependencies`, `optionalDependencies` and `peerDependencies`), as installed.
- Any change to the package or to one of those dependencies, from `npm install`, an update or an edit, makes the package *changed*. Its rules are skipped until you allow it again. The modeler checks this before every lint.
- The same package in another folder or repository asks on its own.
- Approvals are kept with your [BPMN plugin](/vscode/features/bpmn-plugins) approvals in VS Code's global state, outside every workspace, so a repository cannot allow its own rule packages. [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust) does not replace them.
- When the `.bpmnlintrc` sits in the rule package's own folder, because its `package.json` names the plugin, that folder is the package. Editing diagrams, DMN and form files or the `.bpmnlintrc` there does not make it *changed*.

Only installed packages, in a `node_modules` folder or linked with `file:`, and the package the `.bpmnlintrc` sits in can be allowed. A rule file anywhere else, for example one referenced by an absolute path, never runs, and the output channel says why.

::: warning Only allow rule packages you trust
An allowed rule package runs as a program with your user's rights, with the same access to your files and the network as VS Code itself.
:::

The modeler checks an allowed package's files before each lint but runs them from your workspace, not from a copy as it does for BPMN plugins. A file replaced between that check and the run is caught only at the next lint. Code that a package loads without declaring it as a dependency is not covered by the approval. A package that has run stays loaded until the window reloads.

The *bpmn.modeler* output channel explains what happened:

| Output channel line | Meaning |
|---|---|
| `bpmnlint: rule package <folder> is not allowed yet (new), so rules from it are skipped.` | The package's rules were skipped. Instead of `new` it can say `changed since you allowed it` or `declined this session`. |
| `bpmnlint: bundled rules stand in for a rule package that is not allowed yet: <folder>` | The bundled rules covered everything the config takes from the package, so the modeler does not ask. |
| `bpmnlint: rule package <folder> cannot be allowed: it links to files outside its folder.` | The package, or one of its dependencies, holds a link to a folder or to a file outside its folder. It is not offered. |
| `bpmnlint: rule package <folder> cannot be allowed: it is too large to check.` | The package with its dependencies has more than 5,000 files and folders or 50 MB. It is not offered. |
| `bpmnlint: rule package <folder> cannot be allowed: it could not be read.` | A file or the `package.json` of the package or of a dependency could not be read. The line can also say `holds a file that is not a regular file`, or `is installed in a layout the check does not support`: a dependency installed as a single file, or as a folder with an index file but no `package.json`. It is not offered. |
| `bpmnlint: refused to run <file>: it is neither in node_modules nor in the config's own package, so no approval can cover it.` | A rule outside every package that can be allowed. It never runs. Other reasons are `it belongs to no installed package folder`, `the package link it comes through points to a folder that holds the config`, and `the rule package's content hash leaves it out`, for example a diagram file in the config's own package. |
| `Allowed bpmnlint rule package(s): <names>` | Your answer allowed these packages. |

When a dependency, not the package itself, cannot be checked, a `cannot be allowed` line names it: `cannot be allowed: its dependency <folder> links to files outside its folder.`

### IntelliJ

The IntelliJ plugin asks the same way as for [BPMN plugins in IntelliJ](/vscode/features/bpmn-plugins#intellij): an IDE notification balloon with **Review…**, and approvals that the IDE keeps for all your projects, outside every project. The output channel lines go to the IDE log.

In IntelliJ, rule packages whose `package.json` sets `main` or `exports`, and most that have dependencies, do not load yet, even once allowed: the bundled rules stand in for them, or their rules are skipped. A later release lifts this limit.

## Status bar

| Status bar | Meaning |
|---|---|
| `BPMNlint` | Your `.bpmnlintrc` is in use (hover for its path). |
| `BPMNlint (default)` | No `.bpmnlintrc` found, the bundled default is in use. |
| `BPMNlint: N rules skipped` | Some rules or plugins could not be resolved. |
| `BPMNlint: N rule packages not allowed` | Rules were skipped because you have not [allowed](#allow-a-rule-package) the rule packages that provide them. Hover to see which rules. |
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
