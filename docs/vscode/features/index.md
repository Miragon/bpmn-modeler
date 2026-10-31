# Features

Everything the modeler does, in the order you work: model, simulate, code, review and deploy. The pages describe VS Code.
The desktop app runs the same extension, and the IntelliJ plugin shares the BPMN modeler (it does not edit DMN or forms).

## Model

- [Editor modes](/vscode/features/modes): switch an editor between View (read-only), Design (engine-neutral) and
  Implement (full Camunda modeler).
- [Append menu](/vscode/features/append-menu): add the next element from one searchable popup with BPMN elements
  and element templates.
- [Flow navigation](/vscode/features/flow-navigation): move along sequence flows with Tab, Shift+Tab and Enter.
- [Element templates](/vscode/features/element-template-chooser): browse, preview and apply Camunda element
  templates, and preview your own while you write them.
- [Template marketplace](/vscode/features/template-marketplace): load templates from shared GitHub or GitLab
  repositories or local folders.
- [Forms](/vscode/features/form-editing): edit Camunda Forms (`.form`) and test them in a preview.
- [Language support](/vscode/features/language-support): switch the modeler UI language.

## Simulate and check

- [Token simulation](/vscode/features/token-simulation): send tokens through the process to see which paths it
  takes, without an engine.
- [Linting](/vscode/features/linting): check the diagram live with bpmnlint and your own rules.

## Code

- [Jump to code and models](/vscode/features/code-navigation): open the source file behind a task, the model a
  call activity or business rule task refers to, or reuse messages and signals from other models.
- [Inline scripts](/vscode/features/inline-scripting): edit script tasks and listener scripts in a real editor
  tab.

## Review and deploy

- [BPMN diff](/vscode/features/bpmn-diff): compare two versions of a diagram side by side, with changes
  highlighted.
- [Deployment](/vscode/features/deployment): deploy BPMN and DMN files to Camunda 7 or Camunda 8 and start process
  instances.
