import { describe, expect, it } from "vitest";

import { box, node as buildNode, layoutOf, pool } from "./__fixtures__/layoutShapes";
import { DrawingDraft } from "./layoutDrawingDraft";
import { translatedNode } from "./layoutModel";

const node = (id: string, x: number) => buildNode(id, { bounds: box(x, 0) });

function moveRight(draft: DrawingDraft, id: string): void {
    draft.replaceShape(translatedNode(draft.node(id)!, 10, 0));
}

describe("DrawingDraft.shapesChangedFrom", () => {
    it("names the shapes the fork changed since it was forked, in document order", () => {
        const base = DrawingDraft.of(layoutOf([node("A", 0), node("B", 200), node("C", 400)]));
        moveRight(base, "A");
        const trial = base.fork();
        moveRight(trial, "C");
        moveRight(trial, "B");

        expect(trial.shapesChangedFrom(base)).toEqual(["B", "C"]);
    });

    it("names a shape the base changed before the fork when the fork changed it again", () => {
        const base = DrawingDraft.of(layoutOf([node("A", 0), node("B", 200)]));
        moveRight(base, "A");
        const trial = base.fork();
        moveRight(trial, "A");

        expect(trial.shapesChangedFrom(base)).toEqual(["A"]);
    });

    it("names no shape when the fork changed nothing", () => {
        const base = DrawingDraft.of(layoutOf([node("A", 0)]));
        moveRight(base, "A");

        expect(base.fork().shapesChangedFrom(base)).toEqual([]);
    });
});

describe("DrawingDraft.changedOrOriginal", () => {
    it("is the drawing it was made of while nothing changed, also on a fork", () => {
        const original = layoutOf([node("A", 0)]);
        const draft = DrawingDraft.of(original);

        expect(draft.changedOrOriginal).toBe(original);
        expect(draft.fork().changedOrOriginal).toBe(original);
    });

    it("is the draft itself once it changed a shape", () => {
        const draft = DrawingDraft.of(layoutOf([node("A", 0)]));
        const trial = draft.fork();
        moveRight(trial, "A");

        expect(trial.changedOrOriginal).toBe(trial);
        expect(draft.changedOrOriginal).not.toBe(draft);
    });
});

describe("DrawingDraft.pool", () => {
    it("is the pool as the draft draws it now, and nothing for another shape", () => {
        const draft = DrawingDraft.of(layoutOf([pool("Pool_1"), node("A", 0)]));
        const grown = { ...pool("Pool_1"), bounds: { x: 0, y: 0, width: 900, height: 400 } };
        draft.replaceShape(grown);

        expect(draft.pool("Pool_1")).toBe(grown);
        expect(draft.pool("A")).toBeUndefined();
    });
});
