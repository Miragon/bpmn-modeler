import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { EXCLUDED_DIRS } from "../domain/excludedDirs";
import { globToRegExp } from "../domain/globToRegExp";
import { findFilesInScope, scanWorkspaceFiles } from "./workspaceFileSearch";

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

    // The host's exclude is what lets it skip reading these folders at all.
    it("asks the host to leave out every excluded folder while it lists", async () => {
        const { workspace } = createTestHost({
            folders: ["/work"],
            files: { "/work/a.bpmn": "" },
        });
        const findFiles = vi.spyOn(workspace, "findFiles");

        await findFilesInScope(
            workspace,
            { kind: "workspace-folders", folders: ["/work"] },
            "**/*.bpmn",
            {
                matchesWalkedFile: (path) => path.endsWith(".bpmn"),
            },
        );

        const exclude = findFiles.mock.calls[0]?.[1];
        expect(exclude).toEqual(expect.any(String));
        const excluded = globToRegExp(exclude as string);
        for (const directory of [...EXCLUDED_DIRS, ".history", ".camunda"]) {
            expect(excluded.test(`web/${directory}/pkg/a.bpmn`), directory).toBe(true);
        }
        expect(excluded.test("src/main/resources/a.bpmn")).toBe(false);
    });

    it("walks past dot-folders when findFiles finds nothing", async () => {
        const { workspace } = createTestHost({
            folders: ["/work"],
            files: { "/work/order.bpmn": "", "/work/.history/order_1.bpmn": "" },
        });
        vi.spyOn(workspace, "findFiles").mockResolvedValue([]);

        const found = await findFilesInScope(
            workspace,
            { kind: "workspace-folders", folders: ["/work"] },
            "**/*.bpmn",
            { matchesWalkedFile: (path) => path.endsWith(".bpmn") },
        );

        expect(found).toEqual(["/work/order.bpmn"]);
    });
});

describe("scanWorkspaceFiles", () => {
    function scanForPay(folders: string[], files: Record<string, string>) {
        const host = createTestHost({ folders, files });
        const scan = () =>
            scanWorkspaceFiles(
                host.workspace,
                {
                    glob: "**/*.java",
                    matchesWalkedFile: (path) => path.endsWith(".java"),
                },
                (content, path) => (content.includes('"pay"') ? path : undefined),
                (workers) => ({ workers }),
            );
        return { scan, workspace: host.workspace };
    }

    it("reports no search scope without a folder or a source document", async () => {
        const { scan, workspace } = scanForPay([], { "/work/Pay.java": 'type = "pay"' });
        const findFiles = vi.spyOn(workspace, "findFiles");

        expect(await scan()).toEqual({ kind: "no-search-scope" });
        expect(findFiles).not.toHaveBeenCalled();
    });

    it("collects what it finds in the files the glob lists", async () => {
        const { scan } = scanForPay(["/work"], {
            "/work/Pay.java": 'type = "pay"',
            "/work/Ship.java": 'type = "ship"',
            "/work/pay.txt": 'type = "pay"',
        });

        expect(await scan()).toEqual({
            kind: "matches",
            workers: ["/work/Pay.java"],
            readFailures: [],
        });
    });

    it("reports every candidate failing to read as all-unreadable", async () => {
        const { scan, workspace } = scanForPay(["/work"], { "/work/Pay.java": 'type = "pay"' });
        vi.spyOn(workspace, "readFile").mockRejectedValue(new Error("EACCES"));

        expect(await scan()).toEqual({
            kind: "all-unreadable",
            failures: ["Could not read /work/Pay.java: EACCES"],
        });
    });
});
