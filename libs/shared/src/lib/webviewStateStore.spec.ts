import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HostApiImpl } from "./host";
import { createWebviewStateStore } from "./webviewStateStore";

interface TestState {
    mode?: string;
    panelScroll?: number;
}

describe("createWebviewStateStore over the production host API", () => {
    let persisted: TestState | undefined;

    beforeEach(() => {
        persisted = undefined;
        vi.stubGlobal("acquireVsCodeApi", () => ({
            getState: () => persisted,
            setState: (state: TestState) => {
                persisted = state;
            },
            postMessage: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reads nothing on a first-ever open", () => {
        const store = createWebviewStateStore(new HostApiImpl<TestState, never>());

        expect(store.read()).toBeUndefined();
    });

    it("reads the persisted state", () => {
        persisted = { mode: "view" };
        const store = createWebviewStateStore(new HostApiImpl<TestState, never>());

        expect(store.read()).toEqual({ mode: "view" });
    });

    it("seeds the state with the first merge", () => {
        const store = createWebviewStateStore(new HostApiImpl<TestState, never>());

        store.merge({ panelScroll: 120 });

        expect(persisted).toEqual({ panelScroll: 120 });
    });

    it("keeps the other persisted fields when merging", () => {
        persisted = { mode: "view", panelScroll: 10 };
        const store = createWebviewStateStore(new HostApiImpl<TestState, never>());

        store.merge({ panelScroll: 120 });

        expect(persisted).toEqual({ mode: "view", panelScroll: 120 });
    });
});
