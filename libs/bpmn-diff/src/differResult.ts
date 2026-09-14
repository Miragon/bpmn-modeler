// See computeDiff.ts for why the ambient shim is pulled in explicitly rather
// than via tsconfig `include`.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-js-differ.d.ts" />

/**
 * Typed adapter around `bpmn-js-differ`, whose result exposes its four change
 * categories only under private `_`-prefixed keys (`_added`, `_removed`,
 * `_changed`, `_layoutChanged`). Confining that reach here — with a runtime
 * shape assertion and a pinned upstream-shape test — turns a silent breakage on
 * a dependency bump into a loud, located failure. Callers speak the public
 * category names below and never touch the underscore keys.
 */
import { diff, type DiffResult } from "bpmn-js-differ";

/** Public change categories, mapped to bpmn-js-differ's private result keys. */
export type DiffCategory = "added" | "removed" | "changed" | "layoutChanged";

const CATEGORY_KEYS: Readonly<Record<DiffCategory, keyof DiffResult>> = {
    added: "_added",
    removed: "_removed",
    changed: "_changed",
    layoutChanged: "_layoutChanged",
};

export function assertDiffResultShape(result: unknown): asserts result is DiffResult {
    const candidate = result as Partial<Record<keyof DiffResult, unknown>> | null;
    const isPlainObject = (value: unknown): boolean =>
        typeof value === "object" && value !== null && !Array.isArray(value);
    const shapeOk =
        isPlainObject(candidate) &&
        isPlainObject(candidate?._added) &&
        isPlainObject(candidate?._removed) &&
        isPlainObject(candidate?._changed) &&
        isPlainObject(candidate?._layoutChanged);
    if (!shapeOk) {
        throw new Error(
            "bpmn-js-differ 3.2.0 result shape changed: expected `_added`, " +
                "`_removed`, `_changed`, and `_layoutChanged` to be objects. Update " +
                "differResult.ts and its shape test.",
        );
    }
}

export function runDiff(before: unknown, after: unknown): DiffResult {
    const result = diff(before as Parameters<typeof diff>[0], after as Parameters<typeof diff>[1]);
    assertDiffResultShape(result);
    return result;
}

export function categoryIds(results: readonly DiffResult[], category: DiffCategory): Set<string> {
    const key = CATEGORY_KEYS[category];
    return new Set(results.flatMap((result) => Object.keys(result[key])));
}
