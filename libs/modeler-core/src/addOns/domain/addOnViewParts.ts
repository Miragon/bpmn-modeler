import type { AddOnView } from "./addOnCatalogModel";
import { ADD_ON_KINDS } from "./addOnIds";

export function byKindThenName(a: AddOnView, b: AddOnView): number {
    return (
        ADD_ON_KINDS.indexOf(a.kind) - ADD_ON_KINDS.indexOf(b.kind) ||
        compare(a.name, b.name) ||
        compare(a.id, b.id)
    );
}

export function optional<K extends string, V>(
    key: K,
    value: V | undefined,
): { readonly [P in K]?: V } {
    return (value === undefined ? {} : { [key]: value }) as { readonly [P in K]?: V };
}

/** By UTF-16 code unit, as `sort()` does, so every host orders alike. */
export function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
