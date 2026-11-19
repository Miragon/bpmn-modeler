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

beforeEach(() => {
    resetVscodeMergeEditor();
    new ElementXmlMergeController().register({ subscriptions: [] } as unknown as ExtensionContext);
});

describe("ElementXmlMergeController", () => {
    it("accepts the focused merge as VS Code's own Complete Merge does", async () => {
        await runRegisteredCommand(ACCEPT_ELEMENT_XML_MERGE);

        expect(executedCommands()).toEqual(["mergeEditor.acceptMerge"]);
    });

    it("ignores an accept VS Code refuses; the tab closing is the answer", async () => {
        failAcceptMerge();

        await expect(runRegisteredCommand(ACCEPT_ELEMENT_XML_MERGE)).resolves.toBeUndefined();
    });
});
