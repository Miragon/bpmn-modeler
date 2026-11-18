import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, nodeById, removeNode } from "./__fixtures__/baseModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { handMergeVersions } from "./__fixtures__/handMergeVersions";
import { acceptHandMerge } from "./acceptHandMerge";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { mergeElementNames } from "./mergeElementNames";

async function renamedAndRemoved() {
    const base = baseModel("c7");
    const current = cloneModel(base);
    nodeById(current, "Task_Check").name = "Check order fast";
    removeNode(current, "Task_Reject");
    const incoming = cloneModel(base);
    nodeById(incoming, "Task_Check").name = "Check feature order";
    const versions = {
        base: renderBpmn(base),
        current: renderBpmn(current),
        incoming: renderBpmn(incoming),
    };
    return {
        decisions: MergeDecisions.from(await computeMerge(versions)),
        sources: await prepareMergeSources(versions),
    };
}

describe("mergeElementNames", () => {
    it("names an element as the side the merge takes it from names it, and current's while it is open", async () => {
        const { decisions, sources } = await renamedAndRemoved();

        expect(mergeElementNames(sources, decisions, ["Task_Check"])).toStrictEqual({
            Task_Check: "Check order fast",
        });

        decisions.pick("Task_Check", "incoming");

        expect(mergeElementNames(sources, decisions, ["Task_Check"])).toStrictEqual({
            Task_Check: "Check feature order",
        });
    });

    it("names an element the kept side removed as the other side names it", async () => {
        const { decisions, sources } = await renamedAndRemoved();

        expect(mergeElementNames(sources, decisions, ["Task_Reject"])).toStrictEqual({
            Task_Reject: "Reject",
        });
    });

    it("leaves out an element no side names", async () => {
        const { decisions, sources } = await renamedAndRemoved();

        expect(mergeElementNames(sources, decisions, ["Flow_Checked"])).toStrictEqual({});
    });

    it("names an element merged by hand as its hand-merged version does", async () => {
        const versions = handMergeVersions();
        const sources = await prepareMergeSources(versions);
        const decisions = MergeDecisions.from(await computeMerge(versions));
        decisions.pick("Task_Pack", "incoming");
        const unnamed = sources.handMergeTexts
            .get("Task_Pack")!
            .incoming.replace(' name="Pack box"', "");
        await acceptHandMerge(sources, decisions, "Task_Pack", "incoming", unnamed);
        decisions.pick("Task_Check", "current");
        const renamed = sources.handMergeTexts
            .get("Task_Check")!
            .current.replace('name="Check order now"', 'name="Check by hand"');
        await acceptHandMerge(sources, decisions, "Task_Check", "current", renamed);

        expect(mergeElementNames(sources, decisions, ["Task_Check", "Task_Pack"])).toEqual({
            Task_Check: "Check by hand",
            Task_Pack: "Pack parcel",
        });
    });

    it("names an element whose hand merge blanks its name as a plain pick of a blank name does", async () => {
        const versions = handMergeVersions();
        const sources = await prepareMergeSources(versions);
        const decisions = MergeDecisions.from(await computeMerge(versions));
        decisions.pick("Task_Pack", "incoming");
        const blanked = sources.handMergeTexts
            .get("Task_Pack")!
            .incoming.replace('name="Pack box"', 'name=""');
        expect(await acceptHandMerge(sources, decisions, "Task_Pack", "incoming", blanked)).toEqual(
            { applied: true },
        );

        expect(mergeElementNames(sources, decisions, ["Task_Pack"])).toEqual({
            Task_Pack: "Pack parcel",
        });
    });
});
