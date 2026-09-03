import { describe, expect, it } from "vitest";

import { DiffResult } from "@miragon/bpmn-modeler-diff";

import { DiffPaneCoordinator } from "./DiffPaneCoordinator";
import { DiffViewer } from "./DiffViewer";
import { Viewport } from "@miragon/bpmn-modeler-types";

/**
 * {@link DiffViewer} stub recording highlight/viewport calls and letting the
 * test fire a user-driven viewport change.
 */
function stubViewer(present: string[] = []) {
    const has = new Set(present);
    let vpCb: ((v: Viewport) => void) | undefined;
    const calls = {
        setViewport: [] as Viewport[],
        highlights: {} as Record<string, readonly string[]>,
        focus: [] as string[],
        disposed: false,
    };
    const viewer = {
        onViewportChanged: (cb: (v: Viewport) => void) => {
            vpCb = cb;
            return () => {
                calls.disposed = true;
                vpCb = undefined;
            };
        },
        setViewport: (v: Viewport) => calls.setViewport.push(v),
        clearHighlights: () => undefined,
        applyHighlights: (ids: readonly string[], klass: string) => {
            calls.highlights[klass] = ids;
        },
        isConnection: () => false,
        hasElement: (id: string) => has.has(id),
        focusElement: (id: string) => {
            calls.focus.push(id);
            return has.has(id);
        },
        centerOnElement: () => true,
        clearSelectionMarker: () => undefined,
    } as unknown as DiffViewer;
    return { viewer, calls, fireViewport: (v: Viewport) => vpCb?.(v) };
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
});
