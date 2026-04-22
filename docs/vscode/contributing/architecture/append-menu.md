# Append Menu internals

## Overview

The custom append menu replaces the default popup from
`bpmn-js-create-append-anything` with a positioned two-panel Preact overlay
that combines element templates with standard BPMN elements. The override is
transparent to the rest of bpmn-js — `commandStack.append` flows are unchanged.

See the [user-facing Append Menu page](/vscode/features/append-menu) for
screenshots and the UX contract.

## System overview

Two libraries cooperate:

| Library | Role |
|---|---|
| `libs/append-menu/` | UI overlay — decorates the diagram-js popup menu and renders the Preact panel. |
| `libs/create-append-c7-element-templates/` | Polyfills `elementTemplates.createElement()` for Camunda 7, so `bpmn-js-create-append-anything` can instantiate template-preconfigured elements. |

Both are registered as `additionalModules` when the modeler is constructed in
`apps/bpmn-webview/src/app/modeler.ts`.

## Entry points

- **`AppendMenuOverride`** decorates diagram-js's `popupMenu.open(...)`. When
  the provider id is `bpmn-append` or `bpmn-create`, the override collects
  entries from `popupMenu._getContext()` and renders the overlay instead of the
  default popup.
- **`TemplateElementFactory`** (C7 polyfill) patches
  `elementTemplates.createElement` on the Camunda 7 element templates service
  at module init.

## Key files

| File | Purpose |
|---|---|
| `libs/append-menu/src/index.ts` | DI module export |
| `libs/append-menu/src/AppendMenuOverride.ts` | Decorates `popupMenu.open()`, manages overlay lifecycle |
| `libs/append-menu/src/types.ts` | Entry types, classification, BPMN type → icon mapping |
| `libs/append-menu/src/components/AppendMenuOverlay.tsx` | Root component: positioning, search, state management |
| `libs/append-menu/src/components/TemplatePanel.tsx` | Template list with category chips and keyboard navigation |
| `libs/append-menu/src/components/BpmnElementPalette.tsx` | Collapsible BPMN element palette with favourites |
| `libs/append-menu/src/components/ExpandableTemplateCard.tsx` | Template card with hover-to-expand detail |
| `libs/append-menu/src/append-menu.css` | All styles (prefixed with `am-`) |
| `libs/create-append-c7-element-templates/src/index.ts` | C7 createElement polyfill module |
| `libs/create-append-c7-element-templates/src/TemplateElementFactory.ts` | Creates shapes with templates applied via command stack |
| `libs/create-append-c7-element-templates/src/ExtendElementTemplates.ts` | Patches `createElement` onto the C7 element templates service |

## Interaction flow

1. User clicks the **Append element** button in the context pad, or presses `A`
   in the palette.
2. diagram-js invokes `popupMenu.open('bpmn-append', …)` — intercepted by
   `AppendMenuOverride`.
3. The override collects all provider entries, classifies them into
   **templates** (enriched with the full `ElementTemplate` object) and
   **standard BPMN elements** (grouped by category).
4. A Preact overlay is rendered into `document.body`, positioned near the
   trigger point and clamped to the canvas bounds.
5. Clicking an entry triggers the underlying `bpmn-append` / `bpmn-create`
   action through the real `popupMenu` (the override only short-circuits the
   *presentation*, not the command dispatch).
6. The overlay closes on outside click, `Escape`, `contextPad.close`,
   `canvas.viewbox.changing`, or `commandStack.changed`.

## Gotchas

- The override must not swallow the entries — after rendering the overlay it
  still calls the underlying factory when the user picks something, so the
  regular `bpmn-append` command flow runs intact.
- The BPMN element palette defaults to icon-only to keep the panel compact.
  Expanding it changes layout — test overlay positioning at both sizes when
  you touch `am-palette-*` CSS.
- The C7 template-creation polyfill exists because the upstream
  `@camunda/element-templates` C7 build doesn't ship `createElement`. If you
  upgrade that package, double-check whether the polyfill is still needed.

## Related

- [bpmn-js-create-append-anything](https://github.com/bpmn-io/bpmn-js-create-append-anything) — upstream palette
- [diagram-js `popupMenu`](https://github.com/bpmn-io/diagram-js/tree/develop/lib/features/popup-menu) — the primitive being decorated
- [Architecture overview](../architecture-overview) — mental model for bpmn-js DI modules
