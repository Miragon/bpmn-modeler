# `@miragon/bpmn-modeler-properties-panel`

One properties panel for the three modes: read-only **View**, engine-neutral **Design** and Camunda 7 or 8
**Implement**. It is a fork of
[bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel) 5.65.0 (MIT, see
[`LICENSE-upstream`](LICENSE-upstream)), inlined into `@miragon/bpmn-modeler`, whose
`THIRD_PARTY_NOTICES` lists the modifications.

Internal workspace, not published on its own.

## Modules

| Module | Purpose |
| --- | --- |
| `PropertiesPanelModule` | The renderer. Mounts on a read-only viewer and turns read-only when there is no `modeling` service: every entry disabled, no list add or remove. |
| `NeutralPropertiesProviderModule` | The standard-BPMN provider. Group and entry ids match upstream, so the Camunda providers still splice in and the i18n keys resolve. |
| `ModeFilterModule` | A priority-10 filter: unchanged in `implement`, reduced to the neutral and host custom groups in `design`. |
| `CustomGroupsModule` | The `customPropertiesGroups` slot for host group ids that survive Design mode. |

Why it is a fork and how the filter treats engine groups is in the
[Properties panel ADR](../../docs/adr/bpmn-modeler-features.md#properties-panel).

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

The mode defaults to `design`. Set `propertiesPanelMode: "implement"` in the modeler config, or call
`setMode(mode)` on the `propertiesPanelModeFilter` service.

## Before you change it

- **Upstream bump.** Bumping `bpmn-js-properties-panel` or `@bpmn-io/properties-panel` means re-diffing
  the renderer and neutral entries and rechecking the Camunda group ids in
  `src/modeFilter/engineGroupData.ts`.
- **Header icons.** `src/render/icons/index.tsx` is generated from the pinned upstream sourcemap. After a
  bump, run `node libs/properties-panel/scripts/generate-icons.mjs` and review the diff; never edit the
  file by hand.
- **Preact.** Forked `.tsx` files carry the pragma `/** @jsxImportSource @bpmn-io/properties-panel/preact */`
  to draw with the panel's own Preact.
- **Flushable debounce.** `PropertiesPanelModule` uses `FlushableDebounceInputModule`: the same
  `debounceInput` service and 600 ms delay as upstream, plus `hasPending()` and `flush()`, so a host can
  save a value the user just typed.
- Keep the fork headers, `LICENSE-upstream` and the package's `THIRD_PARTY_NOTICES` intact.
