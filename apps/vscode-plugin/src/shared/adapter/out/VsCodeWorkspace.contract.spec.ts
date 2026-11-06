import { vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWorkspaceFake"));

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toWorkspacePath } from "@miragon/bpmn-modeler-core";
import { describeWorkspaceContract } from "@miragon/bpmn-modeler-core/testing";

import {
    anotherProgram,
    fileEventsDelivered,
    openWorkspaceFolder,
    resetVscodeWorkspace,
} from "../../../__fixtures__/vscodeWorkspaceFake";
import { VsCodeWorkspace } from "./VsCodeWorkspace";

describeWorkspaceContract("VsCodeWorkspace on a real directory", async () => {
    resetVscodeWorkspace();
    const root = toWorkspacePath(await fs.mkdtemp(join(tmpdir(), "vscode-workspace-contract-")));
    return {
        workspace: new VsCodeWorkspace(),
        root,
        openFolder: openWorkspaceFolder,
        createDirectory: anotherProgram.createDirectory,
        moveDirectoryIn: anotherProgram.moveDirectoryIn,
        removeFile: anotherProgram.removeFile,
        watchersReady: async () => undefined,
        eventsDelivered: fileEventsDelivered,
        dispose: () => fs.rm(root, { recursive: true, force: true }),
    };
});
