import { describe, expect, it } from "vitest";

import { DiffSideView } from "@miragon/bpmn-modeler-diff";

import { DiffNavigator } from "./DiffNavigator";
import { DiffViewer } from "./DiffViewer";

/**
 * Minimal {@link DiffViewer} stub — records the calls {@link DiffNavigator}
 * makes and answers presence/connection queries from fixed sets.
 */
function stubViewer(opts: { present?: string[]; connections?: string[] } = {}) {
    const present = new Set(opts.present ?? []);
    const connections = new Set(opts.connections ?? []);
    const calls = { focus: [] as string[], center: [] as string[], clearSelection: 0 };
    const viewer = {
        isConnection: (id: string) => connections.has(id),
        hasElement: (id: string) => present.has(id),
        focusElement: (id: string) => {
            calls.focus.push(id);
            return present.has(id);
        },
        centerOnElement: (id: string) => {
            calls.center.push(id);
            return present.has(id);
        },
        clearSelectionMarker: () => {
            calls.clearSelection++;
        },
    } as unknown as DiffViewer;
    return { viewer, calls };
}

const view = (over: Partial<DiffSideView> = {}): DiffSideView => ({
    added: [],
    removed: [],
    changed: [],
    layoutChanged: [],
    ...over,
});

describe("DiffNavigator", () => {
    it("steps through the navigation order as computed by the diff", () => {
        const { viewer, calls } = stubViewer({
            present: ["A", "Flow_1", "B"],
            connections: ["Flow_1"],
        });
        const nav = new DiffNavigator(viewer);

        nav.setChanges(["A", "Flow_1", "B"]);
        [1, 2, 3].forEach(() => nav.advance(1));

        expect(nav.cycleLength).toBe(3);
        expect(calls.focus).toEqual(["A", "Flow_1", "B"]);
    });

    it("skips a layout-only connection in a navigation order passed with its side view", () => {
        const { viewer, calls } = stubViewer({
            present: ["A", "Flow_1", "B"],
            connections: ["Flow_1"],
        });
        const nav = new DiffNavigator(viewer);

        nav.setChanges(view({ changed: ["A", "B"], layoutChanged: ["Flow_1"] }), [
            "A",
            "Flow_1",
            "B",
        ]);
        [1, 2].forEach(() => nav.advance(1));

        expect(nav.cycleLength).toBe(2);
        expect(calls.focus).toEqual(["A", "B"]);
    });

    it("keeps a connection that is also a semantic change when passed with its side view", () => {
        const { viewer } = stubViewer({ present: ["Flow_1"], connections: ["Flow_1"] });
        const nav = new DiffNavigator(viewer);

        nav.setChanges(view({ added: ["Flow_1"], layoutChanged: ["Flow_1"] }), ["Flow_1"]);

        expect(nav.cycleLength).toBe(1);
    });

    it("can step only when the navigation order has a change", () => {
        const { viewer } = stubViewer({ present: ["A"] });
        const nav = new DiffNavigator(viewer);
        expect(nav.canStep).toBe(false);

        nav.setChanges(["A"]);
        expect(nav.canStep).toBe(true);

        nav.setChanges([]);
        expect(nav.canStep).toBe(false);
    });

    it("wraps the cursor forward and backward", () => {
        const { viewer } = stubViewer({ present: ["A", "B", "C"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(["A", "B", "C"]);

        expect(nav.advance(1)).toBe(0);
        expect(nav.advance(1)).toBe(1);
        expect(nav.advance(1)).toBe(2);
        expect(nav.advance(1)).toBe(0); // wrap forward
        expect(nav.advance(-1)).toBe(2); // wrap backward
    });

    it("starts backward navigation at the last change (#1498)", () => {
        const { viewer } = stubViewer({ present: ["A", "B", "C"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(["A", "B", "C"]);

        expect(nav.advance(-1)).toBe(2);
    });

    it("anchors the initial step at an end of the cycle for lengths 1-3", () => {
        const len1 = stubViewer({ present: ["A"] });
        const nav1 = new DiffNavigator(len1.viewer);
        nav1.setChanges(["A"]);
        expect(nav1.advance(1)).toBe(0);
        nav1.setChanges(["A"]);
        expect(nav1.advance(-1)).toBe(0);

        const len2 = stubViewer({ present: ["A", "B"] });
        const nav2 = new DiffNavigator(len2.viewer);
        nav2.setChanges(["A", "B"]);
        expect(nav2.advance(1)).toBe(0);
        nav2.setChanges(["A", "B"]);
        expect(nav2.advance(-1)).toBe(1);

        const len3 = stubViewer({ present: ["A", "B", "C"] });
        const nav3 = new DiffNavigator(len3.viewer);
        nav3.setChanges(["A", "B", "C"]);
        expect(nav3.advance(1)).toBe(0);
        nav3.setChanges(["A", "B", "C"]);
        expect(nav3.advance(-1)).toBe(2);
    });

    it("resets the initial step after a new diff", () => {
        const { viewer } = stubViewer({ present: ["A", "B", "C"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(["A", "B", "C"]);

        expect(nav.advance(1)).toBe(0);
        expect(nav.advance(1)).toBe(1);

        nav.setChanges(["A", "B", "C"]);
        expect(nav.advance(-1)).toBe(2);
    });

    it("focuses a target present on this canvas", () => {
        const { viewer, calls } = stubViewer({ present: ["A", "B"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(["A", "B"]);

        expect(nav.applyCursor(1)).toBe(true);
        expect(calls.focus).toContain("B");
        expect(calls.center).toHaveLength(0);
    });

    it("anchors on a surviving neighbour when the target is partner-only", () => {
        // Cursor lands on A (absent); B is the only present id — walk anchors on it.
        const { viewer, calls } = stubViewer({ present: ["B"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(["A", "B", "C"]);

        expect(nav.applyCursor(0, 1)).toBe(false);
        expect(calls.center).toEqual(["B"]);
        expect(calls.clearSelection).toBe(1);
    });

    it("is a no-op on an empty cycle", () => {
        const { viewer } = stubViewer();
        const nav = new DiffNavigator(viewer);
        nav.setChanges([]);

        expect(nav.advance(1)).toBeUndefined();
        expect(nav.applyCursor(0)).toBe(false);
        expect(nav.cursor).toBe(-1);
    });
});
