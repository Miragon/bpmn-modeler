import { describe, expect, it } from "vitest";

import type { MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import {
    actedOnPad,
    editAgainRequest,
    keepRemovedWithDecision,
    type MergeActedDecision,
    type MergeDecisionCommand,
    mergeDecisionCommandOf,
    type MergePaneRequest,
    requestInMenu,
    requestOnPad,
} from "./mergeActedDecision";
import type { MergePadDecision, MergePickDecision } from "./mergePadDecisions";

const OFFER: MergePaneRestoreOffer = {
    elementId: "Task_1",
    connections: ["Flow_1", "Flow_2"],
    removedBy: "current",
};

describe("actedOnPad", () => {
    it.each<[MergePickDecision, MergeActedDecision]>([
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
            { kind: "keep", scope: "withContents", side: "current", reach: "contents" },
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "withContents",
                side: "current",
                origin: "canvas",
            },
        ],
        [
            { kind: "leaveOut", side: "current", lack: "missing" },
            {
                kind: "leaveOut",
                elementId: "Task_1",
                side: "current",
                lack: "missing",
                origin: "canvas",
            },
        ],
        [
            { kind: "keepRemovedWith", side: "incoming", offer: OFFER },
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "withRemoved",
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

describe("requestInMenu", () => {
    it.each<MergePickDecision>([
        { kind: "keep", scope: "element", side: "current" },
        { kind: "leaveOut", side: "incoming", lack: "removed" },
        { kind: "keepRemovedWith", side: "incoming", offer: OFFER },
        { kind: "undo", scope: "element" },
    ])("remembers a row's %o as the pad's, decided in the menu", (decision) => {
        expect(requestInMenu("Message_1", decision)).toStrictEqual({
            ...actedOnPad("Message_1", decision),
            origin: "menu",
        });
    });
});

describe("keepRemovedWithDecision", () => {
    it("keeps the element from the side it names with the flows the other side removed, as the pad's entry does", () => {
        expect(keepRemovedWithDecision("Task_1", "incoming")).toStrictEqual(
            actedOnPad("Task_1", { kind: "keepRemovedWith", side: "incoming", offer: OFFER }),
        );
        expect(keepRemovedWithDecision("Task_1", "current")).toMatchObject({
            kind: "keep",
            scope: "withRemoved",
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
                scope: "withRemoved",
                side: "current",
                origin: "canvas",
            },
            { kind: "pick", elementId: "Task_1", scope: "withRemoved", side: "current" },
        ],
        [
            {
                kind: "leaveOut",
                elementId: "Task_1",
                side: "current",
                lack: "removed",
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

describe("merging an element's XML by hand", () => {
    it.each<[string, MergePaneRequest, MergeDecisionCommand]>([
        [
            "the pad's Merge XML",
            requestOnPad("Task_1", { kind: "mergeXml", mode: "open" }),
            { kind: "openXmlMerge", elementId: "Task_1" },
        ],
        [
            "a row's Edit merged XML",
            requestInMenu("Message_1", { kind: "mergeXml", mode: "edit" }),
            { kind: "openXmlMerge", elementId: "Message_1" },
        ],
        [
            "the card's Edit again",
            editAgainRequest("Task_1", "canvas"),
            { kind: "openXmlMerge", elementId: "Task_1", resume: true },
        ],
    ])("opens the merge editor for %s, which picks nothing", (_case, request, command) => {
        expect(mergeDecisionCommandOf(request)).toStrictEqual(command);
    });

    it("remembers where the merge was asked for", () => {
        expect(requestOnPad("Task_1", { kind: "mergeXml", mode: "open" })).toStrictEqual({
            kind: "mergeXml",
            elementId: "Task_1",
            origin: "canvas",
        });
        expect(requestInMenu("Message_1", { kind: "mergeXml", mode: "edit" })).toMatchObject({
            origin: "menu",
        });
    });

    it("sends a pick decision as actedOnPad remembers it", () => {
        const keep: MergePadDecision = { kind: "keep", scope: "element", side: "current" };

        expect(requestOnPad("Task_1", keep)).toStrictEqual(actedOnPad("Task_1", keep));
        expect(requestInMenu("Task_1", keep)).toStrictEqual({
            kind: "keep",
            elementId: "Task_1",
            scope: "element",
            side: "current",
            origin: "menu",
        });
    });

    it.each<[MergeActedDecision, MergeDecisionCommand]>([
        [
            {
                kind: "keep",
                elementId: "Task_1",
                scope: "element",
                side: "incoming",
                origin: "canvas",
            },
            {
                kind: "pick",
                elementId: "Task_1",
                scope: "element",
                side: "incoming",
                dropsHandMerges: true,
            },
        ],
        [
            { kind: "undo", elementId: "Task_1", scope: "element", origin: "canvas" },
            { kind: "unpick", elementId: "Task_1", scope: "element", dropsHandMerges: true },
        ],
    ])("resends %o agreeing to drop the XML merged by hand", (acted, command) => {
        expect(mergeDecisionCommandOf(acted, { dropsHandMerges: true })).toStrictEqual(command);
    });
});
