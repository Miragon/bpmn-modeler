import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeMergeEditorFake"));

import { ExtensionContext } from "vscode";

import {
    executedCommands,
    failAcceptMerge,
    resetVscodeMergeEditor,
    runRegisteredCommand,
} from "../../../__fixtures__/vscodeMergeEditorFake";

import { ACCEPT_ELEMENT_XML_MERGE, ElementXmlMergeController } from "./ElementXmlMergeController";

let marks: string[];

beforeEach(() => {
    resetVscodeMergeEditor();
    marks = [];
    new ElementXmlMergeController(() => {
        marks.push(`accepting after ${executedCommands().length} commands`);
        return () => marks.push(`ended after ${executedCommands().length} commands`);
    }).register({ subscriptions: [] } as unknown as ExtensionContext);
});

describe("ElementXmlMergeController", () => {
    it("accepts the focused merge as VS Code's own Complete Merge does, marked as accepting meanwhile", async () => {
        await runRegisteredCommand(ACCEPT_ELEMENT_XML_MERGE);

        expect(executedCommands()).toEqual(["mergeEditor.acceptMerge"]);
        expect(marks).toEqual(["accepting after 0 commands", "ended after 1 commands"]);
    });

    it("ignores an accept VS Code refuses and ends the mark; the tab closing is the answer", async () => {
        failAcceptMerge();

        await expect(runRegisteredCommand(ACCEPT_ELEMENT_XML_MERGE)).resolves.toBeUndefined();
        expect(marks).toEqual(["accepting after 0 commands", "ended after 1 commands"]);
    });
});
