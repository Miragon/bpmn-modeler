<div align="center">
<img src="https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/miragon-logo.png" alt="Miragon" height="140">

### BPMN Modeler

BPMN 2.0, DMN, and Camunda Form modeling for Camunda 7 and Camunda 8 — directly in VS Code.

[Documentation](https://miragon.github.io/bpmn-modeler/) · [Report Bug](https://github.com/Miragon/bpmn-modeler/issues) · [Request Feature](https://github.com/Miragon/bpmn-modeler/pulls)
</div>

---

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

![BPMN VS Code Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-preview.png)

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
under [Develop and learn more](#develop-and-learn-more).

A BPMN process reads left to right along its flow:

- **Events** (circles) mark what starts, happens during, or ends the process.
- **Tasks** (rounded rectangles) are the work being done.
- **Gateways** (diamonds) split or merge the flow to model decisions and
  parallel paths.
- **Sequence flows** (arrows) connect the elements in the order they run.

A DMN decision table reads as rows of rules: input columns on the left map to
output columns on the right, so each row says "when the inputs look like this,
the decision is that".

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
  right-click one, **BPMN Modeler: Select for Compare**, then **Compare with
  Selected** on another) to open a side-by-side read-only diff with element-level
  colour coding (added / removed / changed / moved) via
  [`bpmn-js-differ`](https://github.com/bpmn-io/bpmn-js-differ), synchronized
  pan/zoom, and a prev/next change navigator.
- **Export** — copy the current diagram to the clipboard as SVG, or save an SVG
  next to the source file, via the SVG commands below.
- **Multi-language UI** — palette, context pad, and properties panel available
  in English, Deutsch, Español, Français, Nederlands, Português (Brasil),
  Русский, 简体中文, and 繁體中文.

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
| BPMN Modeler: Toggle Standard Text Editor | `Ctrl+Shift+E` | Open the XML or JSON text editor next to the visual editor       |
| BPMN Modeler: Display Logging Information |                | Open a console showing modeler log output                        |

The compare commands — **Select for Compare**, **Compare with Selected**, and
**Compare Selected** — are available from the Explorer right-click menu on
`.bpmn` files rather than the Command Palette.

### Settings

Search for "BPMN Modeler" in Settings (`Ctrl+,` / `Cmd+,`).

| Setting                                         | Default                     | Description                                                             |
|-------------------------------------------------|-----------------------------|-------------------------------------------------------------------------|
| `miragon.bpmnModeler.configFolder`              | `.camunda`                  | Folder name used for element template and payload file discovery        |
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

## Develop and learn more

- **New to BPMN or DMN?** Learn the notation at
  [camunda.com/bpmn](https://camunda.com/bpmn/) and
  [camunda.com/dmn](https://camunda.com/dmn/).
- **Contributing** — building from source and the dev loop are documented in
  [CONTRIBUTING.md](https://github.com/Miragon/bpmn-modeler/blob/main/CONTRIBUTING.md).

## Support and feedback

- Documentation: <https://miragon.github.io/bpmn-modeler/>
- Bugs / feature requests: <https://github.com/Miragon/bpmn-modeler/issues>
- Contact: [info@miragon.io](mailto:info@miragon.io)

## License

Distributed under the [Apache License 2.0](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE).
