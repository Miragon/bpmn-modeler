# Inline scripts

Edit the inline scripts of Camunda 7 script tasks, execution listeners and task listeners in real VS Code editor tabs, with highlighting, Camunda completions and your AI assistant.

## Open a script

| Where | How |
|---|---|
| Script task, canvas | Select it and click the VS Code icon in the context pad. |
| Script task, properties panel | Click the VS Code icon in the **Script** group header. |
| Execution or task listener | Click the VS Code icon on the listener row under **Execution Listeners** or **Task Listeners**. |
| Keyboard | Select an element and press <kbd>O</kbd> to open its first script (script task, then execution listeners, then task listeners). |

The script opens in a tab beside the diagram. Opening a listener that uses a Java class, expression or delegate converts it to an inline script in one undoable step; press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd> on the diagram to get the old implementation back.

| Script | Tab title |
|---|---|
| Script task `Task_1` | `Task_1.js` |
| Execution listener `start` on `Task_1` | `Task_1.execution-start.js` |
| Second `start` execution listener | `Task_1.execution-start-1.js` |
| Task listener `create` on `UserTask_1` | `UserTask_1.task-create.js` |

## Languages

| `scriptFormat` | Language | Extension |
|---|---|---|
| `javascript` | JavaScript | `.js` |
| `groovy` | Groovy | `.groovy` |
| `python` | Python | `.py` |
| `ruby` | Ruby | `.rb` |

If `scriptFormat` is empty or unknown, the modeler asks for a language the first time and writes it into the model.

## How editing works

- Every keystroke goes straight into the BPMN model, which becomes dirty. **Save the `.bpmn` file** to keep the change; saving the script tab only refreshes the file on disk.
- While a tab is open, the matching **Script** field in the properties panel is read-only and shows **Read-only** with a hint such as *Being edited in `Task_1.js`*. Click the hint to jump to the tab.
- Undo on the canvas also undoes script edits and updates the open tab. Deleting the element closes its tab.
- Closing the tab keeps your edits in the model.
- Renaming the element id closes the tab. The script stays in the model; open it again from the element.

## Files on disk

Open scripts are real files under `<configFolder>/tmp/scripting/` (`.camunda/tmp/scripting/` by default), ignored by git through a generated `.gitignore` and removed when you close the diagram. Because they are real files, language servers and terminal tools such as Claude Code can read and edit them; an external change streams into the model as long as the tab has no unsaved edits.

**Miragon BPMN Modeler: Generate Script Files for Script Tasks** writes one file per script task of the open diagram without opening tabs, for example to let a coding agent work on all of them. Live sync for a file starts when you open it. If the panel was edited in between, open the script through the properties-panel button: it rewrites the file from the model first.

## Completions

The Camunda 7 script API is completed for every language. Which beans exist depends on the script:

| Script | Beans |
|---|---|
| Script task | `execution` |
| Execution listener | `execution`, `eventName` |
| Task listener | `execution`, `task`, `eventName` |

You also get:

- **Process variables** inside `getVariable("…")` / `setVariable("…")` and at the start of a line, found in mappings, form fields, result variables and expressions of the diagram.
- **Local variables** and functions declared in the script.
- **Camunda SPIN**: `S(…)`, `JSON(…)` and `SpinJsonNode` members. In Groovy, accepting them adds the matching `import static org.camunda.spin.Spin.…` line.
- **JavaScript** gets full typing (hover, signature help) from a generated `camunda.d.ts`. For Groovy, Python and Ruby, install a language-server extension for general language features.

| Setting | Default | Description |
|---|---|---|
| `miragon.bpmnModeler.scripting.spin` | `true` | Offer SPIN completions. Turn off if `camunda-spin` is not on your classpath. |

## Declare variables

Variables that come from outside the model (a start payload, a message, a parent process) can be declared in a manifest under `<configFolder>/vars/` that mirrors the diagram's workspace path:

```
src/order-process.bpmn
.camunda/vars/src/order-process.bpmn.vars.json
```

```json
{
  "variables": [
    { "name": "orderId", "type": "String", "description": "Set by the REST start request" },
    { "name": "amount", "type": "Long" },
    { "name": "approved" }
  ]
}
```

`name` is required, `type` and `description` are optional. Declared variables win over detected ones and show their description in completions. The file is watched and validated by a bundled JSON schema; a broken manifest is ignored.

To add a variable from the script, put the cursor on an unknown name and open the quick fix (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>.</kbd>): **Declare '…' in variable manifest** adds it and opens the manifest.

## Tips

- Open as many script tabs as you like; each one syncs on its own.
- Ghost-text completions and inline chat (for example GitHub Copilot, <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>I</kbd>) work as in any other file. Accepted changes land in the model at once.
- Avoid editing the same script from two VS Code windows at once: they share one file on disk.

## Next steps

- [Flow navigation](/vscode/features/flow-navigation): open a script with <kbd>O</kbd>.
- [Jump to code and models](/vscode/features/code-navigation): for logic that lives in source files.
- [Linting](/vscode/features/linting): check the diagram around your scripts.
