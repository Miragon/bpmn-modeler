import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    commands: { executeCommand: vi.fn() },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
    ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
    window: {
        withProgress: <T>(_opts: unknown, task: () => Promise<T>): Promise<T> => task(),
    },
}));

import { commands, ProgressLocation, window } from "vscode";

import { ModelNavigationService } from "./ModelNavigationService";
import { LocateResult } from "./modelNavigation/ReferencedModelLocator";

function createService(result: LocateResult) {
    const locator = {
        findDeclaringFiles: vi.fn().mockResolvedValue(result),
    };
    const vsUI = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        pickReferencedModel: vi.fn(),
    };
    const service = new ModelNavigationService(locator as never, vsUI as never);
    return { service, locator, vsUI };
}

beforeEach(() => {
    vi.mocked(commands.executeCommand).mockReset();
});

describe("ModelNavigationService.navigate", () => {
    it("wraps the search in a status-bar progress indicator", async () => {
        const progressSpy = vi.spyOn(window, "withProgress");
        const { service } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        expect(progressSpy).toHaveBeenCalledTimes(1);
        const [opts] = progressSpy.mock.calls[0];
        expect((opts as { location: number }).location).toBe(ProgressLocation.Window);
        expect((opts as { title: string }).title).toContain("ProcessB");
        progressSpy.mockRestore();
    });

    it("delegates to the locator with the same arguments", async () => {
        const { service, locator } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });
        const documentUri = { scheme: "file", path: "/x.bpmn" } as never;

        await service.navigate("Id", "process", documentUri);

        expect(locator.findDeclaringFiles).toHaveBeenCalledWith(
            "Id",
            "process",
            documentUri,
        );
    });

    it("opens the file directly via vscode.open when the locator returns a single match", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        expect(vsUI.pickReferencedModel).not.toHaveBeenCalled();
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/a.bpmn" }),
        );
    });

    it("opens the user's QuickPick selection when the locator returns multiple matches", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });
        vsUI.pickReferencedModel.mockResolvedValue("/b.bpmn");

        await service.navigate("Shared", "process");

        expect(vsUI.pickReferencedModel).toHaveBeenCalledWith(["/a.bpmn", "/b.bpmn"]);
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/b.bpmn" }),
        );
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });
        vsUI.pickReferencedModel.mockResolvedValue(undefined);

        await service.navigate("Shared", "process");

        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("shows an info notification when matches is empty", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("Missing", "process");

        expect(vsUI.showInfo).toHaveBeenCalledWith(expect.stringContaining("Missing"));
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("shows the 'open a folder' hint when the locator reports no-search-scope", async () => {
        const { service, vsUI } = createService({ kind: "no-search-scope" });

        await service.navigate("ProcessB", "process");

        expect(vsUI.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("Open a folder"),
        );
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("logs each failure and shows an error when the locator reports all-unreadable", async () => {
        const { service, vsUI } = createService({
            kind: "all-unreadable",
            attempted: 2,
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(vsUI.logWarning).toHaveBeenCalledTimes(2);
        expect(vsUI.showError).toHaveBeenCalledWith(
            expect.stringContaining("none of the candidate files were readable"),
        );
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("logs partial read failures alongside a successful match", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: ["/good.bpmn"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(vsUI.logWarning).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ path: "/good.bpmn" }),
        );
    });

    it("surfaces an error when vscode.open rejects", async () => {
        const { service, vsUI } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });
        vi.mocked(commands.executeCommand).mockRejectedValueOnce(
            new Error("File not found"),
        );

        await service.navigate("ProcessB", "process");

        expect(vsUI.showError).toHaveBeenCalledWith(
            expect.stringContaining("File not found"),
        );
        expect(vsUI.logError).toHaveBeenCalled();
    });

    it("truncates very long reference ids in user-facing notifications", async () => {
        const huge = "x".repeat(500);
        const { service, vsUI } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate(huge, "process");

        const message = vsUI.showInfo.mock.calls[0][0] as string;
        // The 500-char id must NOT appear in full — truncation kicks in.
        expect(message).not.toContain(huge);
        expect(message).toContain("…");
    });
});
