import { describe, expect, it } from "vitest";

import type { MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import {
    actedInMenu,
    actedOnPad,
    keepRemovedFlowsDecision,
    type MergeActedDecision,
    type MergeDecisionCommand,
    mergeDecisionCommandOf,
} from "./mergeActedDecision";
import type { MergePadDecision } from "./mergePadDecisions";

const OFFER: MergePaneRestoreOffer = {
    elementId: "Task_1",
    connections: ["Flow_1", "Flow_2"],
    removedBy: "current",
};

describe("actedOnPad", () => {
    it.each<[MergePadDecision, MergeActedDecision]>([
        [
            { kind: "keep", scope: "element", side: "incoming" },
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "element",
                side: "incoming",
                origin: "canvas",
            },
        ],
        [
            { kind: "keep", scope: "withContents", side: "current" },
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "withContents",
                side: "current",
                origin: "canvas",
            },
        ],
        [
            { kind: "leaveOut", side: "current", otherSideLacks: "missing" },
            {
                kind: "leaveOut",
                elementId: "Task_1",
                side: "current",
                otherSideLacks: "missing",
                origin: "canvas",
            },
        ],
        [
            { kind: "keepRemovedFlows", side: "incoming", offer: OFFER },
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "withConnections",
                side: "incoming",
                origin: "canvas",
            },
        ],
        [
            { kind: "undo", scope: "withContents" },
            { kind: "undo", elementId: "Task_1", scope: "withContents", origin: "canvas" },
        ],
    ])("remembers the pad's %o with the side and reason it names", (decision, acted) => {
        expect(actedOnPad("Task_1", decision)).toStrictEqual(acted);
    });
});

describe("actedInMenu", () => {
    it.each<MergePadDecision>([
        { kind: "keep", scope: "element", side: "current" },
        { kind: "leaveOut", side: "incoming", otherSideLacks: "removed" },
        { kind: "keepRemovedFlows", side: "incoming", offer: OFFER },
        { kind: "undo", scope: "element" },
    ])("remembers a row's %o as the pad's, decided in the menu", (decision) => {
        expect(actedInMenu("Message_1", decision)).toStrictEqual({
            ...actedOnPad("Message_1", decision),
            origin: "menu",
        });
    });
});

describe("keepRemovedFlowsDecision", () => {
    it("keeps the element from the side it names with the flows the other side removed, as the pad's entry does", () => {
        expect(keepRemovedFlowsDecision("Task_1", "incoming")).toStrictEqual(
            actedOnPad("Task_1", { kind: "keepRemovedFlows", side: "incoming", offer: OFFER }),
        );
        expect(keepRemovedFlowsDecision("Task_1", "current")).toMatchObject({
            kind: "keep",
            scope: "withConnections",
            side: "current",
            origin: "canvas",
        });
    });
});

describe("mergeDecisionCommandOf", () => {
    it.each<[MergeActedDecision, MergeDecisionCommand]>([
        [
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "element",
                side: "incoming",
                origin: "canvas",
            },
            { kind: "pick", elementId: "Task_1", scope: "element", side: "incoming" },
        ],
        [
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "withConnections",
                side: "current",
                origin: "canvas",
            },
            { kind: "pick", elementId: "Task_1", scope: "withConnections", side: "current" },
        ],
        [
            {
                kind: "leaveOut",
                elementId: "Task_1",
                side: "current",
                otherSideLacks: "removed",
                origin: "canvas",
            },
            { kind: "pick", elementId: "Task_1", scope: "element", side: "current" },
        ],
        [
            { kind: "undo", elementId: "Process_1", scope: "withContents", origin: "menu" },
            { kind: "unpick", elementId: "Process_1", scope: "withContents" },
        ],
    ])("sends %o as %o", (acted, command) => {
        expect(mergeDecisionCommandOf(acted)).toStrictEqual(command);
    });
});
