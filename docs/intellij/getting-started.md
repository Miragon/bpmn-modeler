# Getting Started (IntelliJ)

The Miragon BPMN Modeler is also available for IntelliJ IDEA (and the other
IntelliJ-based JetBrains IDEs ≥ 2024.2). It opens `.bpmn` files in a JCEF
(embedded Chromium) editor that renders the same bpmn-js modeler used by the
VS Code extension and the standalone app.

The plugin is currently distributed **outside the JetBrains Marketplace**, via
a *custom plugin repository* hosted on GitHub Pages. Install is a one-time setup
plus the regular *Install Plugin* flow.

## Requirements

- IntelliJ IDEA Community / Ultimate **2024.2** or newer (any 2024.2+ IDE based
  on the IntelliJ Platform works — PyCharm, WebStorm, GoLand, …).
- A platform with a bundled bridge binary:
  macOS arm64 / x64, Linux x64 / arm64, Windows x64.

No Node.js install is required — the plugin ships a self-contained bridge
binary for each supported platform.

## Install

1. Open *Settings → Plugins*.
2. Click the gear icon (⚙) next to *Installed* and choose *Manage Plugin
   Repositories…*.
3. Add the custom repository URL:

   ```
   https://miragon.github.io/bpmn-modeler/updatePlugins.xml
   ```

4. Close the dialog. In the *Marketplace* tab, search for
   **Miragon BPMN Modeler** and click *Install*.
5. Restart the IDE when prompted.

Updates are delivered through the same mechanism: the IDE polls the custom
repository on its normal schedule and offers the new version under
*Settings → Plugins → Updates*.

## Open a diagram

Create or open any `.bpmn` file in your project — the modeler opens
automatically as the default editor for that file type.

## Where to next

- [VS Code Getting Started](/vscode/getting-started) — same modeling features,
  different host.
- [Features overview](/vscode/features/) — feature documentation is hosted
  under `/vscode/` but the underlying capabilities apply to the IntelliJ
  plugin too (the modeling engine is shared).
