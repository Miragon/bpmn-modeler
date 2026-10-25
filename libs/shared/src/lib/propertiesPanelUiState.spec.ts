// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HostApiImpl } from "./host";
import {
    groupIndexesToToggle,
    hasGroupsOrScrollToRestore,
    openGroupIndexes,
    PropertiesPanelUiStateAdapter,
    readSavedPanelVisibility,
    type PropertiesPanelUiState,
} from "./propertiesPanelUiState";
import type { PropertiesPanelHandle } from "./propertiesPanelResizer";

function memoryStore(initial?: PropertiesPanelUiState) {
    let state = initial;
    return {
        read: () => state,
        merge: vi.fn((partial: Partial<PropertiesPanelUiState>) => {
            state = { ...state, ...partial };
        }),
    };
}

function panelHandle() {
    const setVisible = vi.fn();
    const handle: PropertiesPanelHandle = {
        isVisible: () => true,
        setVisible,
        onVisibilityChanged: () => undefined,
        dispose: () => undefined,
    };
    return { handle, setVisible };
}

/** A panel whose group headers toggle `open` on click, like the real properties panel. */
function renderPanel({ groups = 0, openGroups = [] as number[] } = {}) {
    const panelRoot = document.createElement("div");
    const container = document.createElement("div");
    container.className = "bio-properties-panel-scroll-container";
    const headers: HTMLElement[] = [];
    for (let index = 0; index < groups; index++) {
        const group = document.createElement("div");
        group.className = "bio-properties-panel-group";
        const header = document.createElement("div");
        header.className = "bio-properties-panel-group-header";
        header.classList.toggle("open", openGroups.includes(index));
        header.addEventListener("click", () => header.classList.toggle("open"));
        group.append(header, document.createElement("input"));
        container.appendChild(group);
        headers.push(header);
    }
    panelRoot.appendChild(container);
    document.body.appendChild(panelRoot);
    return { panelRoot, container, headers };
}

function setScrollTop(element: HTMLElement, value: number): void {
    Object.defineProperty(element, "scrollTop", { value, configurable: true, writable: true });
}

const isOpen = (header: HTMLElement) => header.classList.contains("open");

describe("properties-panel UI state rules", () => {
    it("toggles every group whose expansion differs from the saved one", () => {
        expect(groupIndexesToToggle([true, false, false, true], [1, 3])).toEqual([0, 1]);
    });

    it("keeps the panel's default expansion without a saved list", () => {
        expect(groupIndexesToToggle([true, false], undefined)).toEqual([]);
    });

    it("collapses every open group for an empty saved list", () => {
        expect(groupIndexesToToggle([true, false, true], [])).toEqual([0, 2]);
    });

    it("lists the open groups by position", () => {
        expect(openGroupIndexes([false, true, true])).toEqual([1, 2]);
    });

    it.each<[PropertiesPanelUiState | undefined, boolean]>([
        [undefined, false],
        [{ panelVisible: true }, false],
        [{ expandedGroupIndexes: [] }, true],
        [{ expandedGroupIndexes: [0] }, true],
        [{ panelScroll: 0 }, true],
    ])("restores groups or scroll for %j: %s", (saved, expected) => {
        expect(hasGroupsOrScrollToRestore(saved)).toBe(expected);
    });
});

describe("readSavedPanelVisibility", () => {
    let persisted: PropertiesPanelUiState | undefined;

    beforeEach(() => {
        persisted = undefined;
        vi.stubGlobal("acquireVsCodeApi", () => ({
            getState: () => persisted,
            setState: vi.fn(),
            postMessage: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const read = () => readSavedPanelVisibility(new HostApiImpl<PropertiesPanelUiState, never>());

    it("keeps a saved hidden panel hidden", () => {
        persisted = { panelVisible: false };
        expect(read()).toBe(false);
    });

    it("has no opinion without a saved entry", () => {
        persisted = { panelScroll: 10 };
        expect(read()).toBeUndefined();
    });

    it("has no opinion on a first-ever open", () => {
        expect(read()).toBeUndefined();
    });
});

describe("PropertiesPanelUiStateAdapter", () => {
    let frames: Array<() => void>;
    const scheduleFrame = (callback: () => void) => {
        frames.push(callback);
    };
    const runNextFrame = () => frames.splice(0).forEach((callback) => callback());

    beforeEach(() => {
        frames = [];
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    describe("visibility", () => {
        it("lets the editor's saved visibility win over the host default", () => {
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ panelVisible: false }),
                renderPanel().panelRoot,
            );
            const { handle, setVisible } = panelHandle();

            adapter.restorePanelVisibility(handle, true);

            expect(setVisible).toHaveBeenCalledWith(false);
        });

        it("falls back to the host default when the editor saved none", () => {
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore(),
                renderPanel().panelRoot,
            );
            const { handle, setVisible } = panelHandle();

            adapter.restorePanelVisibility(handle, true);

            expect(setVisible).toHaveBeenCalledWith(true);
        });

        it("persists a toggle next to the other saved fields", () => {
            const store = memoryStore({ panelScroll: 42 });
            const adapter = new PropertiesPanelUiStateAdapter(store, renderPanel().panelRoot);

            adapter.persistPanelVisibility(false);

            expect(store.read()).toEqual({ panelScroll: 42, panelVisible: false });
        });
    });

    describe("restoreGroupsAndScroll", () => {
        it("expands the saved groups first and scrolls one frame later", () => {
            const { panelRoot, container, headers } = renderPanel({ groups: 3, openGroups: [0] });
            setScrollTop(container, 0);
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ expandedGroupIndexes: [1, 2], panelScroll: 200 }),
                panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();
            runNextFrame();

            expect(headers.map(isOpen)).toEqual([false, true, true]);
            expect(container.scrollTop).toBe(0);

            runNextFrame();

            expect(container.scrollTop).toBe(200);
        });

        it("restores a saved scroll of 0", () => {
            const { panelRoot, container, headers } = renderPanel({ groups: 2, openGroups: [0] });
            setScrollTop(container, 80);
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ panelScroll: 0 }),
                panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();
            runNextFrame();
            runNextFrame();

            expect(container.scrollTop).toBe(0);
            expect(headers.map(isOpen)).toEqual([true, false]);
        });

        it("collapses a default-open group when every group was saved collapsed", () => {
            const { panelRoot, headers } = renderPanel({ groups: 2, openGroups: [1] });
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ expandedGroupIndexes: [] }),
                panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();

            expect(frames).toHaveLength(1);

            runNextFrame();

            expect(headers.map(isOpen)).toEqual([false, false]);
        });

        it("keeps every group collapsed across a rebuild", async () => {
            const store = memoryStore();
            const before = renderPanel({ groups: 1, openGroups: [0] });
            new PropertiesPanelUiStateAdapter(store, before.panelRoot).startPersisting();

            before.headers[0].click();
            await vi.waitFor(() => expect(store.read()).toEqual({ expandedGroupIndexes: [] }));

            document.body.innerHTML = "";
            const rebuilt = renderPanel({ groups: 1, openGroups: [0] });
            new PropertiesPanelUiStateAdapter(
                store,
                rebuilt.panelRoot,
                scheduleFrame,
            ).restoreGroupsAndScroll();
            runNextFrame();

            expect(rebuilt.headers.map(isOpen)).toEqual([false]);
        });

        it.each<[string, PropertiesPanelUiState | undefined]>([
            ["no saved state", undefined],
            ["only a saved visibility", { panelVisible: true }],
        ])("schedules nothing with %s", (_, saved) => {
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore(saved),
                renderPanel({ groups: 1 }).panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();

            expect(frames).toHaveLength(0);
        });

        it("tolerates a panel that has not rendered its scroll container", () => {
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ expandedGroupIndexes: [0], panelScroll: 10 }),
                document.createElement("div"),
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();

            expect(() => runNextFrame()).not.toThrow();
            expect(frames).toHaveLength(0);
        });

        it("skips a saved group that has no header", () => {
            const { panelRoot, container, headers } = renderPanel({ groups: 2 });
            const headerless = document.createElement("div");
            headerless.className = "bio-properties-panel-group";
            container.appendChild(headerless);
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ expandedGroupIndexes: [1, 2] }),
                panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();
            runNextFrame();

            expect(headers.map(isOpen)).toEqual([false, true]);
        });

        it("never scrolls another modeler's panel on the same page", () => {
            const foreign = renderPanel();
            setScrollTop(foreign.container, 0);
            const own = renderPanel();
            setScrollTop(own.container, 0);
            const adapter = new PropertiesPanelUiStateAdapter(
                memoryStore({ panelScroll: 300 }),
                own.panelRoot,
                scheduleFrame,
            );

            adapter.restoreGroupsAndScroll();
            runNextFrame();
            runNextFrame();

            expect(own.container.scrollTop).toBe(300);
            expect(foreign.container.scrollTop).toBe(0);
        });
    });

    describe("startPersisting", () => {
        it("coalesces a burst of scroll events into one write of the last position", () => {
            vi.useFakeTimers();
            const { panelRoot, container } = renderPanel();
            const store = memoryStore();
            new PropertiesPanelUiStateAdapter(store, panelRoot).startPersisting();

            for (const position of [10, 20, 30]) {
                setScrollTop(container, position);
                container.dispatchEvent(new Event("scroll"));
                vi.advanceTimersByTime(50);
            }
            vi.advanceTimersByTime(100);

            expect(store.merge).toHaveBeenCalledOnce();
            expect(store.read()).toEqual({ panelScroll: 30 });
        });

        it("ignores scrolling in another modeler's panel", () => {
            vi.useFakeTimers();
            const foreign = renderPanel();
            const store = memoryStore();
            new PropertiesPanelUiStateAdapter(store, renderPanel().panelRoot).startPersisting();

            setScrollTop(foreign.container, 99);
            foreign.container.dispatchEvent(new Event("scroll"));
            vi.advanceTimersByTime(100);

            expect(store.merge).not.toHaveBeenCalled();
        });

        it("persists the open groups when a header toggles", async () => {
            const { panelRoot, headers } = renderPanel({ groups: 3, openGroups: [2] });
            const store = memoryStore();
            new PropertiesPanelUiStateAdapter(store, panelRoot).startPersisting();

            headers[0].click();
            await vi.waitFor(() => expect(store.merge).toHaveBeenCalled());

            expect(store.read()).toEqual({ expandedGroupIndexes: [0, 2] });
        });

        it("ignores class changes on anything but a group header", async () => {
            const { panelRoot, container, headers } = renderPanel({ groups: 1 });
            const store = memoryStore();
            new PropertiesPanelUiStateAdapter(store, panelRoot).startPersisting();

            container.querySelector("input")!.classList.add("focused");
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(store.merge).not.toHaveBeenCalled();

            headers[0].click();
            await vi.waitFor(() => expect(store.merge).toHaveBeenCalledOnce());
        });

        it("does nothing for a panel without a scroll container", () => {
            const store = memoryStore();
            const adapter = new PropertiesPanelUiStateAdapter(store, document.createElement("div"));

            expect(() => adapter.startPersisting()).not.toThrow();
        });
    });
});
