# Get started in VS Code

Install the Miragon BPMN Modeler and edit BPMN, DMN and Camunda Form files in a visual editor inside VS Code.
It supports Camunda 7 and Camunda 8, and the Camunda 7 compatible engines Operaton and CIB seven.

## Install

Install the extension from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
or from [Open VSX](https://open-vsx.org/extension/miragon-gmbh/vs-code-bpmn-modeler) (VSCodium, Cursor, Windsurf
and other editors that use Open VSX). From the command line:

```bash
code --install-extension miragon-gmbh.vs-code-bpmn-modeler
```

## Open a file

Open any `.bpmn`, `.dmn` or `.form` file. The matching visual editor opens automatically.

To start from scratch, run **New BPMN Model**, **New DMN Model** or **New Form** from the Command Palette; for BPMN pick
**Camunda 7**, **Camunda 8** or [**Engine-neutral**](/vscode/features/modes#create-an-engine-neutral-file).

## First steps

1. **Pick a mode.** The chip on the canvas switches between View, Design and Implement. See
   [Editor modes](/vscode/features/modes).
2. **Model.** Use the [append menu](/vscode/features/append-menu) to add the next element, or move along the flow with
   the keyboard ([flow navigation](/vscode/features/flow-navigation)).
3. **Add element templates.** Put template JSON files into `.camunda/element-templates/` next to your diagrams (or in
   any folder up to the workspace root). They show up in the
   [element template chooser](/vscode/features/element-template-chooser) and the append menu.
4. **Try the flow.** Switch on [token simulation](/vscode/features/token-simulation) and start a token.
5. **Deploy.** Open **Deploy Diagram** in the activity bar to deploy to Camunda 7 or Camunda 8. See
   [Deployment](/vscode/features/deployment).

## Change the language

Run **Change Modeler Language** to switch the UI (12 languages). See [Language support](/vscode/features/language-support).

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for "Miragon BPMN Modeler".

| Command | Keybinding | What it does |
|---|---|---|
| Toggle Standard Text Editor | `Ctrl+Shift+E` | Switch between the visual editor and the XML |
| Format Diagram | `Shift+Alt+F` | Lay out the open diagram |
| Clean Up Diagram | | List leftovers in the diagram and remove them after you confirm |
| Copy Diagram as SVG | | Copy the diagram to the clipboard as SVG |
| Save Diagram as SVG | | Save an SVG file next to the BPMN file |
| Change Modeler Language | | Switch the modeler UI language |
| Change Engine Version | | Change the engine version of the open diagram |
| Migrate All BPMN Diagrams | | Change the engine version of every BPMN diagram in the workspace, except copies in `node_modules`, build output or folders whose name starts with a dot |
| Deploy Diagram | | Deploy the open diagram to the active deployment target |
| Toggle Linting | | Turn [linting](/vscode/features/linting) on or off |
| Reload Modeler | | Re-read element templates and re-render open diagrams |
| Display Logging Information | | Open the modeler log |

## Next steps

- [Configuration](/vscode/configuration): every setting in one table.
- [Features](/vscode/features/): what the modeler can do, step by step.
- [IntelliJ](/intellij/getting-started) or the [desktop app](/standalone/getting-started): the same modeler outside VS Code.
