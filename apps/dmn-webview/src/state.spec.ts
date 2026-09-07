import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Command, MockHostApi, Query } from "@miragon/bpmn-modeler-shared";

import { readSavedPanelVisibility, WebviewStateManager } from "./state";
import type { WebviewState } from "./webviewState";

type MessageType = Command | Query;

/**
 * In-memory host mirroring the production `MockHost.updateState` merge, so the
 * manager exercises the real persist path (`updateState` → `setState` fallback).
 */
class TestHost extends MockHostApi<WebviewState, MessageType> {
    override updateState(state: Partial<WebviewState>): void {
        try {
            this.setState({ ...this.getState(), ...state });
        } catch {
            this.setState(state as WebviewState);
        }
    }

    override postMessage(): void {
        // No host to forward to in unit tests.
    }
}

describe("readSavedPanelVisibility", () => {
    it("returns the saved visibility (true)", () => {
        const host = new TestHost();
        host.setState({ panelVisible: true });
        expect(readSavedPanelVisibility(host)).toBe(true);
    });

    it("returns the saved visibility (false)", () => {
        const host = new TestHost();
        host.setState({ panelVisible: false });
        expect(readSavedPanelVisibility(host)).toBe(false);
    });

    it("returns undefined when no entry is saved", () => {
        const host = new TestHost();
        host.setState({});
        expect(readSavedPanelVisibility(host)).toBeUndefined();
    });

    it("returns undefined when getState throws", () => {
        const host = new TestHost();
        expect(readSavedPanelVisibility(host)).toBeUndefined();
    });
});

describe("WebviewStateManager.restorePanelVisibility", () => {
    function panelHandle() {
        const setVisible = vi.fn();
        return { handle: { setVisible } as never, setVisible };
    }

    it("applies the saved entry over the fallback", () => {
        const host = new TestHost();
        host.setState({ panelVisible: false });
        const manager = new WebviewStateManager(host, document.createElement("div"));
        const { handle, setVisible } = panelHandle();

        manager.restorePanelVisibility(handle, true);

        expect(setVisible).toHaveBeenCalledWith(false);
    });

    it("falls back to the host default when no entry is saved", () => {
        const host = new TestHost();
        const manager = new WebviewStateManager(host, document.createElement("div"));
        const { handle, setVisible } = panelHandle();

        manager.restorePanelVisibility(handle, true);

        expect(setVisible).toHaveBeenCalledWith(true);
    });
});

describe("WebviewStateManager.persistPanelVisibility", () => {
    it("merges the visibility into existing state", () => {
        const host = new TestHost();
        host.setState({ panelScroll: 42 });
        const manager = new WebviewStateManager(host, document.createElement("div"));

        manager.persistPanelVisibility(true);

        expect(host.getState()).toEqual({ panelScroll: 42, panelVisible: true });
    });

    it("writes a first entry when no state exists yet", () => {
        const host = new TestHost();
        const setState = vi.spyOn(host, "setState");
        const manager = new WebviewStateManager(host, document.createElement("div"));

        manager.persistPanelVisibility(false);

        expect(setState).toHaveBeenCalledWith({ panelVisible: false });
        expect(host.getState()).toEqual({ panelVisible: false });
    });
});

describe("WebviewStateManager.restorePanelUiState", () => {
    let rafQueue: FrameRequestCallback[] = [];

    beforeEach(() => {
        rafQueue = [];
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    function flushFrame(): void {
        const callbacks = rafQueue;
        rafQueue = [];
        callbacks.forEach((cb) => cb(0));
    }

    /** A scroll container with `count` collapsed groups whose headers toggle `open`. */
    function panelWithGroups(count: number) {
        const panelRoot = document.createElement("div");
        const container = document.createElement("div");
        container.className = "bio-properties-panel-scroll-container";
        let scrollTop = 0;
        Object.defineProperty(container, "scrollTop", {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
                scrollTop = value;
            },
        });
        const headers: HTMLElement[] = [];
        for (let index = 0; index < count; index++) {
            const group = document.createElement("div");
            group.className = "bio-properties-panel-group";
            const header = document.createElement("div");
            header.className = "bio-properties-panel-group-header";
            header.addEventListener("click", () => header.classList.toggle("open"));
            group.appendChild(header);
            container.appendChild(group);
            headers.push(header);
        }
        panelRoot.appendChild(container);
        document.body.appendChild(panelRoot);
        return { panelRoot, container, headers };
    }

    it("toggles the saved groups open and applies scroll on the second frame", () => {
        const host = new TestHost();
        host.setState({ expandedGroupIndexes: [1], panelScroll: 200 });
        const { panelRoot, container, headers } = panelWithGroups(3);
        const manager = new WebviewStateManager(host, panelRoot);

        manager.restorePanelUiState();

        flushFrame(); // toggles group headers, schedules the scroll frame
        expect(headers[1].classList.contains("open")).toBe(true);
        expect(headers[0].classList.contains("open")).toBe(false);
        expect(container.scrollTop).toBe(0);

        flushFrame(); // applies scroll once Preact has flushed re-renders
        expect(container.scrollTop).toBe(200);
    });

    it("does nothing when no panel UI state is saved", () => {
        const host = new TestHost();
        host.setState({ panelVisible: true });
        const { panelRoot } = panelWithGroups(2);
        const manager = new WebviewStateManager(host, panelRoot);

        manager.restorePanelUiState();

        expect(rafQueue).toHaveLength(0);
    });
});

describe("WebviewStateManager panel scoping", () => {
    /** A panel host with a scroll container, plus a decoy panel elsewhere. */
    function panels() {
        const panelRoot = document.createElement("div");
        const scroll = document.createElement("div");
        scroll.className = "bio-properties-panel-scroll-container";
        panelRoot.appendChild(scroll);
        document.body.appendChild(panelRoot);

        const otherPanel = document.createElement("div");
        const otherScroll = document.createElement("div");
        otherScroll.className = "bio-properties-panel-scroll-container";
        otherPanel.appendChild(otherScroll);
        document.body.appendChild(otherPanel);

        return { panelRoot, scroll, otherScroll };
    }

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("persists scroll only for the container within the passed panelRoot", () => {
        vi.useFakeTimers();
        const { panelRoot, scroll, otherScroll } = panels();
        const host = new TestHost();
        const updateState = vi.spyOn(host, "updateState");
        const manager = new WebviewStateManager(host, panelRoot);

        manager.startPersisting();

        Object.defineProperty(scroll, "scrollTop", { value: 42, configurable: true });
        scroll.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(100);
        expect(updateState).toHaveBeenCalledWith({ panelScroll: 42 });

        // A scroll in a foreign panel must not be persisted as ours.
        updateState.mockClear();
        Object.defineProperty(otherScroll, "scrollTop", { value: 99, configurable: true });
        otherScroll.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(100);
        expect(updateState).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    it("persists expanded group indexes when a group toggles open", async () => {
        const { panelRoot, scroll } = panels();
        const group = document.createElement("div");
        group.className = "bio-properties-panel-group";
        const header = document.createElement("div");
        header.className = "bio-properties-panel-group-header";
        group.appendChild(header);
        scroll.appendChild(group);

        const host = new TestHost();
        const updateState = vi.spyOn(host, "updateState");
        const manager = new WebviewStateManager(host, panelRoot);

        manager.startPersisting();

        header.classList.add("open");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(updateState).toHaveBeenCalledWith({ expandedGroupIndexes: [0] });
    });
});
