import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeMergeEditorFake"));

import { STANDALONE_APP_NAME } from "@miragon/bpmn-modeler-core";

import {
    env,
    listCommands,
    resetVscodeMergeEditor,
} from "../../../__fixtures__/vscodeMergeEditorFake";

import { VsCodeMergeEditorAvailability } from "./VsCodeMergeEditorAvailability";

beforeEach(() => resetVscodeMergeEditor());

describe("VsCodeMergeEditorAvailability", () => {
    it("is ready once VS Code lists its internal merge editor command", async () => {
        await expect(new VsCodeMergeEditorAvailability().ready).resolves.toBe(true);
    });

    it("is not ready on a host without the command", async () => {
        listCommands(["mergeEditor.acceptMerge"]);

        await expect(new VsCodeMergeEditorAvailability().ready).resolves.toBe(false);
    });

    it("is not ready in the standalone app, which lists the command too", async () => {
        env.appName = STANDALONE_APP_NAME;
        env.uriScheme = "theia";

        await expect(new VsCodeMergeEditorAvailability().ready).resolves.toBe(false);
    });

    it("is not ready when the host cannot list its commands", async () => {
        const { commands } = await import("vscode");
        vi.spyOn(commands, "getCommands").mockRejectedValueOnce(new Error("no commands"));

        await expect(new VsCodeMergeEditorAvailability().ready).resolves.toBe(false);
    });
});
