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

A rule package is a program: it runs in the extension host with your user's rights, not only inside the editor. The modeler runs a package from your workspace only after you [allow it](#allow-a-rule-package), once per repository. Check parity with `npx bpmnlint <diagram>.bpmn`.

The modeler takes bpmnlint's own rules and configs (`bpmnlint:recommended`, `label-required`, …) from its bundled bpmnlint, also when your workspace installs `bpmnlint`, so a different installed version can report slightly differently than your CI. A `moddleExtensions` entry must name a JSON descriptor, such as `camunda-bpmn-moddle/resources/camunda.json`; an entry that names a script is skipped and reported like a missing one. A runnable example lives in [`resources/example-process/`](https://github.com/Miragon/bpmn-modeler/tree/main/resources/example-process).

If a referenced rule or plugin is not installed, only that entry is skipped. The status bar then shows `BPMNlint: N rules skipped` and the *bpmn.modeler* output channel names them.

## Allow a rule package

When a lint needs a rule package you have not allowed yet, the diagram is linted without it right away, and a notification says how many are waiting, for example *1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped.*

1. Click **Review…**. The [Add-ons view](/vscode/features/add-ons) opens with the first waiting package selected and shows its folder, its version and where an allowance would hold (**Allowed in**); the others carry **Waiting** under **Needs attention** at the top of the list.
2. For each package you trust, select it and click **Allow** at the end of its review. Every open diagram that was linted without it lints again with it.

**Review…** shows a list to check instead when a waiting package lies outside every open folder, for example when the config links to it. Each entry shows the package's name and version and its folder; the package the `.bpmnlintrc` sits in says so. Check the packages you trust and confirm.

Once **Review…** opened the view, the modeler does not ask again in this window about the same packages; their rules stay skipped until you allow them there. To stop a package you allowed, **Revoke** it in the view; that takes the allowance back in every worktree of its repository. A package you leave unchecked in the list is not offered again until the window reloads, and its rules stay skipped. Closing the notification without **Review…** counts the same as leaving every package unchecked. Only one question is open at a time, shared with the questions about [BPMN plugins](/vscode/features/bpmn-plugins#allow-a-plugin).

The modeler asks only when a rule would be skipped. When its bundled rules cover what your config takes from a package you have not allowed, for example the rules of `bpmnlint-plugin-camunda-compat`, it lints with the bundled rules without asking and notes that in the output channel.

An allowance is for the package at its place in your repository, not for its content:

- It covers the package in every worktree of its repository, later changes included: a branch with another version, an update and an edit run without asking. Outside a git repository it covers the package's folder only.
- A second clone of the repository, another repository and a new package ask once.
- Without git, a pnpm update installs the package into a new folder, so it asks again.
- An update loads when it changes the package's `package.json`, as `npm install` of a new version does, or links the package to a new folder, as `pnpm update` does, whether pnpm keeps the old folder or not. That includes a switch from a folder you linked with `file:` or `link:` to a version pnpm installed; npm installs one into the link's place, which loads after you reload the window. Any other edit to the package's files loads after you reload the window.
- When an update links the package to a new folder that has no file where the package's entry or a rule lay before, because the update moved it, that file loads after you reload the window. Until then it is skipped, the old version never runs, and the output channel says to reload.
- A dependency that is itself a rule package, for example one your config's package extends, needs its own allowance.
- Allowances are kept with your [BPMN plugin](/vscode/features/bpmn-plugins) allowances in VS Code's global state, outside every workspace, so a repository cannot allow its own rule packages. [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust) does not replace them: the extension does not run in Restricted Mode, and in a trusted workspace a rule package still needs its allowance. In a remote window (SSH, dev container, WSL) an allowance holds only for that remote.
- When the `.bpmnlintrc` sits in the rule package's own folder, because its `package.json` names the plugin, that folder is the package.
- Approvals from earlier versions are rewritten as allowances when the extension starts; the output channel says how many. An earlier version of the extension does not read the new allowances and asks again.

Only installed packages, in a `node_modules` folder or linked with `file:`, and the package the `.bpmnlintrc` sits in can be allowed. A rule file anywhere else, for example one referenced by an absolute path, never runs, and the output channel says why.

::: warning Only allow rule packages you trust
An allowed rule package runs as a program with your user's rights, with the same access to your files and the network as VS Code itself. Whoever can change your repository, for example by a pull, an install or an agent working in a worktree, changes what runs. **Revoke** a package before you check out code you do not trust.
:::

The modeler runs an allowed package from your workspace, not from a copy as it does for BPMN plugins, and checks only whether its `package.json` changed before a lint. Code that a package loads without declaring it as a dependency runs under the package's allowance. A package that has run stays loaded until the window reloads.

The *bpmn.modeler* output channel explains what happened:

| Output channel line | Meaning |
|---|---|
| `bpmnlint: rule package <name>@<version> (<folder>) is not allowed yet (new), so rules from it are skipped.` | The package's rules were skipped. Instead of `new` it can say `declined this session`. |
| `bpmnlint: bundled rules stand in for a rule package that is not allowed yet: <name>@<version> (<folder>)` | The bundled rules covered everything the config takes from the package, so the modeler does not ask. |
| `bpmnlint: refused to run <file>: it is neither in node_modules nor in the config's own package, so no allowance can cover it.` | A rule outside every package that can be allowed. It never runs. Other reasons are `it belongs to no installed package folder`, `the package link it comes through points to a folder that holds the config`, and `it lies inside a .git folder, which no allowance covers`. |
| `bpmnlint: refused to run <file>: an update moved the package to another folder, from which this process cannot load the file; reload the window or restart the IDE to load the updated package.` | An update moved the package to another folder, and the file cannot load from there before a reload: the update moved the package's entry or a rule file, or npm replaced a folder linked with `file:` by an installed one. The old file never runs; reload the window. |
| `Allowed bpmnlint rule package(s): <name>@<version>, …` | Your answer allowed these packages. |
| `Approvals: rewrote <n> approvals pinned to content as allowances of their add-ons, later changes included.` | At start, approvals from an earlier version were rewritten as allowances. |

### IntelliJ

The IntelliJ plugin asks the same way as for [BPMN plugins in IntelliJ](/vscode/features/bpmn-plugins#intellij): an IDE notification balloon with **Review…**, which selects the rule package in the **Add-ons** tab of the **BPMN Modeler** tool window when the package lies inside the project, and allowances that the IDE keeps for all your projects, outside every project. **Revoke** there takes an allowance back, in every worktree of its repository; rules that already ran stay loaded until you restart the IDE. The output channel lines go to the IDE log.

Rule packages run only in a project you trust in the IDE. In a project you did not trust, the bundled rules lint alone: a rule from a workspace package is skipped (`BPMNlint: N rules skipped`, and the tooltip says the rule packages wait for your trust) and nothing asks, though you allowed the package in another worktree. Trusting the project lints the open diagrams again with it and asks about the packages you have not allowed yet. See [Project trust](/intellij/getting-started#project-trust).

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
