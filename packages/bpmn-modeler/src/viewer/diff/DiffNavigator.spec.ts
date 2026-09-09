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
    it("prunes layout-only connections from the cycle", () => {
        const { viewer } = stubViewer({ present: ["A", "Flow_1", "B"], connections: ["Flow_1"] });
        const nav = new DiffNavigator(viewer);

        nav.setChanges(view({ changed: ["A", "B"], layoutChanged: ["Flow_1"] }), [
            "A",
            "Flow_1",
            "B",
        ]);

        expect(nav.cycleLength).toBe(2);
    });

    it("keeps a connection that is also a semantic change", () => {
        const { viewer } = stubViewer({ present: ["Flow_1"], connections: ["Flow_1"] });
        const nav = new DiffNavigator(viewer);

        nav.setChanges(view({ added: ["Flow_1"], layoutChanged: ["Flow_1"] }), ["Flow_1"]);

        expect(nav.cycleLength).toBe(1);
    });

    it("wraps the cursor forward and backward", () => {
        const { viewer } = stubViewer({ present: ["A", "B", "C"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(view({ changed: ["A", "B", "C"] }), ["A", "B", "C"]);

        expect(nav.advance(1)).toBe(0);
        expect(nav.advance(1)).toBe(1);
        expect(nav.advance(1)).toBe(2);
        expect(nav.advance(1)).toBe(0); // wrap forward
        expect(nav.advance(-1)).toBe(2); // wrap backward
    });

    it("focuses a target present on this canvas", () => {
        const { viewer, calls } = stubViewer({ present: ["A", "B"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(view({ changed: ["A", "B"] }), ["A", "B"]);

        expect(nav.applyCursor(1)).toBe(true);
        expect(calls.focus).toContain("B");
        expect(calls.center).toHaveLength(0);
    });

    it("anchors on a surviving neighbour when the target is partner-only", () => {
        // Cursor lands on A (absent); B is the only present id — walk anchors on it.
        const { viewer, calls } = stubViewer({ present: ["B"] });
        const nav = new DiffNavigator(viewer);
        nav.setChanges(view({ changed: ["A", "B", "C"] }), ["A", "B", "C"]);

        expect(nav.applyCursor(0, 1)).toBe(false);
        expect(calls.center).toEqual(["B"]);
        expect(calls.clearSelection).toBe(1);
    });

    it("is a no-op on an empty cycle", () => {
        const { viewer } = stubViewer();
        const nav = new DiffNavigator(viewer);
        nav.setChanges(view(), []);

        expect(nav.advance(1)).toBeUndefined();
        expect(nav.applyCursor(0)).toBe(false);
        expect(nav.cursor).toBe(-1);
    });
});
