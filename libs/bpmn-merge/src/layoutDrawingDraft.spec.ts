import { describe, expect, it } from "vitest";

import { rootPlane } from "./__fixtures__/shapePlane";
import { DrawingDraft } from "./layoutDrawingDraft";
import { type LayoutModel, type NodeShape, translatedNode } from "./layoutModel";

const PLANE = "Process_1";

function node(id: string, x: number): NodeShape {
    return {
        kind: "node",
        id,
        ...rootPlane(PLANE),
        bounds: { x, y: 0, width: 100, height: 80 },
        outline: "rectangle",
        expanded: false,
        subProcesses: [],
        lanes: [],
        mayLieOutsidePool: false,
    };
}

function layoutOf(...nodes: NodeShape[]): LayoutModel {
    return { shapes: new Map(nodes.map((shape) => [shape.id, shape])), edges: new Map() };
}

function moveRight(draft: DrawingDraft, id: string): void {
    draft.replaceShape(translatedNode(draft.node(id)!, 10, 0));
}

describe("DrawingDraft.shapesChangedFrom", () => {
    it("names the shapes the fork changed since it was forked, in document order", () => {
        const base = DrawingDraft.of(layoutOf(node("A", 0), node("B", 200), node("C", 400)));
        moveRight(base, "A");
        const trial = base.fork();
        moveRight(trial, "C");
        moveRight(trial, "B");

        expect(trial.shapesChangedFrom(base)).toEqual(["B", "C"]);
    });

    it("names a shape the base changed before the fork when the fork changed it again", () => {
        const base = DrawingDraft.of(layoutOf(node("A", 0), node("B", 200)));
        moveRight(base, "A");
        const trial = base.fork();
        moveRight(trial, "A");

        expect(trial.shapesChangedFrom(base)).toEqual(["A"]);
    });

    it("names no shape when the fork changed nothing", () => {
        const base = DrawingDraft.of(layoutOf(node("A", 0)));
        moveRight(base, "A");

        expect(base.fork().shapesChangedFrom(base)).toEqual([]);
    });
});

describe("DrawingDraft.changedOrOriginal", () => {
    it("is the drawing it was made of while nothing changed, also on a fork", () => {
        const original = layoutOf(node("A", 0));
        const draft = DrawingDraft.of(original);

        expect(draft.changedOrOriginal).toBe(original);
        expect(draft.fork().changedOrOriginal).toBe(original);
    });

    it("is the draft itself once it changed a shape", () => {
        const draft = DrawingDraft.of(layoutOf(node("A", 0)));
        const trial = draft.fork();
        moveRight(trial, "A");

        expect(trial.changedOrOriginal).toBe(trial);
        expect(draft.changedOrOriginal).not.toBe(draft);
    });
});
