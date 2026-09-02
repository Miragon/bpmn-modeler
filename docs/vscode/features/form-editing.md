# Form Editing

The Miragon BPMN Modeler opens `.form` files in a visual Camunda Form editor
powered by [bpmn.io form-js](https://bpmn.io/toolkit/form-js/). Build forms for
User Tasks, preview them, and test their input and output data without leaving VS Code.

## Create or open a form

1. Open the Command Palette.
2. Run **Miragon BPMN Modeler: New Form**.
3. Choose a location and filename. The extension adds the `.form` suffix when
   you omit it.
4. Add and configure components in the visual editor, then save the file.

Existing `.form` files open in the visual editor automatically. You can also
create an empty `.form` file; the editor initializes it with a valid empty form
schema when you open it.

Run **Miragon BPMN Modeler: Toggle Standard Text Editor** or press
<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> to inspect or edit
the underlying JSON beside the visual editor.

## Edit and preview

Use the toolbar at the top of the Form Editor to switch between two modes:

- **Edit** opens the form-js modeler for adding fields, arranging the layout,
  and changing component properties.
- **Preview** renders the current form as users will see it. You can interact
  with its fields before saving the form.

Switching modes keeps your current form changes. Save the `.form` file to
persist them.

## Test input and output values

Use the Form Editor title buttons or run these commands from the Command
Palette:

- **Miragon BPMN Modeler: Toggle Form Input Values** opens a writable
  `<form-name>.input.json` tab. Enter a valid JSON object to provide process
  variables to the preview. Valid changes appear in the preview immediately.
- **Miragon BPMN Modeler: Toggle Form Output Values** opens a read-only
  `<form-name>.output.json` tab. It shows the values that the current preview
  would submit and updates while you interact with the form.

Input and output values exist only for the current open Form Editor session.
The extension does not write these companion documents to your workspace or
store them in the `.form` file. Closing the form discards the test values.

## Open a form from a User Task

The extension can resolve a User Task's form declaration and open the
matching `.form` file:

1. Save the `.form` file in the workspace and note its top-level `id` value.
2. Select the User Task in the BPMN diagram.
3. Set the User Task's **Form ID** to the same value as the form's `id`.
4. Click **Navigate to referenced model** in the User Task's context pad, or
   press <kbd>G</kbd> while the task is selected.

The Form ID, not the filename, identifies the target. If more than one form
uses the same ID, the extension asks which file to open.
