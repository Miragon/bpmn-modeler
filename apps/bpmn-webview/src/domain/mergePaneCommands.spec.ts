import { describe, expect, it } from "vitest";

import {
    MERGE_PANE_COMMANDS,
    type MergePadEntry,
    type MergePaneCommand,
} from "@miragon/bpmn-modeler-shared";

import { mergePaneCommands, padDecisionFor, padEntryOf } from "./mergePaneCommands";
import type { MergePadDecision } from "./mergePadDecisions";

const KEEP: MergePadDecision = { kind: "keep", scope: "element", side: "incoming" };
const KEEP_INSIDE: MergePadDecision = {
    kind: "keep",
    scope: "withContents",
    side: "incoming",
    reach: "contents",
};
const LEAVE_OUT: MergePadDecision = {
    kind: "leaveOut",
    side: "current",
    lack: "removed",
};
const KEEP_REMOVED_WITH: MergePadDecision = {
    kind: "keepRemovedWith",
    side: "incoming",
    offer: { elementId: "Task_A", connections: ["Flow_1"], removedBy: "current" },
};
const MERGE_XML: MergePadDecision = { kind: "mergeXml", mode: "open" };
const UNDO: MergePadDecision = { kind: "undo", scope: "element" };

const ALL = [KEEP, KEEP_INSIDE, LEAVE_OUT, KEEP_REMOVED_WITH, MERGE_XML, UNDO];

describe("padEntryOf", () => {
    it.each<[MergePadDecision, MergePadEntry]>([
        [KEEP, "keep"],
        [KEEP_INSIDE, "keepInside"],
        [LEAVE_OUT, "leaveOut"],
        [KEEP_REMOVED_WITH, "keepRemovedWith"],
        [MERGE_XML, "mergeXml"],
        [{ kind: "mergeXml", mode: "edit" }, "mergeXml"],
        [UNDO, "undo"],
    ])("names the pad entry of %o", (decision, entry) => {
        expect(padEntryOf(decision)).toBe(entry);
    });
});

describe("padDecisionFor", () => {
    it.each<[MergePadEntry, MergePadDecision]>([
        ["keep", KEEP],
        ["keepInside", KEEP_INSIDE],
        ["leaveOut", LEAVE_OUT],
        ["keepRemovedWith", KEEP_REMOVED_WITH],
        ["mergeXml", MERGE_XML],
        ["undo", UNDO],
    ])("runs %s as the pad's entry for it, side and reach included", (entry, decision) => {
        expect(padDecisionFor(ALL, entry)).toBe(decision);
    });

    it.each<[string, readonly MergePadDecision[], MergePadEntry]>([
        ["nothing selected or a shape-less step", [], "keep"],
        ["a keep the result has already", [KEEP_INSIDE, UNDO], "keep"],
        ["a container's keep inside on an element", [KEEP, UNDO], "keepInside"],
        ["a leave-out where the other side holds it", [KEEP], "leaveOut"],
        ["what was removed with it without an offer", [KEEP, UNDO], "keepRemovedWith"],
        ["an undo without a pick", [KEEP], "undo"],
        ["a merge by hand the host or the pick does not allow", [KEEP, UNDO], "mergeXml"],
    ])("decides nothing where the pad does not offer it: %s", (_case, decisions, entry) => {
        expect(padDecisionFor(decisions, entry)).toBeUndefined();
    });
});

describe("mergePaneCommands", () => {
    it.each<[string, readonly MergePadDecision[], boolean, MergePaneCommand[]]>([
        ["nothing to step or decide: Build only", [], false, ["build"]],
        ["steps, nothing selected", [], true, ["next", "previous", "build"]],
        ["every command", ALL, true, [...MERGE_PANE_COMMANDS]],
        [
            "the pad's entries in the decisions' order",
            [UNDO, KEEP],
            false,
            ["undo", "keep", "build"],
        ],
        ["a picked element", [UNDO], false, ["undo", "build"]],
    ])("offers what the pad, ‹ › and Build offer: %s", (_case, decisions, canStep, commands) => {
        expect(mergePaneCommands(decisions, { canStep })).toEqual(commands);
    });
});
