# Jump to code and models

Go from a task to the source file that implements it, from a reference to the model it points to, and reuse messages,
signals, errors and escalations from other models.

All three work in VS Code, the desktop app and IntelliJ. They search the open workspace (in IntelliJ, the project) and
skip `node_modules`, `dist`, `build`, `out`, `target`, `bin`, `coverage` and version-control folders.

## Go to implementation

Select a service task, send task or business rule task and click **Go to implementation** in the context pad. The
modeler opens the source file behind the task.

| Engine | Reference in the model | How the file is found |
|---|---|---|
| Camunda 7 | `camunda:class` | The class name becomes a path (`com.acme.SendMail` → `com/acme/SendMail.java`) under any source root |
| Camunda 7 | `camunda:delegateExpression`, `camunda:expression` | The bean name becomes a class name (`${sendMail}` → `SendMail.java`). If there is no such file, the modeler looks for a bean annotation with that name, for example `@Service("sendMail")` or `@Component(value = "sendMail")` |
| Camunda 7 | External task `camunda:topic` | Source files that contain the topic as a quoted string |
| Camunda 8 | Job type in `zeebe:taskDefinition` | Source files that contain the job type as a quoted string, for example `@JobWorker(type = "send-mail")` |

Class and bean lookups search `.java`, `.kt`, `.groovy` and `.scala` files. Topic and job-type lookups also search
`.js` and `.ts` files, for Node workers.

- One match opens the file. Several matches open a list to pick from. No match shows a message.
- The entry hides when the modeler knows that no file implements the task. It keeps this map up to date while you edit
  the diagram or the code.
- The entry appears on Camunda 7 and Camunda 8 models in Design and Implement. It is not available in View or on
  engine-neutral models.

To keep the map on disk (faster reopening, and a file other tools can read), turn on
`miragon.bpmnModeler.persistCodeLinkMap`. The map is then written to `<configFolder>/code-link/<file>.json`, for
example `.camunda/code-link/order-process.bpmn.json`.

## Navigate to referenced model

Select an element that refers to another model and click **Navigate to referenced model** in the context pad.

| Element | Reference | Opens |
|---|---|---|
| Call activity | `calledElement` (Camunda 7), `zeebe:calledElement processId` (Camunda 8) | The `.bpmn` file whose process has this id |
| Business rule task | `camunda:decisionRef` (Camunda 7), `zeebe:calledDecision decisionId` (Camunda 8) | The `.dmn` file whose decision has this id |
| User task (Camunda 8) | `zeebe:formDefinition formId` | The `.form` file whose top-level `id` matches |

The entry works in every mode, including View. For a user task it only appears once a matching `.form` file exists.
As above, one match opens, several open a list and none shows a message. IntelliJ has no DMN or form editor, so those
files open in the IDE's own editor.

A business rule task can show both entries: **Go to implementation** for its code and **Navigate to referenced model**
for its decision.

## Search other models

Messages, signals, errors and escalations often have to match across models. In the properties panel, the message,
signal, error and escalation groups end with a **Search other models** field. Type a name or code to search every
`.bpmn` file in the workspace. Each result shows where the definition is thrown and caught.

Picking a result copies the definition into the current model (or reuses an equal one that is already there) and links
it to the element. BPMN cannot reference definitions in other files, so the model stays self-contained. The search
index follows file changes, so edits in other models show up without a reload.

Available in Design and Implement.

## Next steps

- [Inline scripts](/vscode/features/inline-scripting): edit scripts in a real editor tab.
- [Forms](/vscode/features/form-editing): edit the `.form` files a user task links to.
- [Configuration](/vscode/configuration): `configFolder` and the other settings.
