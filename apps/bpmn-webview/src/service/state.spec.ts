import { afterEach, describe, expect, it, vi } from "vitest";

import { readSavedMode, WebviewStateManager } from "./state";

/**
 * Builds a `WebviewStateManager` over a stub state store, a stub panel keeper
 * and spies for the surface accessors it drives.
 */
function setup(savedState: unknown, applied = true) {
    const stateStore = { read: vi.fn().mockReturnValue(savedState), merge: vi.fn() };
    const panelUiState = { restoreGroupsAndScroll: vi.fn(), startPersisting: vi.fn() };
    const setViewport = vi.fn().mockReturnValue(applied);
    const getViewport = vi
        .fn()
        .mockReturnValue({ x: 5, y: 10, width: 400, height: 300, scale: 1.2 });
    const setRootElementById = vi.fn().mockReturnValue(true);
    const getRootElementId = vi.fn().mockReturnValue(undefined);
    const onRootChanged = vi.fn();
    const onViewportChanged = vi.fn();
    const onSelectionChanged = vi.fn();
    const getSelectedElementIds = vi.fn().mockReturnValue([]);
    const selectElementsByIds = vi.fn();
    const captureViewState = vi.fn().mockReturnValue({
        rootElementId: undefined,
        viewport: { x: 0, y: 0, width: 1, height: 1 },
        selectedElementIds: [],
    });
    const applyViewState = vi.fn();
    const modeler = {
        viewport: { setViewport, getViewport, onViewportChanged },
        rootElement: { setRootElementById, getRootElementId, onRootChanged },
        selection: { getSelectedElementIds, selectElementsByIds, onSelectionChanged },
        captureViewState,
        applyViewState,
    } as any;
    return {
        manager: new WebviewStateManager(stateStore, modeler, panelUiState),
        panelUiState,
        setViewport,
        setRootElementById,
        getRootElementId,
        getViewport,
        getSelectedElementIds,
        selectElementsByIds,
        captureViewState,
        applyViewState,
        merge: stateStore.merge,
        onRootChanged,
        onViewportChanged,
        onSelectionChanged,
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("WebviewStateManager.restoreViewport", () => {
    it("restores the saved viewbox on a tab-switch rebuild", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setViewport } = setup({ viewport });

        manager.restoreViewport();

        expect(setViewport).toHaveBeenCalledWith(viewport);
    });

    it.each([
        ["no saved state", undefined],
        ["saved state without a viewport", { selectedElementIds: ["a"] }],
    ])("leaves a fresh open with %s to the surface's own fit", (_case, saved) => {
        const { manager, setViewport } = setup(saved);

        manager.restoreViewport();

        expect(setViewport).not.toHaveBeenCalled();
    });

    it("hands a restore on an unsized canvas to the surface to hold", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setViewport } = setup({ viewport }, false);

        manager.restoreViewport();

        expect(setViewport).toHaveBeenCalledExactlyOnceWith(viewport);
    });

    it("restores root element before viewport on a tab-switch rebuild", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const rootElementId = "SubProcess_1_plane";
        const { manager, setRootElementById, setViewport } = setup({
            viewport,
            rootElementId,
        });

        manager.restoreViewport();

        expect(setRootElementById).toHaveBeenCalledWith(rootElementId);
        expect(setViewport).toHaveBeenCalledWith(viewport);

        // Root must be set before the viewbox — viewbox coordinates are
        // plane-relative.
        const rootOrder = setRootElementById.mock.invocationCallOrder[0]!;
        const viewportOrder = setViewport.mock.invocationCallOrder[0]!;
        expect(rootOrder).toBeLessThan(viewportOrder);
    });

    it("skips root restore when no rootElementId is saved", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setRootElementById, setViewport } = setup({ viewport });

        manager.restoreViewport();

        expect(setRootElementById).not.toHaveBeenCalled();
        expect(setViewport).toHaveBeenCalledWith(viewport);
    });

    it("falls back to viewbox-only when the sub-process was removed", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setRootElementById, setViewport } = setup({
            viewport,
            rootElementId: "removed_plane",
        });
        setRootElementById.mockReturnValue(false);

        manager.restoreViewport();

        expect(setRootElementById).toHaveBeenCalledWith("removed_plane");
        expect(setViewport).toHaveBeenCalledWith(viewport);
    });
});

describe("WebviewStateManager.captureViewState / applyViewState", () => {
    // The composition (root → viewport → selection ordering, implicit-root
    // handling) now lives in the package handle and is unit-tested there
    // (`viewState.spec.ts`); the manager only delegates.
    it("delegates capture to the modeler handle", () => {
        const { manager, captureViewState } = setup(undefined);
        const snapshot = {
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 100, y: 200, width: 500, height: 300 },
            selectedElementIds: ["Task_1", "Task_2"],
        };
        captureViewState.mockReturnValue(snapshot);

        expect(manager.captureViewState()).toBe(snapshot);
        expect(captureViewState).toHaveBeenCalledOnce();
    });

    it("delegates apply to the modeler handle", () => {
        const { manager, applyViewState } = setup(undefined);
        const snapshot = {
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 0, y: 0, width: 1000, height: 800 },
            selectedElementIds: ["Task_1"],
        };

        manager.applyViewState(snapshot);

        expect(applyViewState).toHaveBeenCalledWith(snapshot);
    });
});

describe("WebviewStateManager panel UI state", () => {
    it("restores the panel's groups and scroll through the panel keeper", () => {
        const { manager, panelUiState } = setup(undefined);

        manager.restorePanelUiState();

        expect(panelUiState.restoreGroupsAndScroll).toHaveBeenCalledOnce();
    });

    it("starts persisting the panel together with the canvas", () => {
        const { manager, panelUiState } = setup(undefined);

        manager.startPersisting();

        expect(panelUiState.startPersisting).toHaveBeenCalledOnce();
    });
});

describe("WebviewStateManager.flushViewport", () => {
    it("persists the current viewbox and drill-down plane synchronously", () => {
        const { manager, getViewport, getRootElementId, merge } = setup(undefined);
        getRootElementId.mockReturnValue("SubProcess_1_plane");

        manager.flushViewport();

        expect(getViewport).toHaveBeenCalledOnce();
        expect(merge).toHaveBeenCalledWith({
            viewport: { x: 5, y: 10, width: 400, height: 300, scale: 1.2 },
            rootElementId: "SubProcess_1_plane",
        });
    });

    it("persists no plane id at the top-level (implicit) root", () => {
        // getRootElementId already returns undefined for the implicit root, so
        // a top-level flush clears any stale plane rather than saving one.
        const { manager, getRootElementId, merge } = setup(undefined);
        getRootElementId.mockReturnValue(undefined);

        manager.flushViewport();

        expect(merge).toHaveBeenCalledWith({
            viewport: { x: 5, y: 10, width: 400, height: 300, scale: 1.2 },
            rootElementId: undefined,
        });
    });

    it("skips persistence when the viewbox is degenerate", () => {
        const { manager, getViewport, merge } = setup(undefined);
        getViewport.mockReturnValue({ x: NaN, y: NaN, width: NaN, height: NaN });

        manager.flushViewport();

        expect(merge).not.toHaveBeenCalled();
    });
});

describe("readSavedMode", () => {
    it("returns the persisted mode", () => {
        const host = { getState: () => ({ mode: "view" }) } as any;
        expect(readSavedMode(host)).toBe("view");
    });

    it("returns undefined when no mode is saved", () => {
        expect(readSavedMode({ getState: () => ({}) } as any)).toBeUndefined();
    });

    it("returns undefined on a first-ever open", () => {
        expect(readSavedMode({ getState: () => undefined } as any)).toBeUndefined();
    });
});

describe("WebviewStateManager.persistMode", () => {
    it("persists the surface mode", () => {
        const { manager, merge } = setup(undefined);
        manager.persistMode("design");
        expect(merge).toHaveBeenCalledWith({ mode: "design" });
    });
});

describe("WebviewStateManager.restoreSelection", () => {
    it("re-selects the saved elements", () => {
        const { manager, selectElementsByIds } = setup({
            selectedElementIds: ["Task_1", "Task_2"],
        });

        manager.restoreSelection();

        expect(selectElementsByIds).toHaveBeenCalledWith(["Task_1", "Task_2"]);
    });

    it.each([
        ["an empty saved selection", { selectedElementIds: [] }],
        ["no saved state", undefined],
    ])("keeps the selection untouched for %s", (_, saved) => {
        const { manager, selectElementsByIds } = setup(saved);

        manager.restoreSelection();

        expect(selectElementsByIds).not.toHaveBeenCalled();
    });
});

describe("WebviewStateManager.startPersisting", () => {
    it("persists the plane, viewbox, and selection the canvas reports", () => {
        const { manager, merge, onRootChanged, onViewportChanged, onSelectionChanged } =
            setup(undefined);
        const viewport = { x: 1, y: 2, width: 300, height: 200 };

        manager.startPersisting();
        onRootChanged.mock.calls[0][0]("SubProcess_1_plane");
        onViewportChanged.mock.calls[0][0](viewport);
        onSelectionChanged.mock.calls[0][0](["Task_1"]);

        expect(merge.mock.calls).toEqual([
            [{ rootElementId: "SubProcess_1_plane" }],
            [{ viewport }],
            [{ selectedElementIds: ["Task_1"] }],
        ]);
    });
});
