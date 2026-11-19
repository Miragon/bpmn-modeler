import { describe, expect, it } from "vitest";

import { readConflictMarkers } from "@miragon/bpmn-modeler-types";

import { ElementXmlMerges, elementXmlMergeLabels } from "./elementXmlMerge";

const TEXTS = {
    base: '<bpmn:task id="Task_Pack" />\n',
    current: '<bpmn:task id="Task_Pack" name="Pack parcel" />\n',
    incoming: '<bpmn:task id="Task_Pack" name="Pack box" />\n',
};

const CAPTIONS = {
    current: { side: "current", role: "branch", ref: "main" },
    incoming: { side: "incoming", role: "upstream", ref: "feature" },
} as const;

const element = (overrides: Partial<Parameters<ElementXmlMerges["open"]>[0]> = {}) => ({
    elementId: "Task_Pack",
    side: "current" as const,
    texts: TEXTS,
    captions: CAPTIONS,
    ...overrides,
});

function opened(merges: ElementXmlMerges, overrides: Parameters<typeof element>[0] = {}) {
    const opening = merges.open(element(overrides));
    if (opening.kind !== "open") throw new Error(`expected an open, got ${opening.kind}`);
    return opening.request;
}

describe("ElementXmlMerges", () => {
    it("starts the editor from both sides between conflict markers, labelled by their branches", () => {
        const request = opened(new ElementXmlMerges("merge-1"));

        expect(request).toMatchObject({
            elementId: "Task_Pack",
            labels: { current: "main", incoming: "feature" },
            base: TEXTS.base,
            current: TEXTS.current,
            incoming: TEXTS.incoming,
        });
        expect(readConflictMarkers(request.start)).toStrictEqual({
            hasMarkers: true,
            currentLabel: "main",
            incomingLabel: "feature",
        });
    });

    it("starts an element merged by hand from its accepted text, without markers", () => {
        const request = opened(new ElementXmlMerges("merge-1"), {
            handMergedText: '<bpmn:task id="Task_Pack" name="Pack it" />\n',
        });

        expect(request.start).toBe('<bpmn:task id="Task_Pack" name="Pack it" />\n');
    });

    it("focuses the open editor of an element instead of opening a second one", () => {
        const merges = new ElementXmlMerges("merge-1");
        const first = opened(merges);

        expect(merges.open(element())).toStrictEqual({ kind: "focus", key: first.key });
    });

    it("gives each opening its own key, also of the same element after it finished", () => {
        const merges = new ElementXmlMerges("merge-1");
        const first = opened(merges);
        merges.finish(first.key);
        const second = opened(merges);
        const other = opened(new ElementXmlMerges("merge-2"));

        expect(new Set([first.key, second.key, other.key]).size).toBe(3);
    });

    it.each([
        ["no write", undefined, { kind: "discarded", elementId: "Task_Pack", side: "current" }],
        [
            "a write",
            "<merged />",
            { kind: "written", elementId: "Task_Pack", side: "current", text: "<merged />" },
        ],
        [
            "a write of the text it started from",
            '<bpmn:task id="Task_Pack" />\n',
            {
                kind: "written",
                elementId: "Task_Pack",
                side: "current",
                text: '<bpmn:task id="Task_Pack" />\n',
            },
        ],
    ])("finishes an editor with %s", (_case, written, expected) => {
        const merges = new ElementXmlMerges("merge-1");
        const { key } = opened(merges);

        expect(merges.finish(key, written)).toStrictEqual(expected);
        expect(merges.openKeys).toStrictEqual([]);
    });

    it("finishes nothing for a key it did not open or already finished", () => {
        const merges = new ElementXmlMerges("merge-1");
        const { key } = opened(merges);
        merges.finish(key);

        expect(merges.finish(key, "<late />")).toBeUndefined();
        expect(merges.finish("merge-9:1")).toBeUndefined();
    });

    it("lists the keys of every open editor", () => {
        const merges = new ElementXmlMerges("merge-1");
        const pack = opened(merges);
        const check = opened(merges, { elementId: "Task_Check" });

        expect(merges.openKeys).toStrictEqual([pack.key, check.key]);
    });

    describe("a refused text", () => {
        it("starts Edit again from it", () => {
            const merges = new ElementXmlMerges("merge-1");
            merges.finish(opened(merges).key, "<refused />");
            merges.refused("Task_Pack", "current", "<refused />");

            expect(opened(merges, { resume: true }).start).toBe("<refused />");
        });

        it("starts a plain reopen from the markers", () => {
            const merges = new ElementXmlMerges("merge-1");
            merges.refused("Task_Pack", "current", "<refused />");

            expect(readConflictMarkers(opened(merges).start).hasMarkers).toBe(true);
        });

        it.each([
            ["the next pick", (merges: ElementXmlMerges) => merges.forgetRefusals()],
            ["an accept", (merges: ElementXmlMerges) => merges.accepted("Task_Pack")],
        ])("is forgotten after %s", (_case, forget) => {
            const merges = new ElementXmlMerges("merge-1");
            merges.refused("Task_Pack", "current", "<refused />");

            forget(merges);

            expect(readConflictMarkers(opened(merges, { resume: true }).start).hasMarkers).toBe(
                true,
            );
        });

        it("is not offered for the other side", () => {
            const merges = new ElementXmlMerges("merge-1");
            merges.refused("Task_Pack", "current", "<refused />");

            const request = opened(merges, { side: "incoming", resume: true });

            expect(readConflictMarkers(request.start).hasMarkers).toBe(true);
        });
    });
});

describe("elementXmlMergeLabels", () => {
    it.each([
        ["branches", CAPTIONS, { current: "main", incoming: "feature" }],
        [
            "a commit without a branch",
            {
                current: { side: "current", role: "branch", ref: "main" },
                incoming: { side: "incoming", role: "yourCommit", shortHash: "9f8e7d6" },
            },
            { current: "main", incoming: "9f8e7d6" },
        ],
        [
            "no names at all",
            {
                current: { side: "current", role: "branch" },
                incoming: { side: "incoming", role: "upstream" },
            },
            { current: "Current", incoming: "Incoming" },
        ],
    ] as const)("names the sides by %s", (_case, captions, expected) => {
        expect(elementXmlMergeLabels(captions)).toStrictEqual(expected);
    });
});
