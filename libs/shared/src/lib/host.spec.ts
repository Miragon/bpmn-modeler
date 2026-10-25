import { afterEach, describe, expect, it, vi } from "vitest";

import { HostApiImpl, MockHostApi } from "./host";

type ViewState = { mode?: string; zoom?: number };

function createHostBridge(initialState?: ViewState) {
    let persisted = initialState;
    const bridge = {
        getState: vi.fn(() => persisted),
        setState: vi.fn((state: ViewState) => {
            persisted = state;
            return state;
        }),
        postMessage: vi.fn(),
    };
    vi.stubGlobal("acquireVsCodeApi", () => bridge);
    return bridge;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("HostApiImpl", () => {
    it("reads nothing when the host has no persisted state yet", () => {
        createHostBridge(undefined);

        expect(new HostApiImpl<ViewState, unknown>().getState()).toBeUndefined();
    });

    it("returns the state the host persisted", () => {
        createHostBridge({ mode: "design" });

        expect(new HostApiImpl<ViewState, unknown>().getState()).toEqual({ mode: "design" });
    });

    it("persists a copy so later caller mutations do not leak into host state", () => {
        const bridge = createHostBridge();
        const state: ViewState = { mode: "design" };

        new HostApiImpl<ViewState, unknown>().setState(state);
        state.mode = "implement";

        expect(bridge.setState).toHaveBeenCalledWith({ mode: "design" });
    });

    it("merges a partial update over the persisted state", () => {
        const bridge = createHostBridge({ mode: "design", zoom: 1 });

        new HostApiImpl<ViewState, unknown>().updateState({ zoom: 2 });

        expect(bridge.setState).toHaveBeenCalledWith({ mode: "design", zoom: 2 });
    });

    it("seeds the state with the first partial update", () => {
        const bridge = createHostBridge(undefined);
        const host = new HostApiImpl<ViewState, unknown>();

        host.updateState({ zoom: 2 });
        host.updateState({ mode: "design" });

        expect(bridge.setState).toHaveBeenNthCalledWith(1, { zoom: 2 });
        expect(host.getState()).toEqual({ zoom: 2, mode: "design" });
    });

    it("forwards messages to the host unchanged", () => {
        const bridge = createHostBridge();
        const message = { type: "GetBpmnFileCommand" };

        new HostApiImpl<ViewState, typeof message>().postMessage(message);

        expect(bridge.postMessage).toHaveBeenCalledWith(message);
    });
});

class TestMockHost extends MockHostApi<ViewState, unknown> {
    readonly postMessage = vi.fn();
}

describe("MockHostApi", () => {
    it("reads nothing before any state is written", () => {
        expect(new TestMockHost().getState()).toBeUndefined();
    });

    it("seeds the state with the first partial update", () => {
        const host = new TestMockHost();

        host.updateState({ zoom: 2 });

        expect(host.getState()).toEqual({ zoom: 2 });
    });

    it("merges a partial update over the saved state", () => {
        const host = new TestMockHost();
        host.setState({ mode: "design", zoom: 1 });

        host.updateState({ zoom: 2 });

        expect(host.getState()).toEqual({ mode: "design", zoom: 2 });
    });

    it("replaces the whole state on setState", () => {
        const host = new TestMockHost();
        host.setState({ mode: "design", zoom: 1 });

        host.setState({ zoom: 3 });

        expect(host.getState()).toEqual({ zoom: 3 });
    });
});
