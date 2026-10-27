import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { findFilesInScope } from "./workspaceFileSearch";

function searchBpmnFiles(folders: string[], files: Record<string, string>) {
    const { workspace, notifier } = createTestHost({ folders, files });
    const found = findFilesInScope(workspace, { kind: "workspace-folders", folders }, "**/*.bpmn", {
        logger: notifier,
        matchesWalkedFile: (path) => path.endsWith(".bpmn"),
    });
    const walked = () => notifier.logged("info").filter((message) => message.includes("walk"));
    return { found, walked };
}

describe("findFilesInScope", () => {
    it("keeps findFiles hits of a workspace below a build directory", async () => {
        const { found, walked } = searchBpmnFiles(["/home/u/build/repo"], {
            "/home/u/build/repo/order.bpmn": "",
            "/home/u/build/repo/processes/invoice.bpmn": "",
            "/home/u/build/repo/dist/order.bpmn": "",
        });

        expect(await found).toEqual([
            "/home/u/build/repo/order.bpmn",
            "/home/u/build/repo/processes/invoice.bpmn",
        ]);
        expect(walked()).toEqual([]);
    });

    it("judges each findFiles hit below the workspace folder that contains it", async () => {
        const { found, walked } = searchBpmnFiles(["/home/u/web", "/home/u/build/repo"], {
            "/home/u/web/order.bpmn": "",
            "/home/u/web/out/order.bpmn": "",
            "/home/u/build/repo/invoice.bpmn": "",
            "/home/u/build/repo/target/invoice.bpmn": "",
        });

        expect(await found).toEqual(["/home/u/web/order.bpmn", "/home/u/build/repo/invoice.bpmn"]);
        expect(walked()).toEqual([]);
    });
});
