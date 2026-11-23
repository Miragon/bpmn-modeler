import { describe, expect, it } from "vitest";

import { containersChangedByBoth, handMergeVersions } from "../../__fixtures__/handMergeVersions";
import { scenarioNamed } from "../../__fixtures__/mergeScenarios";
import { prepareMergeSources } from "./buildMergedSources";

describe("handMergeTexts", () => {
    it("has an entry for each element base, current and incoming hold with pairwise different texts", async () => {
        const sources = await prepareMergeSources(handMergeVersions());

        expect([...sources.handMergeTexts.keys()]).toEqual([
            "Start_Order",
            "Task_Check",
            "Sub_Ship",
            "Task_Pack",
            "Flow_Yes",
        ]);
        expect(sources.handMergeTexts.get("Task_Pack")).toEqual({
            base: expect.stringContaining('name="Pack"'),
            current: sources.snapshots.current.get("Task_Pack")!.content,
            incoming: sources.snapshots.incoming.get("Task_Pack")!.content,
        });
    });

    it("has no entry without a base", async () => {
        const { current, incoming } = handMergeVersions();

        const sources = await prepareMergeSources({ current, incoming });

        expect(sources.handMergeTexts.size).toBe(0);
    });

    it("has no entry where the base equals a side", async () => {
        const sources = await prepareMergeSources(scenarioNamed("table: taken from current"));

        expect(sources.handMergeTexts.size).toBe(0);
    });

    it.each([
        "type: current replaces a task with a collapsed sub-process incoming renames",
        "type: incoming replaces a task with a collapsed sub-process current renames",
    ])("has no entry where the versions differ in type (%s)", async (name) => {
        const sources = await prepareMergeSources(scenarioNamed(name));

        expect(sources.handMergeTexts.has("Task_Reject")).toBe(false);
    });

    it("cuts a container's text to its start tag, documentation and extension elements", async () => {
        const sources = await prepareMergeSources(containersChangedByBoth());

        const processTexts = sources.handMergeTexts.get("Process_1")!;
        expect(processTexts.current).toContain('camunda:historyTimeToLive="30"');
        expect(processTexts.current).not.toContain("laneSet");
        expect(sources.snapshots.current.get("Process_1")!.content).toContain("laneSet");
        expect(processTexts.base).toContain('camunda:historyTimeToLive="180"');
    });

    it("writes a participant as one element, without the process its pool draws", async () => {
        const sources = await prepareMergeSources(containersChangedByBoth());

        const participantTexts = sources.handMergeTexts.get("Participant_Shop")!;
        expect(participantTexts.incoming).toMatch(
            /^<bpmn:participant [^>]*name="Shop later"[^>]*\/>$/,
        );
        expect(participantTexts.incoming).not.toContain("<bpmn:process");
    });
});
