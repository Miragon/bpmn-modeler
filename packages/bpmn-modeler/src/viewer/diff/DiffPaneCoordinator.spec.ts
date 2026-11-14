import { describe, expect, it } from "vitest";

import { DiffResult } from "@miragon/bpmn-modeler-diff";

import { DiffPaneCoordinator } from "./DiffPaneCoordinator";
import { DiffViewer } from "./DiffViewer";
import { Viewport } from "@miragon/bpmn-modeler-types";

/**
 * {@link DiffViewer} stub recording highlight/viewport calls and letting the
 * test fire a user-driven viewport change.
 */
function stubViewer(present: string[] = [], planes: string[] = []) {
    const has = new Set(present);
    let vpCb: ((v: Viewport) => void) | undefined;
    let planeCb: ((planeId: string) => void) | undefined;
    const calls = {
        setViewport: [] as Viewport[],
        highlights: {} as Record<string, readonly string[]>,
        focus: [] as string[],
        disposed: false,
        disposeCount: 0,
        fits: 0,
        planes: [] as string[],
    };
    const viewer = {
        onViewportChanged: (cb: (v: Viewport) => void) => {
            vpCb = cb;
            return () => {
                calls.disposed = true;
                calls.disposeCount++;
                vpCb = undefined;
            };
        },
        setViewport: (v: Viewport) => calls.setViewport.push(v),
        onPlaneChanged: (cb: (planeId: string) => void) => {
            planeCb = cb;
            return () => {
                planeCb = undefined;
            };
        },
        showPlane: (planeId: string) => {
            calls.planes.push(planeId);
            return planes.includes(planeId);
        },
        clearHighlights: () => undefined,
        applyHighlights: (ids: readonly string[], klass: string) => {
            calls.highlights[klass] = ids;
        },
        hasElement: (id: string) => has.has(id),
        focusElement: (id: string) => {
            calls.focus.push(id);
            return has.has(id);
        },
        centerOnElement: () => true,
        clearSelectionMarker: () => undefined,
        fitDiagram: () => {
            calls.fits++;
        },
    } as unknown as DiffViewer;
    return {
        viewer,
        calls,
        fireViewport: (v: Viewport) => vpCb?.(v),
        enterPlane: (planeId: string) => planeCb?.(planeId),
    };
}

const RESULT: DiffResult = {
    added: ["G"],
    removed: ["U"],
    changed: ["S1"],
    layoutChanged: ["S2"],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 1 },
    navigationOrder: ["S1", "U", "G", "S2"],
};

const VP: Viewport = { x: 0, y: 0, width: 100, height: 100 };

describe("DiffPaneCoordinator", () => {
    it("drives the partner's viewport without echoing back to the source", () => {
        const before = stubViewer();
        const after = stubViewer();
        new DiffPaneCoordinator(before.viewer, after.viewer);

        before.fireViewport(VP);
        expect(after.calls.setViewport).toEqual([VP]);
        expect(before.calls.setViewport).toEqual([]);

        after.fireViewport(VP);
        expect(before.calls.setViewport).toEqual([VP]);
    });

    it("blanks added on the before pane and removed on the after pane", () => {
        const before = stubViewer();
        const after = stubViewer();
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);

        coord.apply(RESULT);

        expect(before.calls.highlights["diff-added"]).toEqual([]);
        expect(before.calls.highlights["diff-removed"]).toEqual(["U"]);
        expect(after.calls.highlights["diff-added"]).toEqual(["G"]);
        expect(after.calls.highlights["diff-removed"]).toEqual([]);
    });

    it("steps one shared cursor across both panes", () => {
        const before = stubViewer(["S1", "U", "G", "S2"]);
        const after = stubViewer(["S1", "U", "G", "S2"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        coord.apply(RESULT);

        coord.next();
        expect(coord.cursor).toBe(0);
        expect(before.calls.focus.at(-1)).toBe("S1");
        expect(after.calls.focus.at(-1)).toBe("S1");

        coord.previous();
        expect(coord.cursor).toBe(3); // wraps
        expect(before.calls.focus.at(-1)).toBe("S2");
        expect(after.calls.focus.at(-1)).toBe("S2");
    });

    it("starts backward navigation at the last change (#1498)", () => {
        const before = stubViewer(["S1", "U", "G", "S2"]);
        const after = stubViewer(["S1", "U", "G", "S2"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        coord.apply(RESULT);

        coord.previous();
        expect(coord.cursor).toBe(3);
        expect(before.calls.focus.at(-1)).toBe("S2");
        expect(after.calls.focus.at(-1)).toBe("S2");
    });

    it("resets the initial step after a new diff", () => {
        const before = stubViewer(["S1", "U", "G", "S2"]);
        const after = stubViewer(["S1", "U", "G", "S2"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        coord.apply(RESULT);

        coord.next();
        expect(coord.cursor).toBe(0);

        coord.apply(RESULT);
        coord.previous();
        expect(coord.cursor).toBe(3);
    });

    it("can step only once a diff with a change to step to is applied", () => {
        const before = stubViewer(["S1"]);
        const after = stubViewer(["S1"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        expect(coord.canStep).toBe(false);

        coord.apply(RESULT);
        expect(coord.canStep).toBe(true);

        coord.apply({ ...RESULT, navigationOrder: [] });
        expect(coord.canStep).toBe(false);
    });

    it("counts the changes it steps through, for a legend's position", () => {
        const coord = new DiffPaneCoordinator(stubViewer().viewer, stubViewer().viewer);
        const beforeAnyDiff = coord.cycleLength;

        coord.apply(RESULT);

        expect(beforeAnyDiff).toBe(0);
        expect(coord.cycleLength).toBe(4);
    });

    it("takes both panes back to the whole diagram, before the first change", () => {
        const before = stubViewer(["S1", "U", "G", "S2"]);
        const after = stubViewer(["S1", "U", "G", "S2"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        coord.apply(RESULT);
        coord.next();
        coord.next();

        coord.reset();

        expect(coord.cursor).toBe(-1);
        expect([before.calls.fits, after.calls.fits]).toEqual([1, 1]);
        coord.next();
        expect(coord.cursor).toBe(0);
    });

    it("takes the partner into the plane the user enters, and says when its version has none", () => {
        const before = stubViewer([], ["Sub_1"]);
        const after = stubViewer([], ["Sub_2"]);
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);
        const synced: [string, boolean][] = [];
        coord.onPlaneSynced((side, found) => synced.push([side, found]));

        before.enterPlane("Sub_2");
        after.enterPlane("Sub_1");

        expect(after.calls.planes).toEqual(["Sub_2"]);
        expect(before.calls.planes).toEqual(["Sub_1"]);
        expect(synced).toEqual([
            ["after", true],
            ["before", true],
        ]);
        before.enterPlane("Sub_3");
        expect(synced.at(-1)).toEqual(["after", false]);
    });

    it("ignores navigation before any diff is applied", () => {
        const before = stubViewer();
        const after = stubViewer();
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);

        coord.previous();
        coord.next();
        expect(coord.cursor).toBe(-1);
    });

    it("unhooks both viewport subscriptions on destroy", () => {
        const before = stubViewer();
        const after = stubViewer();
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);

        coord.destroy();
        expect(before.calls.disposed).toBe(true);
        expect(after.calls.disposed).toBe(true);

        before.fireViewport(VP);
        expect(after.calls.setViewport).toEqual([]);
    });

    it("does not re-run disposers on a second destroy", () => {
        const before = stubViewer();
        const after = stubViewer();
        const coord = new DiffPaneCoordinator(before.viewer, after.viewer);

        coord.destroy();
        coord.destroy();

        expect(before.calls.disposeCount).toBe(1);
        expect(after.calls.disposeCount).toBe(1);
    });
});
