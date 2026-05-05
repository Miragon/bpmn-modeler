# Inline Script Editing

The BPMN Modeler extension lets you edit inline scripts on
`bpmn:ScriptTask`, `camunda:ExecutionListener`, and `camunda:TaskListener`
elements in real VS Code editor tabs — with syntax highlighting,
IntelliSense for the Camunda 7 script API, and full access to your
favourite editor features (multi-cursor, snippets, AI assistants).

The script body is **not** written to disk: each script lives in a virtual
in-memory document under the `bpmn-script://` URI scheme. Edits are
streamed back into the BPMN model as you type, and the BPMN file becomes
dirty just like any other modeler change.

## Supported Languages

| `scriptFormat` (BPMN) | Language in VS Code | File extension on the tab |
|---|---|---|
| `javascript` | JavaScript | `.js` |
| `groovy` | Groovy | `.groovy` |
| `python` | Python | `.py` |
| `ruby` | Ruby | `.rb` |

If a script element has no `scriptFormat` set — or uses one this extension
does not recognise — VS Code shows a Quick Pick the first time you open
the script so you can choose one of the supported languages. The choice is
written back into the BPMN model so subsequent opens skip the prompt.

<!-- TODO screenshot: Quick Pick listing JavaScript / Groovy / Python / Ruby
     when opening a script that has no scriptFormat set. Title bar should
     read "Choose a script language". -->

## Usage

There are three entry points. They all open the same kind of editor tab
beside the diagram.

### 1. Script Task — Context Pad

1. Select a **Script Task** on the canvas.
2. Click the VS Code icon in the context pad next to the trash bin.
3. The script opens in a new editor tab beside the diagram.

<!-- TODO screenshot: BPMN canvas with a Script Task selected. The context
     pad on the right of the element shows the new VS Code icon entry next
     to the existing icons (wrench, trash, etc.). Annotate the VS Code icon
     with an arrow + label "Edit Script". -->

### 2. Script Task — Properties Panel

1. Select a **Script Task** on the canvas.
2. Open the **Script** group in the properties panel on the right.
3. Click the VS Code icon in the **Script** group header.

<!-- TODO screenshot: Properties panel of a selected Script Task with the
     "Script" group expanded. Highlight the VS Code icon button rendered in
     the group header (top-right of the group, next to the collapse arrow). -->

### 3. Execution & Task Listeners — Properties Panel

1. Select any flow node (e.g. a Service Task or User Task).
2. Open **Execution Listeners** or **Task Listeners** in the properties
   panel.
3. Each listener row shows a VS Code icon button next to its title — click
   it to edit that listener's script.

<!-- TODO screenshot: Properties panel showing the "Execution Listeners"
     group expanded with two listener rows. Each row shows the VS Code icon
     button between the listener title and the trash icon. Annotate one of
     the new buttons. -->

The icon is **always shown**, even when the listener currently uses Java
class, expression, delegate expression, or external-resource script
implementation. Clicking it converts the listener to an inline
`<camunda:script>` in a single undoable step before opening the editor.

> **Heads up:** converting a listener replaces its previous implementation
> (e.g. a Java class reference) with an empty inline script. Press
> <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Z</kbd> on the diagram to revert if
> you opened the editor by mistake.

## What the Editor Tab Looks Like

The tab opens in a side group beside the diagram so you can see both at
once. Tab titles are derived from the element id and the script kind, so
two listeners on the same task do not collide:

| Surface                                       | Tab title                     |
|-----------------------------------------------|-------------------------------|
| Script task `Task_1`                          | `Task_1.js`                   |
| Execution listener `start` on `Task_1`        | `Task_1.execution-start.js`   |
| Second `start` execution listener on `Task_1` | `Task_1.execution-start-1.js` |
| Task listener `create` on `UserTask_1`        | `UserTask_1.task-create.js`   |

<!-- TODO screenshot: VS Code window split — BPMN diagram on the left, a
     JavaScript script editor tab on the right titled "Task_1.js" with a
     few lines of code (e.g. `execution.setVariable(...)`). Both tabs
     visible at the same time to show the side-by-side layout. -->

## Live Edits

- Every keystroke in the script editor is pushed back into the BPMN model
  immediately — there is **no save step**.
- Pressing <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> on the script tab
  is a no-op (the virtual file lives in memory). Save the **BPMN file**
  to persist your script changes to disk.
- Closing the script tab discards the in-memory virtual document but does
  **not** revert the script in the model — the bytes you typed are
  already part of the diagram.
- Switching the BPMN tab away while you keep typing is safe: the changes
  are buffered and replayed when you switch back to the diagram.

## IntelliSense

Each supported language gets context-aware completions for the Camunda 7
script API. The available beans depend on **where the script lives**:

| Script kind        | Beans available as completions   |
|--------------------|----------------------------------|
| Script task        | `execution`                      |
| Execution listener | `execution`, `eventName`         |
| Task listener      | `execution`, `task`, `eventName` |

Typing a bean name plus `.` triggers a list of methods with parameter
hints; typing at the start of a line offers the bean names that are in
scope.

<!-- TODO screenshot: JavaScript script tab showing IntelliSense popup
     after typing `execution.` — the popup should list methods like
     `setVariable`, `getVariable`, `getProcessBusinessKey`, etc. with their
     signatures visible. -->

## Pair with an AI Assistant

Because the script editor is a real VS Code document, AI assistants that
operate on the active editor buffer work the same as in any other file.
This is one of the biggest practical reasons to edit your scripts here
instead of in the properties-panel textarea — you get the full
AI-pair-programming experience on a single line of glue code.

Two flavours of AI feature work out of the box:

- **Ghost-text completions** (e.g. GitHub Copilot, Cursor Tab) — multi-line
  suggestions appear inline as you type, the same as in any other tab.
- **Inline chat / inline edit** (e.g. GitHub Copilot Chat — <kbd>Cmd</kbd>+<kbd>I</kbd>) —
  opens a chat input directly inside the editor. Describe the change you
  want in natural language, accept the diff, and your BPMN file is dirty
  the moment the new bytes land.

### Typical Workflow

1. Open the script via the context pad or one of the properties-panel
   buttons.
2. Hit your AI extension's inline-chat keybinding (most use
   <kbd>Cmd</kbd>+<kbd>I</kbd> / <kbd>Ctrl</kbd>+<kbd>I</kbd>).
3. Describe the change in natural language, e.g.
   *"Set a process variable `customerEmail` from the user task's assignee."*
   or *"Wrap this in try/catch and log errors via `execution.setVariable`."*
4. Accept the suggestion. The script updates in the editor, the BPMN file
   becomes dirty, and you can save the diagram to persist the change.

<!-- TODO screenshot: VS Code split view — BPMN diagram on the left with
     a Script Task selected; on the right, the script tab (e.g. `Task_1.js`)
     with the inline chat popup open inside the editor pane. Show a typed
     prompt like "Set a process variable customerEmail from the user
     task's assignee" and the proposed diff visible underneath. -->

> **What does *not* work:** AI tools that read files from disk — including
> Claude Code's `@` file reference and other terminal-based assistants —
> cannot see the script body, because the virtual document lives only in
> memory. Stick to extensions that operate on the active editor buffer.

## Tips

- **Multiple scripts at once.** Open as many script tabs as you like, on
  the same element or across elements. They all stream back into the
  BPMN model independently.
- **Close tabs you don't need.** When you close a script tab, re-opening
  it loads the latest content from the BPMN model. This is the cleanest
  way to discard a stale buffer if you ever suspect drift.

---

For implementation details, see
[Contributing → Inline Scripting internals](/vscode/contributing/architecture/inline-scripting).
