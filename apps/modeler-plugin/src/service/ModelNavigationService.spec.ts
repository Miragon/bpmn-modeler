import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelNavigationService } from "./ModelNavigationService";
import { LocateResult } from "./modelNavigation/ReferencedModelLocator";

function createService(result: LocateResult) {
    const locator = {
        findDeclaringFiles: vi.fn().mockResolvedValue(result),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        withProgress: vi.fn(<T>(_title: string, task: () => Promise<T>): Promise<T> => task()),
        openDocument: vi.fn().mockResolvedValue(undefined),
    };
    const picker = {
        pickReferencedModel: vi.fn(),
    };
    const service = new ModelNavigationService(
        locator as never,
        notifier as never,
        picker as never,
    );
    return { service, locator, notifier, picker };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ModelNavigationService.navigate", () => {
    it("wraps the search in a status-bar progress indicator", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        expect(notifier.withProgress).toHaveBeenCalledTimes(1);
        const [title] = notifier.withProgress.mock.calls[0];
        expect(title).toContain("ProcessB");
    });

    it("delegates to the locator with the same arguments", async () => {
        const { service, locator } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("Id", "process", "/x.bpmn");

        expect(locator.findDeclaringFiles).toHaveBeenCalledWith("Id", "process", "/x.bpmn");
    });

    it("opens the file directly via openDocument when the locator returns a single match", async () => {
        const { service, picker, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        expect(picker.pickReferencedModel).not.toHaveBeenCalled();
        expect(notifier.openDocument).toHaveBeenCalledWith("/a.bpmn");
    });

    it("opens the user's QuickPick selection when the locator returns multiple matches", async () => {
        const { service, picker, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });
        picker.pickReferencedModel.mockResolvedValue("/b.bpmn");

        await service.navigate("Shared", "process");

        expect(picker.pickReferencedModel).toHaveBeenCalledWith(["/a.bpmn", "/b.bpmn"]);
        expect(notifier.openDocument).toHaveBeenCalledWith("/b.bpmn");
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, picker, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });
        picker.pickReferencedModel.mockResolvedValue(undefined);

        await service.navigate("Shared", "process");

        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("shows an info notification when matches is empty", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("Missing", "process");

        expect(notifier.showInfo).toHaveBeenCalledWith(expect.stringContaining("Missing"));
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("shows the 'open a folder' hint when the locator reports no-search-scope", async () => {
        const { service, notifier } = createService({ kind: "no-search-scope" });

        await service.navigate("ProcessB", "process");

        expect(notifier.showInfo).toHaveBeenCalledWith(expect.stringContaining("Open a folder"));
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("logs each failure and shows an error when the locator reports all-unreadable", async () => {
        const { service, notifier } = createService({
            kind: "all-unreadable",
            attempted: 2,
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(notifier.logWarning).toHaveBeenCalledTimes(2);
        expect(notifier.showError).toHaveBeenCalledWith(
            expect.stringContaining("none of the candidate files were readable"),
        );
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("logs partial read failures alongside a successful match", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/good.bpmn"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(notifier.logWarning).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
        expect(notifier.openDocument).toHaveBeenCalledWith("/good.bpmn");
    });

    it("surfaces an error when openDocument rejects", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });
        notifier.openDocument.mockRejectedValueOnce(new Error("File not found"));

        await service.navigate("ProcessB", "process");

        expect(notifier.showError).toHaveBeenCalledWith(expect.stringContaining("File not found"));
        expect(notifier.logError).toHaveBeenCalled();
    });

    it("truncates very long reference ids in user-facing notifications", async () => {
        const huge = "x".repeat(500);
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate(huge, "process");

        const message = notifier.showInfo.mock.calls[0][0] as string;
        /**
         * The 500-char id must NOT appear in full — truncation kicks in.
         */
        expect(message).not.toContain(huge);
        expect(message).toContain("…");
    });
});
