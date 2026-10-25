# Forms

Build Camunda Forms for user tasks in a visual editor ([form-js](https://bpmn.io/toolkit/form-js/)), preview them and test their data inside VS Code.

## Create or open a form

Run **Miragon BPMN Modeler: New Form**, choose a location and a name (`.form` is added if you leave it out), then add components and save. Existing `.form` files open in the visual editor; an empty `.form` file is initialised with a valid empty form.

To see the JSON beside the editor, run **Miragon BPMN Modeler: Toggle Standard Text Editor** or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>.

## Edit and preview

The toolbar switches between two modes. Both keep your unsaved changes; save the file to keep them.

| Mode | Use |
|---|---|
| **Edit** | Add fields, arrange the layout, change component properties. |
| **Preview** | Use the form as a user would see it. |

## Test input and output data

| Command (also in the editor title bar) | Opens |
|---|---|
| **Miragon BPMN Modeler: Toggle Form Input Values** | A writable `<form-name>.input.json` tab. Enter a JSON object as process variables; the preview updates as you type. |
| **Miragon BPMN Modeler: Toggle Form Output Values** | A read-only `<form-name>.output.json` tab with the values the preview would submit, updated live. |

Test data lives only for the open editor session. It is not written to the workspace or the `.form` file and is gone when you close the form.

## Open a form from a user task

1. Set the user task's **Form ID** to the top-level `id` of the form.
2. Select the user task and click **Navigate to referenced model** in the context pad, or press <kbd>G</kbd>.

The form `id` identifies the file, not the file name. If several forms share an id, the modeler asks which one to open.

## Next steps

- [Jump to code and models](/vscode/features/code-navigation): open a form from its user task.
- [Deployment](/vscode/features/deployment): deploy the form with its process.
