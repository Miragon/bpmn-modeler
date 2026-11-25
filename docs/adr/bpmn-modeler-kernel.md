# BPMN modeler kernel

- Status: accepted
- Last reviewed: 2026-11-25

## Context

`@miragon/bpmn-modeler` is moving to one minimal kernel. Every feature, built-in or plugin,
reaches it through one `BpmnFeature` contract (#2802). The kernel sits next to the presets
(`createModeler`, `createDesigner`, `createViewer`). The presets keep building their own
bpmn-js instance until #2802 S4 moves them onto it. Surfaces, modes and the lifecycle contract
are in [BPMN modeler](bpmn-modeler.md). The folder rules are in
[Role folders](role-folders.md#modeler-package-layout).

## Decision

### One kernel

One kernel, not one per surface: `createSurface(container, { base, features, plugins?, mode?,
extraRoots?, … })` over the two-phase `KernelSurface`. It is internal and `@experimental` until
`/kernel` ships. #2217's three kernels and its per-surface kernel rule are retired; the round-trip
guarantee moves to the presets and the engine features. `base` is `Modeler` or `NavigatedViewer`,
as a value or a lazy import, so a viewer-only client bundles no `Modeler`. A handle holds only its
kind's members, so `"newDiagram" in handle` agrees with the types. Editing surfaces with and
without a `mode` (and `setMode`) share `base: "modeler"`, so mode guards narrow on
`"setMode" in handle`, not on `base`.

### Kernel DI names

**Four kernel DI names** are all a feature gets from the package: `surfaceMode` with
`surface.mode.changed` (only on a modeler base given a `mode`, so `createDesigner` keeps none),
`surfaceRoots` (the container, then `extraRoots`, known before construction so every `__init__`
sees it), and the `debounceInput` and optional `diagramTemplate` slots (`newDiagram` asks the
latter before `createDiagram`). Only the kernel provides the first two. It owns `data-bpmn-theme`
and, with a mode, `data-bpmn-mode` on the roots. Besides the names, a feature imports only the
kernel's port and domain types. A helper that features and the kernel share, such as
`installForDiagramLifetime`, lives in `@miragon/bpmn-modeler-browser`, so publishing a feature
does not make kernel internals part of the export map.

The kernel names no feature's DI service either. It looks up only what a bpmn-js base, the
diagram-js core or its own four names provide. Until a feature's accessor takes over,
`editableSurface.ts` still looks up `bpmnLayouter`, `bpmnCleanup`, `elementIds` and
`appendMenuOverride` (#2802 S4) and `bpmnLintConfig` (#2802 S5).

### The two-list merge

The merge is pure and lives in `kernel/domain/`. `features` merge in list order, then `plugins`,
so a plugin's provider wins and never the reverse. Config merges plain objects key by key, and any
other value replaces the earlier one. `undefined` leaves the earlier value, so no later feature or
plugin unsets a key. Moddle packages merge by prefix. Async features are awaited first. A built-in
fails the surface, named by id or position, when it rejects, is malformed, misses a `requires`
name, or claims a kernel name or config key. A plugin that does any of these, or replaces a
built-in's moddle prefix, is dropped and reported through `onWarning`. `requires` reads only what
features and the kernel provide, so base services (`copyPaste`) are not listed. A plugin module
that throws in construction still fails the surface.

### Defaults and failure

Composition hands every surface focus/Escape and the fit button, right after the kernel's modules.
These two and the clipboard text polyfill install on `diagram.init`, after every other listener,
and leave on `diagram.destroy`. The kernel also fires `diagram.destroy` when a constructor throws
after its modules initialised (in `attach`), so no listener or `execCommand` patch survives. Until
the presets run on the kernel (#2802 S4), the facades take these modules from composition and keep
`ModeAttribute`.

## Consequences and enforcement

A `diagram.destroy` listener that throws on a half-built instance skips the ones after it.
Narrowing on member presence (`"setMode" in handle`) is weaker than a discriminant field, and the
guards rely on the handle holding only its kind's members.

The [architecture spec](../../packages/bpmn-modeler/src/architecture.spec.ts) checks that
`kernel/` imports nothing outside itself but `@miragon/bpmn-modeler-types`,
`@miragon/bpmn-modeler-browser` and npm. Two exceptions remain until #2802 S4:
`editableSurface.ts` imports the layout and element-ID libraries. The same spec reads every DI
name the kernel spells out, in a lookup or an `$inject` list. It allows the names the bpmn-js base
module trees, the diagram-js core and the kernel provide, and lists the five lookups above as
known exceptions with their step. A name the kernel builds at runtime instead of writing as a
literal escapes the check.

The [viewer-surface check](../../packages/bpmn-modeler/scripts/check-viewer-surface-bundle.mjs)
builds a viewer-only client and reads its module ids. It allows no `Modeler`, no prebuilt
`bpmn-modeler` bundle, no `diagram-js` feature library, and no package file outside `kernel/`,
`createSurface` and the kernel defaults. The
[feature merge spec](../../packages/bpmn-modeler/src/kernel/domain/featureMerge.spec.ts) pins the
merge order and the failure rules. A type spec in `kernelSurface.spec.ts` pins the
`"setMode" in handle` narrowing.
