# BPMN modeler kernel

- Status: accepted
- Last reviewed: 2026-11-27

## Context

`@miragon/bpmn-modeler` is moving to one minimal kernel. Every feature, built-in or plugin,
reaches it through one `BpmnFeature` contract (#2802). The kernel sits next to the presets
(`createModeler`, `createDesigner`, `createViewer`). `createModeler` builds on it; the designer
and the viewer keep building their own bpmn-js instance until #2802 S4b and S4c, and the template
preview stays a `createModeler` caller until S4d. Surfaces, modes and the lifecycle contract
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
diagram-js core or its own four names provide. A host reaches a feature through a typed accessor
in the feature's `service/` (`layoutOf`, `elementIdsOf`, `appendMenuOf`, `elementTemplatesOf`,
`transactionBoundariesOf`, `alignToOriginOf`), which returns `undefined` when the surface lacks the
feature, so a host never holds the didi injector. An accessor over a library wraps helpers there,
which keep the lookup, the presence check and the logic usable without this package; an accessor
over a feature folder takes its DI names from that folder's `domain/`, which its module uses too.
Either way each DI name is written once. The cost is one more file per feature, and each preset
keeps its own answer for a missing feature. The modeler preset calls the code-link status push and the
inline-script writes as helpers in `libs/code-link` and `libs/inline-scripting`, as the facade
glue they replace; neither has an accessor yet. Only `editableSurface.ts`'s `bpmnLintConfig`
lookup is left (#2802 S5).

Two features meet on shared vocabulary in `kernel/domain/`, which is not a kernel DI name: the
engine feature provides the optional `popupMenuAnnotationOverrides` value and the popup-menu
annotations read it.

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

### Feature factories

Each feature folder offers a factory in `adapter/in/` that returns a `BpmnFeature` with what the
presets register today, so putting a preset on the kernel changes no DI winner, config or moddle.
The engine features, the engine's template modules and the transaction boundaries load through a
dynamic import, so a page parses only the engine it opens; the cost is an async factory.
`requires` names only what proves the dependency: `elementTemplates` requires `propertiesPanel`
and `bpmnPropertiesProvider`, because the forked panel provides the first too, and on C7 the
template provider module depends on the engine's provider, so requiring that one would prove
nothing.

### The modeler preset

`createModeler` is a preset in `composition/`: it awaits `modelerFeatures` (the feature list,
in `composition/presets/`), calls `createSurface({ base: Modeler, features, mode, extraRoots:
[panel parent], … })` and wraps the surface in the `@internal` `BpmnModeler`
(`composition/presets/bpmnModeler.ts`). Every `BpmnModeler` method delegates to the surface or an
accessor; the settings fan-out stays in the facade, because the kernel keeps no settings bag.
Options become features, and `additionalModules`/`moddleExtensions` one `caller` feature at the
end. Plugins still arrive as those two options until #2802 S8. Choices and their costs:

- **Host callbacks through accessors, not factory options.** The design gave the factories their
  host contract (`elementTemplates(engine, { onErrors })`, `elementIds({ settings })`). An option
  that registers a value adds a module line, so the facade wires `onErrors` and the ID settings
  through the accessors after construction instead, and the module list stays as before. The cost
  is a facade step between construction and the first diagram.
- **The preset awaits the features itself**, so a failed engine chunk rejects with its own error
  rather than the kernel's "feature #n failed to load". No handle exists yet, so no destroy guard
  is lost; the cost is that this preset skips the kernel's wrapping.
- **One moddle prefix under two keys still fails.** The kernel merges moddle by prefix and would
  keep the later package; moddle itself rejects the pair, and a plugin build relies on that throw
  to fall back without its plugins. `moddlePrefixUnderTwoKeys` (in the merge's domain) keeps the
  rejection until plugins are features (#2802 S8). A caller that lists another prefix under the
  engine's key keeps both packages, where bpmn-js kept only the caller's.
- **The caller feature is a built-in**, so it meets the built-in rules: providing `surfaceRoots` or
  `surfaceMode` fails the build instead of overriding silently, and a `diagramTemplate` it provides
  changes what `newDiagram` opens.
- **The kernel moves `data-bpmn-mode`** after construction, so a caller's listener on
  `surface.mode.changed` at the default priority now runs before the attribute moves; the panel
  filter, lint and the host callback keep their order.

### Defaults and failure

Composition hands every surface focus/Escape and the fit button, right after the kernel's modules.
These two and the clipboard text polyfill install on `diagram.init`, after every other listener,
and leave on `diagram.destroy`. The kernel also fires `diagram.destroy` when a constructor throws
after its modules initialised (in bpmn-js's `attach` event), so no listener or `execCommand` patch
survives. It handles the errors that listeners of a half-built instance throw then, so every
listener runs and the console shows only the construction error. Until the designer and the
viewer run on the kernel (#2802 S4b, S4c), their facades take these modules from composition.

## Consequences and enforcement

Narrowing on member presence (`"setMode" in handle`) is weaker than a discriminant field, and the
guards rely on the handle holding only its kind's members.

The [architecture spec](../../packages/bpmn-modeler/src/architecture.spec.ts) checks that
`kernel/` imports nothing outside itself but `@miragon/bpmn-modeler-types`,
`@miragon/bpmn-modeler-browser` and npm, with no exception left. Until #2802 S4b and S4c, the
`presetWiring.ts` port names the clipboard feature's modules for the designer and viewer facades;
its imports pass the check. The same spec reads every DI
name the kernel spells out, in a lookup or an `$inject` list. It allows the names the bpmn-js base
module trees, the diagram-js core and the kernel provide, and lists the `bpmnLintConfig` lookup as
the one known exception, until #2802 S5. A name the kernel builds at runtime instead of writing as a
literal escapes the check.

The [viewer-surface check](../../packages/bpmn-modeler/scripts/check-viewer-surface-bundle.mjs)
builds a viewer-only client and reads its module ids. It allows no `Modeler`, no prebuilt
`bpmn-modeler` bundle, no `diagram-js` feature library, and no package file outside `kernel/`,
`createSurface` and the kernel defaults. The
[feature merge spec](../../packages/bpmn-modeler/src/kernel/domain/featureMerge.spec.ts) pins the
merge order and the failure rules. A type spec in `kernelSurface.spec.ts` pins the
`"setMode" in handle` narrowing. The
[preset module pins](../../packages/bpmn-modeler/src/composition/presetModulePins.browser.spec.ts)
hold the order the modeler's feature list flattens to, and the
[builds-alone](../../packages/bpmn-modeler/src/composition/presets/featuresBuildAlone.browser.spec.ts)
spec builds each factory on the kernel by itself.
