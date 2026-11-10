# Add-ons

See and manage everything your workspace adds to the BPMN editor in one place: [BPMN plugins](/vscode/features/bpmn-plugins), [bpmnlint rule packages](/vscode/features/linting#allow-a-rule-package), [element templates](/vscode/features/element-template-chooser) and [template marketplaces](/vscode/features/template-marketplace). Allow or revoke code, and turn templates on or off.

## Open the view

Click the Miragon comet in the activity bar to open the **BPMN Modeler** container. **Add-ons** shows there whenever a folder is open; **Deploy** shows above it while a diagram is open. **Review…** on a plugin or rule package notification opens the view too (see [Allow code](#allow-code)).

## What it lists

The view lists the open workspace only, never other projects:

- One group per workspace folder, in the order the folders are open. In each group, one source per config folder (the root's `.camunda/`, and nested config folders whose diagrams you opened) and per package folder, then the add-ons of that source by name.
- A **Marketplaces** group at the end, with one source per registered marketplace and its cached templates.

Each plugin and rule package shows one of these states:

| State | Meaning |
|---|---|
| Allowed | You allowed exactly this content. It runs. |
| Not allowed yet | Never allowed. It does not run. |
| Changed, review needed | You allowed an earlier content; its files changed since. It does not run until you allow it again. |
| Declined this session | You left it unchecked in the list, or closed the list, this session. |
| Folder gone | You allowed it, but its folder no longer exists. |

## Allow code

A row that can be allowed has a review block, open by default: what the code can do, then its folder, version, the files it covers and its content hash. Check them, then click **Allow this content**. The approval is for exactly this content: a later change shows the row as *Changed, review needed*, and the code stops running until you allow it again. Every open BPMN editor that offered an allowed plugin reloads with it.

**Review…** on a notification opens the view at the waiting plugins or rule packages, with the first one focused, when every one of them lies inside an open folder. The notification then counts as answered for this window. Otherwise, for example when a rule package is linked from outside the workspace, **Review…** shows the list to check, as in [BPMN plugins](/vscode/features/bpmn-plugins#allow-a-plugin).

A rule package that no lint has asked about yet offers **Review…** on its row first. It reads the package; then the row offers **Allow this content**.

## Revoke

**Revoke** takes your approval back. A plugin stops at once: open editors reload without it, and its copy is removed from VS Code's global storage. A rule package's rules are skipped from the next lint; code it already ran stays loaded until you reload the window. No notification asks about it again in this window; allow it again here.

**Forget** removes the approval of a folder that no longer exists.

## Templates

Each template with an id offers **Disable** or **Enable**, and each config folder or marketplace offers **Disable templates** or **Enable templates** for all of its templates. A disabled template is left out of new choices in the [template chooser](/vscode/features/element-template-chooser) and the append menu; elements that already use it keep it. VS Code keeps the switches for you, outside the repository: a config folder's for this workspace, a marketplace's for all your projects once you registered it for all of them, else for this workspace.

## Marketplaces and plugin copies

The toolbar at the top runs **Add marketplace…**, **Update marketplaces** and **Remove unused plugin copies**. Each marketplace source offers **Remove**, which asks before it unregisters the marketplace. The [marketplace commands](/vscode/features/template-marketplace#add-a-marketplace) work as before.

**Remove unused plugin copies** deletes the copies of allowed plugins in VS Code's global storage that no approval names any more.

## Refresh

The view reads again when it is shown and whenever plugins, rule packages, templates, approvals or settings change. It does not watch `node_modules`: after an `npm install`, click **Refresh Add-ons** in the view's title bar.

## Keyboard

The list is one tab stop. Inside it:

| Key | What it does |
|---|---|
| `↓` / `↑` | Next or previous row or heading |
| `Home` / `End` | First or last row or heading |
| `→` | Expand a heading, or move to its first row |
| `←` | Collapse a heading, or move to the parent heading |
| `Enter` / `Space` | Expand or collapse a heading; on a row, move to its first button |
| Letters | Jump to the next row or heading that starts with them |
| `Tab` | Move through the focused row's buttons |
| `Escape` | From a row's buttons back to the row; on a message, dismiss it |

In the toolbar, `←` and `→` move between its buttons.

## IntelliJ

The IntelliJ plugin shows the same page as the **Add-ons** tab of its **BPMN Modeler** tool window, for the open project; **Review…** opens it at the item's row, and **Refresh Add-ons** sits in the tool window's title. See [Getting started in IntelliJ](/intellij/getting-started#add-ons).

## Next steps

- [BPMN plugins](/vscode/features/bpmn-plugins): add plugins and what an allowed plugin can do.
- [Linting](/vscode/features/linting): rule packages and how they are checked.
- [Template marketplace](/vscode/features/template-marketplace): register marketplaces.
