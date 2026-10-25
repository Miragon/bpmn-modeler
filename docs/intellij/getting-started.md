# Get started in IntelliJ

Install the Miragon BPMN Modeler in IntelliJ IDEA or another JetBrains IDE and edit `.bpmn` files with the same modeler
as in VS Code.

## Requirements

- IntelliJ IDEA Community or Ultimate 2024.2 or newer. Other IDEs on the IntelliJ Platform 2024.2+ work too (PyCharm,
  WebStorm, GoLand and others).
- macOS (arm64, x64), Linux (x64, arm64) or Windows (x64). The plugin brings its own bridge binary for these
  platforms, so you do not need Node.js.

## Install

1. Open **Settings ▸ Plugins** and select the **Marketplace** tab.
2. Search for **Miragon BPMN Modeler** and click **Install**.
3. Restart the IDE when asked.

You can also open the
[JetBrains Marketplace listing](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler) and click
**Get ▸ Install to IDE**. Updates arrive through **Settings ▸ Plugins ▸ Updates**.

## Open a file

Open any `.bpmn` or `.bpmn20.xml` file. The modeler is its default editor. To start from scratch, use
**New BPMN Model…** in the project view under **New**, then pick **Camunda 7**, **Camunda 8** or **Engine-neutral**
(an untagged model that opens in the Design mode).

The plugin edits BPMN only. **New DMN Model…** creates a `.dmn` file, which opens in the IDE's own editor.

## Actions

Find every action with **Find Action** (`Ctrl+Shift+A` / `Cmd+Shift+A`) or under **Tools ▸ Miragon BPMN Modeler**.

| Action | What it does |
|---|---|
| New BPMN Model… / New DMN Model… | Create a model (also in the project view under **New**) |
| Format Diagram (`Ctrl+Alt+L`) | Lay out the focused diagram |
| Clean Up Diagram | List leftovers in the diagram and remove them after you confirm |
| Change Engine Version… | Change the engine version of the focused diagram |
| Migrate All Diagrams… | Change the engine version of every BPMN diagram in the project |
| Change Modeler Language… | Switch the modeler UI language |
| Copy Diagram as SVG / Save Diagram as SVG… | Export the focused diagram as SVG |
| Deploy Diagram / Deploy Files… | Deploy to the active target (see the **Miragon Deployment** tool window) |
| Switch Deployment Target… | Pick the active deployment target for the project |
| Verify Deployment on Engine… | Check the focused diagram against the active Camunda 7 target |
| Generate Script Files for Script Tasks | Write a file for every inline script task of the active diagram; edits sync back live |
| Add / Update / Remove Template Marketplace… | Manage [template marketplaces](/vscode/features/template-marketplace) |
| Reload Modeler | Re-read element templates and re-render open diagrams |

## Settings

The settings live under **Settings ▸ Tools ▸ Miragon BPMN Modeler**: default mode, language, colour theme, config
folder, Camunda 8 API version, align to origin, transaction boundaries, SPIN completion, the code-link map, favourite
elements and template marketplaces. They mean the same as the [VS Code settings](/vscode/configuration). The language
list offers nine languages (no Italian, Japanese or Korean yet).

## Next steps

- [Features](/vscode/features/): the feature pages live under VS Code, but the modeler is the same.
- [Editor modes](/vscode/features/modes): View, Design and Implement.
- [Jump to code and models](/vscode/features/code-navigation): from a task to its implementation.
