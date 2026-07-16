# Getting Started (IntelliJ)

The Miragon BPMN Modeler is also available for IntelliJ IDEA (and the other
IntelliJ-based JetBrains IDEs ≥ 2024.2). It opens `.bpmn` files in a JCEF
(embedded Chromium) editor that renders the same bpmn-js modeler used by the
VS Code extension and the standalone app.

The plugin is published on the official
[**JetBrains Marketplace**](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler),
so it installs through the regular *Marketplace* flow — no custom repository
setup required.

## Requirements

- IntelliJ IDEA Community / Ultimate **2024.2** or newer (any 2024.2+ IDE based
  on the IntelliJ Platform works — PyCharm, WebStorm, GoLand, …).
- A platform with a bundled bridge binary:
  macOS arm64 / x64, Linux x64 / arm64, Windows x64.

No Node.js install is required — the plugin ships a self-contained bridge
binary for each supported platform.

## Install

1. Open *Settings → Plugins*.
2. Select the *Marketplace* tab.
3. Search for **Miragon BPMN Modeler** and click *Install*.
4. Restart the IDE when prompted.

Prefer the browser? Open the
[JetBrains Marketplace listing](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler)
to read reviews and the changelog, then click **Get → Install to IDE** to push
it straight into a running IDE.

Updates are delivered automatically: the IDE offers new versions from the
Marketplace on its normal schedule under *Settings → Plugins → Updates*.

## Open a diagram

Create or open any `.bpmn` file in your project — the modeler opens
automatically as the default editor for that file type.

## Actions

All plugin actions are accessible via **Find Action** (`Ctrl+Shift+A` /
`Cmd+Shift+A`) or **Search Everywhere** (double `Shift`) — search for the
action name.

| Action | Description |
|---|---|
| New BPMN Model… | Create a new BPMN diagram and open it in the modeler (also under *Project view ▸ New*) |
| New DMN Model… | Create a new DMN decision file (also under *Project view ▸ New*) |
| Add Template Marketplace… | Register a GitHub/GitLab repository or local folder holding a `marketplace.json` |
| Update Template Marketplaces | Re-fetch every configured [template marketplace](/vscode/features/template-marketplace) |
| Remove Template Marketplace… | Unregister one or more marketplaces and prune their cached templates |
| Reload Modeler | Re-scan element templates and re-render open diagrams without closing the tab |
| Change Engine Version… | Change the Camunda engine version of the focused diagram |
| Migrate All Diagrams… | Migrate every BPMN diagram in the project to a chosen engine version |
| Change Modeler Language… | Switch the modeler UI language |
| Copy Diagram as SVG | Copy the focused diagram to the clipboard as SVG |
| Save Diagram as SVG… | Export the focused diagram to an SVG file |

## Where to next

- [VS Code Getting Started](/vscode/getting-started) — same modeling features,
  different host.
- [Features overview](/vscode/features/) — feature documentation is hosted
  under `/vscode/` but the underlying capabilities apply to the IntelliJ
  plugin too (the modeling engine is shared).
