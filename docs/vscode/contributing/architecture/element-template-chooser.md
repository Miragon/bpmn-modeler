# Element Template Chooser internals

## Overview

The element template chooser is a standalone bpmn-js plugin that replaces the
upstream `@bpmn-io/element-template-chooser` with a richer, Preact-based
overlay. It listens for the `elementTemplates.select` event fired by the
properties panel, renders a searchable template list with a live preview, and
applies the chosen template via the standard `elementTemplates.applyTemplate`
API.

See the [user-facing Element Template Chooser page](/vscode/features/element-template-chooser)
for UX screenshots and the authoring guide.

## System overview

| Library | Role |
|---|---|
| `libs/element-template-chooser/` | bpmn-js DI module — registers `elementTemplateChooser` service + Preact overlay |

The library is source-only (no build step). The consuming app's Vite build
compiles its TypeScript and TSX files directly via the
`@bpmn-modeler/element-template-chooser` path alias, following the same pattern
as `libs/bpmn-clipboard/` and `libs/bpmn-i18n/`.

## Entry points

- **`ElementTemplateChooserModule`** — registered as an `additionalModule` on
  `BpmnModeler.create()` in `apps/bpmn-webview/src/app/modeler.ts`.
- **`elementTemplateChooser` service** — listens for the
  `elementTemplates.select` event emitted by the properties panel's "Select"
  button. When fired, it queries the `elementTemplates` service for matching
  templates, renders the Preact overlay, and calls
  `elementTemplates.applyTemplate()` on confirm.

## Key files

| File | Purpose |
|---|---|
| `libs/element-template-chooser/src/index.ts` | DI module export and CSS import |
| `libs/element-template-chooser/src/ElementTemplateChooser.ts` | bpmn-js service: event listener, overlay lifecycle |
| `libs/element-template-chooser/src/types.ts` | `ElementTemplate`, `TemplateProperty` interfaces, binding classifier |
| `libs/element-template-chooser/src/components/ChooserOverlay.tsx` | Main overlay component: search, filters, list, keyboard nav |
| `libs/element-template-chooser/src/components/TemplatePreview.tsx` | Detail preview panel with parameter sections |
| `libs/element-template-chooser/src/chooser.css` | All styles (prefixed with `etc-`) |
| `apps/bpmn-webview/src/app/modeler.ts` | Registers the module as `additionalModules` |

## Interaction flow

1. User clicks **+ Select** in the properties panel's Template section.
2. The properties panel fires `elementTemplates.select` with the selected
   element.
3. `ElementTemplateChooser` calls `elementTemplates.getLatest(element)` to list
   only templates whose `appliesTo` includes the element's type — and whose
   `modelerTemplate` id is not already applied.
4. A Preact overlay is rendered via `render()` + `h()` into a dynamically
   created `position: fixed` container appended to the canvas parent. The
   `/** @jsx h */` pragma ensures Vite's esbuild uses Preact's `h()` rather
   than React's `createElement`.
5. User searches, filters by category, selects a template, and confirms.
6. `ElementTemplateChooser` calls `elementTemplates.applyTemplate(element, template)`
   which dispatches the usual command-stack entry — properties panel updates
   automatically.
7. On close (apply, cancel, or Escape), the Preact tree is unmounted and the
   container is removed from the DOM.

## Gotchas

- **Preact JSX pragma is required.** Every `.tsx` file under
  `libs/element-template-chooser/src/components/` must start with
  `/** @jsx h */` — otherwise esbuild falls back to React's `createElement`,
  which isn't available and breaks the build.
- **Dynamic DOM mount.** The overlay container is created fresh on every open
  and removed on close. Don't cache it between sessions — concurrent
  chooser opens (e.g. from rapid clicks) would leak DOM.
- **`elementTemplates.getLatest(element)` is the filtering authority.** If
  you change the set of templates the chooser shows, do it through that service
  — not by post-filtering in the overlay — so the properties panel and the
  chooser agree.
- **The `/vscode/features/element-template-chooser` page still documents
  template authoring** (the "How to Create Good Element Templates" section).
  That content will move to a dedicated guide in a later docs phase; if you
  touch the authoring surface, update both places until it does.

## Related

- [Camunda Element Templates schema](https://github.com/camunda/element-templates-json-schema) — upstream JSON schema
- [`@bpmn-io/element-template-chooser`](https://github.com/bpmn-io/bpmn-js-element-templates) — the upstream component this replaces
- [Architecture overview](../architecture-overview) — bpmn-js DI primer
