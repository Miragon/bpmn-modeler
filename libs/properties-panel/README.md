# @miragon/bpmn-modeler-properties-panel

An engine-neutral properties panel for [bpmn-js](https://github.com/bpmn-io/bpmn-js),
built for the "one document, three modes" epic (#1438): one panel that serves a
readonly **View**, an engine-neutral **Design** surface, and Camunda 7/8
**Implement** editing.

It is a fork of [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel)
v5.65.0 (MIT — see [`LICENSE-upstream`](./LICENSE-upstream) and the modifications
listed in the consuming package's `THIRD_PARTY_NOTICES`), split into four
composable bpmn-js DI modules:

| Module | Purpose |
| --- | --- |
| `PropertiesPanelModule` | The panel renderer. Optionalises the command stack so it mounts on a readonly `NavigatedViewer`, and derives a `readonly` flag from the absence of the `modeling` service — disabling every entry and stripping ListGroup add/remove affordances. |
| `NeutralPropertiesProviderModule` | The standard-BPMN provider. Group ids and entry ids match upstream, so the Camunda providers still splice in (#1442) and existing i18n keys resolve. |
| `ModeFilterModule` | A priority-10 groups→groups filter: the identity in `implement` mode, and in `design` mode reduces the panel to the neutral surface (allowlist neutral + host custom groups, strip engine-appended entries, drop engine-replaced `timer`/`multiInstance`). |
| `CustomGroupsModule` | The host slot (`customPropertiesGroups`) marking which extra group ids survive design mode. |

## Usage

```ts
import Modeler from "bpmn-js/lib/Modeler";
import {
    PropertiesPanelModule,
    NeutralPropertiesProviderModule,
    ModeFilterModule,
    CustomGroupsModule,
} from "@miragon/bpmn-modeler-properties-panel";
import "@miragon/bpmn-modeler-properties-panel/src/properties-panel.css";

new Modeler({
    container: "#canvas",
    propertiesPanel: { parent: "#properties" },
    additionalModules: [
        PropertiesPanelModule,
        NeutralPropertiesProviderModule,
        ModeFilterModule,
        CustomGroupsModule,
    ],
});
```

The mode defaults to `design`; set `propertiesPanelMode: "implement"` in the
modeler config, or flip it at runtime via the `propertiesPanelModeFilter`
service's `setMode(mode)`.

## Notes

- **Preact runtime.** Forked `.tsx` files carry a per-file
  `/** @jsxImportSource @bpmn-io/properties-panel/preact */` pragma so they draw
  with the panel's vendored preact.
- **Pinned to upstream 5.65.0.** Bumping `bpmn-js-properties-panel` /
  `@bpmn-io/properties-panel` means re-diffing the renderer and neutral entries
  and re-verifying the hard-coded Camunda ids in `modeFilter/engineGroupData.ts`.

Private workspace lib — inlined into `@miragon/bpmn-modeler`, not published on its
own. See [ADR 0017](../../docs/adr/0017-engine-neutral-properties-panel-lib.md).
