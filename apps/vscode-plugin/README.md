<div align="center">
<img src="https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/miragon-logo.png" alt="Miragon" height="140">

### BPMN Modeler

BPMN 2.0, DMN, and Camunda Form modeling for Camunda 7 and Camunda 8 — directly in VS Code.

[Documentation](https://miragon.github.io/bpmn-modeler/) · [Report Bug](https://github.com/Miragon/bpmn-modeler/issues) · [Request Feature](https://github.com/Miragon/bpmn-modeler/pulls)
</div>

---

![Miragon Modeler for BPMN: processes, decisions and forms from plain files, right in VS Code](/docs/public/shots/vscode/cover.png)

## What it is

A **BPMN** (Business Process Model and Notation) diagram describes a business
process as a flowchart of events, tasks, and decisions; a **DMN** (Decision
Model and Notation) diagram captures the decision logic behind it as tables. A
**Camunda Form** defines the user-facing fields for a Camunda 8 user task.

This extension opens `.bpmn`, `.dmn`, and `.form` files in graphical editors
inside VS Code, while the text file stays the source of truth — so save, Git,
and diff keep working, and models are versioned and reviewed in the same
workflow as the rest of your project. No context switch into a separate desktop
modeler.

> **Powered by [bpmn.io](https://bpmn.io/)** — built on
> [bpmn-js](https://github.com/bpmn-io/bpmn-js) and
> [dmn-js](https://github.com/bpmn-io/dmn-js), plus
> [form-js](https://github.com/bpmn-io/form-js).

![Appending the missing end event to "Ship order" in VS Code clears the lint error and the modeler reports no issues](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-demo.gif)

## Getting started

Install **BPMN Modeler** (publisher `miragon-gmbh`) from the VS Code
Marketplace, then get oriented in a couple of minutes:

1. **Take the walkthrough first.** The built-in **Get Started with BPMN
   Modeler** walkthrough is the recommended first stop — open it from
   **Help: Get Started** in the Command Palette. It walks you through creating,
   editing, and deploying a diagram.
2. **Create a model.** Make a new file ending in `.bpmn` (a BPMN 2.0 process),
   `.dmn` (a DMN decision table), or `.form` (a Camunda Form). VS Code opens it
   straight in the matching graphical editor instead of the plain text editor.
3. **Open an existing one.** Any `.bpmn`, `.dmn`, or `.form` file opens the same way.

## Reading a diagram

New to the notation? Here is the 30-second version — full primers are linked
under [Learn more](#learn-more).

A BPMN process reads left to right along its flow:

- **Events** (circles) mark what starts, happens during, or ends the process.
- **Tasks** (rounded rectangles) are the work being done.
- **Gateways** (diamonds) split or merge the flow to model decisions and
  parallel paths.
- **Sequence flows** (arrows) connect the elements in the order they run.

A DMN decision table reads as rows of rules: input columns on the left map to
output columns on the right, so each row says "when the inputs look like this,
the decision is that".

## A quick tour

![order-fulfilment.bpmn in VS Code with the user task Pack order selected, its context pad open and its implementation, assignment and form groups in the properties panel](/docs/public/shots/vscode/editor.png)

Select an element to change it from its context pad and to set its Camunda 7 or
Camunda 8 details in the properties panel.

![The order fulfilment process in token simulation, a token past the gateway In stock? and the simulation log listing Check stock and In stock?](/docs/public/shots/vscode/simulation.png)

Play a process through with the token simulation before you deploy it.

![return-handling.bpmn with red error markers on a service task without a job type and on two flows without a condition, and 3 errors in the lint hint and the status bar](/docs/public/shots/vscode/linting.png)

Linting marks what the engine would reject, on the canvas and in the
**Problems** panel.

![The Choose carrier decision table from shipping.dmn: country and weight in, carrier and cost out, with fields to simulate the decision above it](/docs/public/shots/vscode/decision.png)

DMN decision tables, with a simulation right above the table.

## Editing a diagram

- **Graphical editor for `.bpmn` / `.dmn`.** Add elements from the palette or
  the context pad on a selected shape, connect them into sequence flows, and set
  each element's name, type, and Camunda 7 / Camunda 8 attributes in the
  **Properties panel**. Everything is written straight back into the underlying
  XML. Flip to the raw XML at any time with **BPMN Modeler: Toggle Standard
  Text Editor** (`Ctrl+Shift+E`); it also sits in the editor title bar.
- **Visual editor and preview for `.form`.** Build a Camunda Form visually and
  switch to **Preview** without losing edits. Use **BPMN Modeler: New Form** to
  create a valid starter form. Toggle the standard text editor to edit the raw
  JSON; VS Code validates it against the form-js JSON Schema and displays
  problems in the editor and Problems panel.
- **Navigate from a C8 User Task to its linked form.** A User Task whose
  `formId` resolves to a workspace `.form` file shows a link action in its
  context pad. Select it to open the form in a separate editor tab.
- **Review forms as JSON.** Current VS Code releases open `.form` comparisons in
  the standard text diff editor. VS Code 1.76–1.128 can still route custom-editor
  comparisons to the visual editor; use **Reopen Editor With… → Text Editor** on
  those legacy releases.
- **Element templates** — convention-based discovery: drop templates under
  `<configFolder>/element-templates/` anywhere between your BPMN file and the
  workspace root. No extra project config needed.
- **Deploy to Camunda** — open the **Deploy Diagram** view from the activity
  bar (the rocket icon) or run **BPMN Modeler: Deploy Diagram** from the editor
  title bar to deploy a diagram and start process instances against Camunda 7
  or 8. Supports no auth, Basic Auth, and OAuth2 Client Credentials; payload
  files are discovered by convention from `<configFolder>/payloads/`.
- **Compare two diagrams** — select two `.bpmn` files in the Explorer (or
  right-click one, **Select for Compare (BPMN)**, then **Compare with
  Selected (BPMN)** on another) to open a side-by-side read-only diff with element-level
  colour coding (added / removed / changed / moved) via
  [`bpmn-js-differ`](https://github.com/bpmn-io/bpmn-js-differ), synchronized
  pan/zoom, and a prev/next change navigator.
- **Linting** — diagrams are checked with [bpmnlint](https://github.com/bpmn-io/bpmnlint)
  (a bundled default, or a `.bpmnlintrc` found in your workspace); findings show as
  hints on the canvas, in the **Problems** panel, and in the status bar. Only
  drawing processes, not automating them? Turn linting off — for all your files —
  from the switch on the lint hint, the **BPMN Modeler: Toggle Linting** command,
  the status-bar badge, or the `miragon.bpmnModeler.linting.enabled` setting.
- **Export** — copy the current diagram to the clipboard as SVG, or save an SVG
  next to the source file, via the SVG commands below.
- **Multi-language UI** — palette, context pad, and properties panel in 12
  languages, from English and Deutsch to 日本語 and 한국어
  ([all languages](https://miragon.github.io/bpmn-modeler/vscode/features/language-support)).

### Commands

Search for "BPMN Modeler" in the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command                                   | Keybinding     | Description                                                      |
|-------------------------------------------|----------------|------------------------------------------------------------------|
| BPMN Modeler: Deploy Diagram              |                | Open the Deployment sidebar for the current BPMN/DMN diagram     |
| BPMN Modeler: Copy Diagram as SVG         |                | Copy the current diagram to the clipboard as SVG                 |
| BPMN Modeler: Save Diagram as SVG         |                | Save an SVG file of the current diagram next to the source file  |
| BPMN Modeler: Change Engine Version       |                | Switch between engine versions (within a platform)               |
| BPMN Modeler: Migrate All BPMN Diagrams   |                | Switch the engine versions of all BPMN diagrams in the workspace |
| BPMN Modeler: Change Modeler Language     |                | Change the UI language of the modeler                            |
| BPMN Modeler: New Form                    |                | Create a valid Camunda Form and open its visual editor           |
| BPMN Modeler: Toggle Linting              |                | Turn BPMN linting on or off (applies to all files)               |
| BPMN Modeler: Toggle Standard Text Editor | `Ctrl+Shift+E` | Open the XML or JSON text editor next to the visual editor       |
| BPMN Modeler: Display Logging Information |                | Open a console showing modeler log output                        |

The compare commands — **Select for Compare (BPMN)**, **Compare with Selected (BPMN)**, and
**Compare Selected (BPMN)** — are available from the Explorer right-click menu on
`.bpmn` files rather than the Command Palette.

### Settings

Search for "BPMN Modeler" in Settings (`Ctrl+,` / `Cmd+,`).

| Setting                                         | Default                     | Description                                                             |
|-------------------------------------------------|-----------------------------|-------------------------------------------------------------------------|
| `miragon.bpmnModeler.configFolder`              | `.camunda`                  | Folder name used for element template and payload file discovery        |
| `miragon.bpmnModeler.linting.enabled`           | `true`                      | Run BPMN linting; turn off to hide all lint hints (design-only users)   |
| `miragon.bpmnModeler.language`                  | `en`                        | UI language for the modeler (e.g. `de`, `fr`, `zh-Hans`)                |
| `miragon.bpmnModeler.colorTheme`                | `automatic`                 | Color theme for the BPMN canvas (`automatic` or `light`)                |
| `miragon.bpmnModeler.favouriteBpmnElements`     | `["bpmn:ServiceTask", ...]` | BPMN element types pinned at the top of the append menu palette (max 6) |
| `miragon.bpmnModeler.showTransactionBoundaries` | `true`                      | Show transaction boundaries in the BPMN canvas (C7 only)                |
| `miragon.bpmnModeler.c8ApiVersion`              | `v2`                        | REST API version prefix for Camunda 8 deployment endpoints              |
| `miragon.bpmnModeler.alignToOrigin`             | `false`                     | Align the diagram to the origin when opening a new diagram              |

## Troubleshooting

The modeler logs to the **`bpmn.modeler`** output channel. Open it from the
Output panel (**View: Output**, then select *bpmn.modeler*) or with the command
**BPMN Modeler: Display Logging Information**.

By default the channel shows `Info` and above. When a diagram, element
template, or the webview misbehaves, raise the level to see the full trace:
run **Developer: Set Log Level…**, pick *bpmn.modeler*, and choose **Debug**.
Debug adds the per-message transport trace, the element-template discovery scan
(which config folder was searched and what was found), and any warnings or
errors the webview forwards (prefixed with `[webview:<file>]`).

**Filing a bug?** Set the log level to **Debug**, reproduce the problem, then
copy the whole `bpmn.modeler` channel into the report — the Info-level
breadcrumbs (editor opened/closed, deployment started/result, SVG export) plus
the Debug transport trace let us reconstruct the exact steps that led to the
failure. Credentials are never logged, so the channel is safe to paste.

## Learn more

- **New to BPMN or DMN?** Learn the notation at
  [camunda.com/bpmn](https://camunda.com/bpmn/) and
  [camunda.com/dmn](https://camunda.com/dmn/).
- **Every feature, in depth:** the
  [documentation](https://miragon.github.io/bpmn-modeler/vscode/features/).
- **The same modeler elsewhere:** in
  [IntelliJ](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler), as a
  [desktop app](https://miragon.github.io/bpmn-modeler/download), and, experimental, in
  [Orca](https://miragon.github.io/bpmn-modeler/orca/getting-started).

## Links

[Documentation](https://miragon.github.io/bpmn-modeler/) ·
[Report an issue](https://github.com/Miragon/bpmn-modeler/issues) ·
[Source and contributing](https://github.com/Miragon/bpmn-modeler/blob/main/CONTRIBUTING.md) ·
[Contact](mailto:info@miragon.io)

## License

Distributed under the [Apache License 2.0](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE).
