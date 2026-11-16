import { describe, expect, it } from "vitest";

import { type MergePadContext, mergePadDecisions } from "./mergePadDecisions";

const context = (overrides: Partial<MergePadContext> = {}): MergePadContext => ({
    pickable: { id: "Task_1", container: false },
    paneSide: "incoming",
    takenFromOtherSide: false,
    ...overrides,
});

const kinds = (overrides: Partial<MergePadContext> = {}) =>
    mergePadDecisions(context(overrides)).map((decision) =>
        decision.kind === "keep" ? `keep ${decision.scope} ${decision.side}` : decision.kind,
    );

describe("mergePadDecisions", () => {
    it("offers to keep an undecided element from the pane's side", () => {
        expect(kinds()).toStrictEqual(["keep element incoming"]);
        expect(kinds({ paneSide: "current" })).toStrictEqual(["keep element current"]);
    });

    it("offers to keep a container with everything inside", () => {
        expect(kinds({ pickable: { id: "Task_1", container: true } })).toStrictEqual([
            "keep element incoming",
            "keep withContents incoming",
        ]);
    });

    it("offers to leave out what the other side removed, picking that side", () => {
        const decisions = mergePadDecisions(
            context({ pickable: { id: "Task_1", container: false, removedByOtherSide: true } }),
        );

        expect(decisions).toContainEqual({ kind: "leaveOut", removedBy: "current" });
    });

    it("offers no leave-out once the result follows the side that removed it", () => {
        expect(
            kinds({
                pickable: { id: "Task_1", container: false, removedByOtherSide: true },
                takenFromOtherSide: true,
            }),
        ).toStrictEqual(["keep element incoming"]);
    });

    it("offers no keep the user's pick already made here, and the undo of it", () => {
        expect(
            kinds({
                pickable: { id: "Task_1", container: true, undo: "element" },
                badge: { id: "Task_1", kind: "keptHere", keptSide: "incoming", scope: "element" },
            }),
        ).toStrictEqual(["keep withContents incoming", "undo"]);
        expect(
            kinds({
                pickable: { id: "Task_1", container: true, undo: "withContents" },
                badge: {
                    id: "Task_1",
                    kind: "keptHere",
                    keptSide: "incoming",
                    scope: "withContents",
                },
            }),
        ).toStrictEqual(["undo"]);
    });

    it("offers to keep the pane's side over the other side's pick", () => {
        expect(
            kinds({
                pickable: { id: "Task_1", container: false, undo: "element" },
                badge: {
                    id: "Task_1",
                    kind: "replacedHere",
                    keptSide: "current",
                    scope: "element",
                },
            }),
        ).toStrictEqual(["keep element incoming", "undo"]);
    });

    it("offers the flows removed with the element while the host offers them for it", () => {
        const offer = {
            elementId: "Task_1",
            connections: ["F1", "F2"],
            removedBy: "current",
        } as const;

        expect(mergePadDecisions(context({ restoreOffer: offer }))).toContainEqual({
            kind: "keepRemovedFlows",
            side: "incoming",
            offer,
        });
        expect(kinds({ restoreOffer: { ...offer, elementId: "Task_2" } })).toStrictEqual([
            "keep element incoming",
        ]);
    });
});
