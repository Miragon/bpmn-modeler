# `libs/`: building blocks

Reusable code that other workspaces import through each package's public entry point. The runnable and
shipped ends (webviews, hosts, the Orca plugin) live in [`../apps`](../apps/README.md), the npm packages in
[`../packages`](../packages). Every package here is private: the bpmn-js modules are inlined into
`@miragon/bpmn-modeler` (listed in
[`inlined-libraries.json`](../packages/bpmn-modeler/inlined-libraries.json)), the rest is bundled into the
hosts.

Where code belongs and which imports are allowed is in the
[package boundaries ADR](../docs/adr/architecture-and-hosts.md#package-boundaries).

## Foundation

| Package | What it holds |
| --- | --- |
| [`modeler-core`](modeler-core/README.md) | The host-agnostic engine behind the VS Code extension and the IntelliJ bridge: domain, services and host ports. |
| [`modeler-types`](modeler-types/README.md) | Types, browser utilities and pure rules safe to publish with the npm packages. |
| [`shared`](shared/README.md) | The private webview ↔ host message protocol and the webview chrome the hosts share. |

## bpmn-js modules (inlined into `@miragon/bpmn-modeler`)

| Package | What it adds |
| --- | --- |
| [`append-menu`](append-menu/README.md) | The two-panel overlay behind **Append element** and **Create element**. |
| [`bpmn-clipboard`](bpmn-clipboard/README.md) | Copy and paste through the host, for webviews without clipboard access. |
| [`bpmn-diff`](bpmn-diff/README.md) | The DOM-free diff data layer behind `/diff` and the hosts' BPMN diff. |
| [`bpmn-layout`](bpmn-layout/README.md) | **Format Diagram** and **Clean Up Diagram**. |
| [`code-link`](code-link/README.md) | The **Go to implementation** context-pad action. |
| [`definition-search`](definition-search/README.md) | **Search other models** for messages, signals, errors and escalations. |
| [`element-template-chooser`](element-template-chooser/README.md) | The searchable overlay for picking an element template. |
| [`flow-navigation`](flow-navigation/README.md) | Keyboard traversal along sequence flows. |
| [`inline-scripting`](inline-scripting/README.md) | Editing Camunda 7 inline scripts in a host editor tab. |
| [`model-navigation`](model-navigation/README.md) | Jumping to a called process, decision or linked form, and the form preview. |
| [`properties-panel`](properties-panel/README.md) | The engine-neutral properties panel fork for the View, Design and Implement modes. |

## Other libraries

| Package | What it holds |
| --- | --- |
| [`bpmn-i18n-extras`](bpmn-i18n-extras/README.md) | The few translations the shared `@miragon/bpmn-modeler-i18n` library lacks; also inlined into `@miragon/dmn-modeler`. |
| [`element-template-builder`](element-template-builder) | The form of the element template editor, used by the `bpmn-webview` template editor page. |
| [`standalone-extension`](standalone-extension/README.md) | The Theia frontend extension of the desktop app. |
