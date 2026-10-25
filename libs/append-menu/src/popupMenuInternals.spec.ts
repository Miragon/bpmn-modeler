import { describe, expect, it } from "vitest";

import { getPopupMenuContext } from "./popupMenuInternals";

describe("getPopupMenuContext", () => {
    it.each([
        ["a missing popupMenu", null],
        ["a popupMenu without _getContext", {}],
    ])("fails loudly for %s", (_case, popupMenu) => {
        expect(() => getPopupMenuContext(popupMenu, {}, "bpmn-append")).toThrow(
            /popupMenu internal shape changed/,
        );
    });

    it.each([
        ["no context", undefined],
        ["a context without entries", { entries: null }],
    ])("fails loudly when _getContext returns %s", (_case, context) => {
        const popupMenu = { _getContext: () => context };

        expect(() => getPopupMenuContext(popupMenu, {}, "bpmn-append")).toThrow(
            /_getContext result shape changed/,
        );
    });
});
