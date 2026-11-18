import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import type { HandMergedVersion } from "./handMerge";
import { MergeDecisions } from "./mergeDecisions";
import type { ElementVersion, MergeResult, MergeSide } from "./mergeResult";

const MESSAGE_REFERENCE = "bpmn:MessageEventDefinition#messageRef";

/** A sub-process both sides changed with a task inside both changed; a message both hold, one only incoming adds, one both removed; a flow into the task. */
function result(): MergeResult {
    return mergeResult(
        mergeElement("Process_1", "unchanged", { type: "bpmn:Process" }),
        mergeElement("Sub", "bothChanged", { type: "bpmn:SubProcess", parent: "Process_1" }),
        mergeElement("T", "bothChanged", {
            parent: "Sub",
            parts: ["T_Property"],
            references: [refersTo(MESSAGE_REFERENCE, "Message_Kept")],
        }),
        mergeElement("Start", "unchanged", { type: "bpmn:StartEvent", parent: "Sub" }),
        mergeElement("Flow_In", "unchanged", {
            type: "bpmn:SequenceFlow",
            parent: "Sub",
            references: [
                refersTo("bpmn:SequenceFlow#sourceRef", "Start"),
                refersTo("bpmn:SequenceFlow#targetRef", "T"),
            ],
        }),
        mergeElement("Association_T", "unchanged", {
            type: "bpmn:DataInputAssociation",
            parent: "T",
            references: [refersTo("bpmn:DataInputAssociation#targetRef", "T", "T_Property")],
        }),
        mergeElement("Message_Kept", "unchanged", { type: "bpmn:Message", drawn: false }),
        mergeElement("Message_New", "addedByIncoming", { type: "bpmn:Message", drawn: false }),
        mergeElement("Message_Old", "removedByBoth", { type: "bpmn:Message", drawn: false }),
        mergeElement("Message_Dropped", "removedByIncoming", {
            type: "bpmn:Message",
            drawn: false,
        }),
    );
}

function versionOf(decisions: MergeDecisions, id: string, side: MergeSide): ElementVersion {
    return decisions.result.elements.find((element) => element.id === id)!.versions[side]!;
}

function handMerged(
    side: MergeSide,
    change: Partial<ElementVersion> = {},
    id = "T",
): HandMergedVersion {
    const plain = result().elements.find((element) => element.id === id)!.versions[side]!;
    return {
        id,
        side,
        scope: "ownContent",
        content: `<bpmn:task id="${id}" name="by hand" />`,
        shownText: `<bpmn:task id="${id}" name="by hand" />`,
        attributes: { id, name: "by hand" },
        version: { ...plain, ...change },
    };
}

const withMessage = (target: string) => ({ references: [refersTo(MESSAGE_REFERENCE, target)] });

/** Sub and T picked on current, nothing open. */
function pickedOnCurrent(): MergeDecisions {
    const decisions = MergeDecisions.from(result());
    decisions.pick("Sub", "current");
    decisions.pick("T", "current");
    return decisions;
}

function mergedByHandOnCurrent(): MergeDecisions {
    const decisions = pickedOnCurrent();
    expect(decisions.mergeByHand(handMerged("current", withMessage("Message_New")))).toEqual({
        applied: true,
    });
    return decisions;
}

describe("MergeDecisions hand merges", () => {
    it("reads the hand-merged version wherever the result is read", () => {
        const decisions = mergedByHandOnCurrent();

        expect(decisions.handMergeOf("T")).toMatchObject({ side: "current" });
        expect(versionOf(decisions, "T", "current").references).toEqual([
            refersTo(MESSAGE_REFERENCE, "Message_New"),
        ]);
        expect(decisions.handMergedVersions.map(({ id }) => id)).toEqual(["T"]);
    });

    it("keeps the hand merge through a same-side pick, also of a container around it", () => {
        const decisions = mergedByHandOnCurrent();

        expect(decisions.pick("T", "current").applied).toBe(true);
        expect(decisions.pickWithContents("Sub", "current").applied).toBe(true);

        expect(decisions.handMergeOf("T")).toBeDefined();
    });

    const dropping: readonly {
        readonly name: string;
        readonly before?: (decisions: MergeDecisions) => void;
        readonly change: (
            decisions: MergeDecisions,
            drop: boolean,
        ) => ReturnType<MergeDecisions["pick"]>;
    }[] = [
        {
            name: "a pick of the other side",
            change: (decisions, drop) => decisions.pick("T", "incoming", { dropHandMerges: drop }),
        },
        {
            name: "an unpick",
            change: (decisions, drop) => decisions.unpick("T", { dropHandMerges: drop }),
        },
        {
            name: "keeping a container around it from the other side",
            change: (decisions, drop) =>
                decisions.pickScoped("Sub", "incoming", "withContents", { dropHandMerges: drop }),
        },
        {
            name: "taking back a container's pick with everything inside",
            before: (decisions) => decisions.pickWithContents("Sub", "current"),
            change: (decisions, drop) =>
                decisions.unpickScoped("Sub", "withContents", { dropHandMerges: drop }),
        },
    ];

    it.each(dropping)("asks before $name drops it, changing nothing", ({ before, change }) => {
        const decisions = mergedByHandOnCurrent();
        before?.(decisions);
        const sides = decisions.result.elements.map(({ id }) => decisions.sideOf(id));

        expect(change(decisions, false)).toEqual({ applied: false, handMergesAtStake: ["T"] });

        expect(decisions.handMergeOf("T")).toBeDefined();
        expect(decisions.result.elements.map(({ id }) => decisions.sideOf(id))).toEqual(sides);
    });

    it.each(dropping)("drops it on $name with dropHandMerges", ({ before, change }) => {
        const decisions = mergedByHandOnCurrent();
        before?.(decisions);

        expect(change(decisions, true)).toMatchObject({
            applied: true,
            droppedHandMerges: ["T"],
        });

        expect(decisions.handMergeOf("T")).toBeUndefined();
        expect(versionOf(decisions, "T", "current")).toEqual(
            result().elements[2]!.versions.current,
        );
    });

    it("keeps the hand merge through a refused pick, which names its blocks", () => {
        const decisions = mergedByHandOnCurrent();

        const outcome = decisions.pick("Message_New", "current");

        expect(outcome).toMatchObject({ applied: false, blockedBy: [{ id: "T" }] });
        expect(decisions.handMergeOf("T")).toBeDefined();
    });

    it("ends as the plain pick after picking A, B, A", () => {
        const decisions = mergedByHandOnCurrent();

        decisions.pick("T", "incoming", { dropHandMerges: true });
        decisions.pick("T", "current");

        expect(decisions.handMergeOf("T")).toBeUndefined();
        expect(decisions.result).toEqual(result());
    });

    it("takes the side's own version back with dropHandMerge", () => {
        const decisions = mergedByHandOnCurrent();

        expect(decisions.dropHandMerge("T")).toEqual({ applied: true });
        expect(decisions.dropHandMerge("T")).toEqual({ applied: true });

        expect(decisions.handMergeOf("T")).toBeUndefined();
        expect(decisions.result).toEqual(result());
    });

    it("lets the closure, the open conflicts and the layout sides read the hand-merged version", () => {
        const plain = pickedOnCurrent();
        const decisions = mergedByHandOnCurrent();

        expect(decisions.canBuild).toBe(true);
        expect(decisions.resolution()).toEqual(plain.resolution());
        expect(decisions.pick("Message_New", "current").applied).toBe(false);
        expect(plain.pick("Message_New", "current").applied).toBe(true);
    });

    describe("refuses, changing nothing,", () => {
        const refusals: readonly {
            readonly name: string;
            readonly merged: () => HandMergedVersion;
            readonly refusal: object;
            readonly pickedSide?: MergeSide;
        }[] = [
            {
                name: "a version for an element not picked on its side",
                merged: () => handMerged("incoming"),
                refusal: { kind: "notHandMergeable" },
            },
            {
                name: "a version for an element the user has not picked",
                merged: () => handMerged("current", {}, "Start"),
                refusal: { kind: "notHandMergeable" },
            },
            {
                name: "a version that moves an edge end",
                merged: () => ({
                    ...handMerged("current", {}, "Flow_In"),
                    version: {
                        ...handMerged("current", {}, "Flow_In").version,
                        references: [
                            refersTo("bpmn:SequenceFlow#sourceRef", "Start"),
                            refersTo("bpmn:SequenceFlow#targetRef", "Sub"),
                        ],
                    },
                }),
                refusal: { kind: "changesStructure", properties: ["bpmn:SequenceFlow#targetRef"] },
            },
            {
                name: "a version naming an element no version holds",
                merged: () => handMerged("current", withMessage("Message_Nowhere")),
                refusal: { kind: "namesMissingElement", ids: ["Message_Nowhere"] },
            },
            {
                name: "a version naming an element the result leaves out",
                merged: () => handMerged("current", withMessage("Message_Old")),
                refusal: { kind: "namesLeftOutElement", ids: ["Message_Old"] },
            },
            {
                name: "a version dropping a part another element of the result names",
                merged: () => handMerged("current", { parts: [] }),
                refusal: { kind: "changesOtherDecisions", ids: ["Association_T"] },
            },
            {
                name: "a version holding the id of another element",
                merged: () => handMerged("current", { parts: ["T_Property", "Message_Kept"] }),
                refusal: { kind: "changesOtherDecisions", ids: ["Message_Kept"] },
            },
        ];

        it.each(refusals)("$name", ({ merged, refusal }) => {
            const decisions = pickedOnCurrent();
            decisions.pick("Flow_In", "current");
            const before = decisions.result;

            expect(decisions.mergeByHand(merged())).toEqual({
                applied: false,
                refusal: expect.objectContaining(refusal),
            });

            expect(decisions.result).toBe(before);
            expect(decisions.handMergedVersions).toEqual([]);
            expect(decisions.canBuild).toBe(true);
        });
    });
});
