import { describe, expect, it } from "vitest";

import { dropBlockedRenames, orderRenames, type Rename } from "./renameOrder";

const rename = (from: string, to: string): Rename<string> => ({ item: from, from, to });

/** Replays the steps on a set of held IDs and fails on a step that claims a held ID. */
function replay(held: string[], steps: Rename<string>[]): string[] {
    const ids = new Set(held);
    for (const step of steps) {
        expect(ids.has(step.from), `${step.from} is held before it is renamed`).toBe(true);
        expect(ids.has(step.to), `${step.to} is free when ${step.from} takes it`).toBe(false);
        ids.delete(step.from);
        ids.add(step.to);
    }
    return [...ids].sort();
}

describe("orderRenames", () => {
    it("keeps independent renames in their order", () => {
        const steps = orderRenames([rename("a", "x"), rename("b", "y")], () => false);

        expect(steps.map((s) => `${s.from}>${s.to}`)).toEqual(["a>x", "b>y"]);
    });

    it("renames the holder of an ID before the element that takes it", () => {
        const steps = orderRenames([rename("a", "b"), rename("b", "c")], () => false);

        expect(steps.map((s) => `${s.from}>${s.to}`)).toEqual(["b>c", "a>b"]);
        expect(replay(["a", "b"], steps)).toEqual(["b", "c"]);
    });

    it("swaps two IDs through a temporary one", () => {
        const steps = orderRenames([rename("a", "b"), rename("b", "a")], () => false);

        expect(replay(["a", "b"], steps)).toEqual(["a", "b"]);
        expect(steps).toHaveLength(3);
        expect(
            steps
                .filter((s) => s.item === "a")
                .map((s) => s.to)
                .slice(-1),
        ).toEqual(["b"]);
        expect(
            steps
                .filter((s) => s.item === "b")
                .map((s) => s.to)
                .slice(-1),
        ).toEqual(["a"]);
    });

    it("resolves a longer cycle and a chain hanging off it", () => {
        const renames = [
            rename("a", "b"),
            rename("b", "c"),
            rename("c", "a"),
            rename("d", "a2"),
            rename("e", "d"),
        ];

        const steps = orderRenames(renames, () => false);

        expect(replay(["a", "b", "c", "d", "e"], steps)).toEqual(["a", "a2", "b", "c", "d"]);
    });

    it("picks a temporary ID nothing else holds", () => {
        const taken = new Set(["a_tmp", "a_tmp2"]);

        const steps = orderRenames([rename("a", "b"), rename("b", "a")], (id) => taken.has(id));

        expect(steps[0]?.to).toBe("a_tmp3");
    });

    it("drops a rename to the same ID", () => {
        expect(orderRenames([rename("a", "a")], () => false)).toEqual([]);
    });
});

describe("dropBlockedRenames", () => {
    it("drops a rename whose target something outside the renames holds", () => {
        const kept = dropBlockedRenames([rename("a", "x"), rename("b", "y")], (id) => id === "x");

        expect(kept.map((r) => r.from)).toEqual(["b"]);
    });

    it("keeps a rename whose target another rename gives up", () => {
        const kept = dropBlockedRenames(
            [rename("a", "b"), rename("b", "a")],
            (id) => id === "a" || id === "b",
        );

        expect(kept).toHaveLength(2);
    });

    it("drops a rename that waited on a dropped one", () => {
        const held = new Set(["a", "b", "x"]);

        const kept = dropBlockedRenames([rename("a", "b"), rename("b", "x")], (id) => held.has(id));

        expect(kept).toEqual([]);
    });
});
