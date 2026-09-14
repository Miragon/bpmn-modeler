/**
 * Typed adapter around a diagram-js `popupMenu` internal: entries are collected
 * through the private `_getContext(target, providerId)` method, which has no
 * public counterpart. Confining that reach here — with a runtime shape assertion
 * and a pinned upstream-shape test — turns a silent breakage on a dependency
 * bump into a loud, located failure.
 */
import type { PopupMenuEntry } from "./types";

export interface PopupMenuContext {
    entries: Record<string, PopupMenuEntry>;
    headerEntries: Record<string, PopupMenuEntry>;
    empty: boolean;
}

/** Collects the entries every registered provider contributes for `providerId`. */
export function getPopupMenuContext(
    popupMenu: unknown,
    target: unknown,
    providerId: string,
): PopupMenuContext {
    const getContext = (popupMenu as { _getContext?: unknown } | null)?._getContext;
    if (typeof getContext !== "function") {
        throw new Error(
            "diagram-js popupMenu internal shape changed: expected " +
                "`popupMenu._getContext` to be a function. Update " +
                "popupMenuInternals.ts and its shape test.",
        );
    }
    const context = getContext.call(popupMenu, target, providerId) as PopupMenuContext | undefined;
    if (!context || typeof context.entries !== "object" || context.entries === null) {
        throw new Error(
            "diagram-js popupMenu._getContext result shape changed: expected an " +
                "object carrying `entries`. Update popupMenuInternals.ts and its " +
                "shape test.",
        );
    }
    return context;
}
