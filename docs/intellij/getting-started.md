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

## Where to next

- [VS Code Getting Started](/vscode/getting-started) — same modeling features,
  different host.
- [Features overview](/vscode/features/) — feature documentation is hosted
  under `/vscode/` but the underlying capabilities apply to the IntelliJ
  plugin too (the modeling engine is shared).
