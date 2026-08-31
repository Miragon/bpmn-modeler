// Bundler (webpack + ts-loader) and consumer tsc programs (modeler-types,
// modeler-core, the package) do not pick up this lib's ambient shims from
// tsconfig `include` — only its own standalone build does — so both are pulled
// in explicitly via triple-slash references, which every program honours.
//
// The `bpmn-moddle` shim is intentionally *empty* (`declare module …{}`): the
// moddle import below is fully cast, so it needs the module resolvable but never
// its member types, and an empty declaration merges without conflict alongside a
// consumer's own richer moddle shim.  See `./types/bpmn-moddle.d.ts`.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-js-differ.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-moddle.d.ts" />

import { diff } from "bpmn-js-differ";

import { buildFlowOrder, buildRemovedAnchors, sortIdsByOrder } from "./bpmnFlowOrder";
import { DiffCounts, DiffResult } from "./diffResult";

/**
 * Compares two BPMN XML documents and returns a serializable {@link DiffResult}.
 *
 * Node- and browser-safe: it touches no DOM.  The heavy `bpmn-moddle` parser
 * loads through dynamic `import()` (kept out of any bundle that never diffs);
 * `bpmn-js-differ` is a small static import — dynamic-importing it too tripped
 * api-extractor's declaration roll-up, and it still lands only in the `./diff`
 * chunk, which production consumers reach lazily.
 *
 * Throws on parse or diff failure — callers that need a soft failure path
 * (e.g. the extension host) wrap this in their own try/catch.
 */
export async function computeDiff(beforeXml: string, afterXml: string): Promise<DiffResult> {
    // `bpmn-moddle` has no `default` export — its ESM dist only re-exports the
    // factory as `BpmnModdle`.  Webpack's ESM→CJS interop does not synthesize
    // `.default`, while Vite's dep optimizer exposes the named `BpmnModdle`, so
    // we accept both shapes for forward-compat across bundlers.  It is a factory
    // function, called without `new`.
    const moddleMod = (await import("bpmn-moddle")) as unknown as {
        default?: () => {
            fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
        };
        BpmnModdle?: () => {
            fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
        };
    };
    const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
    if (typeof createBpmnModdle !== "function") {
        throw new Error("bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.");
    }
    const moddle = createBpmnModdle();
    const beforeDefs = (await moddle.fromXML(beforeXml)).rootElement;
    const afterDefs = (await moddle.fromXML(afterXml)).rootElement;

    const result = diff(
        beforeDefs as Parameters<typeof diff>[0],
        afterDefs as Parameters<typeof diff>[1],
    );

    const added = Object.keys(result._added);
    const removed = Object.keys(result._removed);
    const changed = Object.keys(result._changed);
    const layoutChanged = Object.keys(result._layoutChanged);
    const counts: DiffCounts = {
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        layoutChanged: layoutChanged.length,
    };

    // Order all id arrays by sequence-flow position so a stepper walks from
    // start event to end event instead of in the differ's arbitrary insertion
    // order.  Removed elements live only on the before canvas; anchor each one
    // next to a surviving neighbour in the after order so it appears near where
    // it sits in the flow.
    const afterOrder = buildFlowOrder(afterDefs as never);
    const removedAnchors = buildRemovedAnchors(removed, beforeDefs as never, afterOrder);
    const sortedAdded = sortIdsByOrder(added, afterOrder);
    const sortedRemoved = sortIdsByOrder(removed, removedAnchors);
    const sortedChanged = sortIdsByOrder(changed, afterOrder);
    const sortedLayoutChanged = sortIdsByOrder(layoutChanged, afterOrder);

    // Merged navigation order: dedup across categories, then sort once more so
    // removed elements interleave with added/changed at their anchored
    // positions instead of sitting in their own block.
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...sortedAdded, ...sortedRemoved, ...sortedChanged, ...sortedLayoutChanged]) {
        if (!seen.has(id)) {
            seen.add(id);
            merged.push(id);
        }
    }
    const navigationOrder = sortIdsByOrder(merged, afterOrder, removedAnchors);

    return {
        added: sortedAdded,
        removed: sortedRemoved,
        changed: sortedChanged,
        layoutChanged: sortedLayoutChanged,
        counts,
        navigationOrder,
    };
}
