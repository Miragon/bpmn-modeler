import { afterEach, describe, expect, it, vi } from "vitest";

import { localPanelState } from "./localPanelState";

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("localPanelState", () => {
    it("keeps the panel's state across editors of the same kind", () => {
        localPanelState("panel").merge({ panelWidth: 320 });
        localPanelState("panel").merge({ panelVisible: false });
        expect(localPanelState("panel").read()).toEqual({ panelWidth: 320, panelVisible: false });
    });

    it("keeps the state in memory where the frame has no storage", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });
        const store = localPanelState("panel");
        expect(store.read()).toBeUndefined();
        store.merge({ panelWidth: 320 });
        expect(store.read()).toEqual({ panelWidth: 320 });
    });
});
