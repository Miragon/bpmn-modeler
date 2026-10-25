import { describe, expect, it, vi } from "vitest";

import { PickerAnswers, RecordingNotifier, ScriptedPicker } from "../../testing";
import { ModelNavigationService } from "./ModelNavigationService";
import { LocateResult } from "./ReferencedModelLocator";

function createService(result: LocateResult, answers: PickerAnswers = {}) {
    const locator = {
        findDeclaringFiles: vi.fn().mockResolvedValue(result),
    };
    const notifier = new RecordingNotifier();
    const picker = new ScriptedPicker(answers);

    const service = new ModelNavigationService(locator as never, notifier, picker);

    return { service, locator, notifier, picker };
}

describe("ModelNavigationService.navigate", () => {
    it("runs the search behind the picker's busy list, passing its own thunk", async () => {
        const { service, picker, locator } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        expect(picker.prompts).toHaveLength(1);
        const { method, args } = picker.prompts[0];
        expect(method).toBe("searchAndPickReferencedModel");
        expect(args[0]).toContain("ProcessB");
        // The scripted picker calls the thunk itself, so a pre-resolved result would throw.
        expect(locator.findDeclaringFiles).toHaveBeenCalled();
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
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await service.navigate("ProcessB", "process");

        // Single match opens directly, without a pick.
        expect(notifier.openedDocuments).toEqual(["/a.bpmn"]);
    });

    it("opens the user's QuickPick selection when the locator returns multiple matches", async () => {
        const { service, notifier } = createService(
            {
                kind: "matches",
                paths: ["/a.bpmn", "/b.bpmn"],
                readFailures: [],
            },
            { referencedModel: "/b.bpmn" },
        );

        await service.navigate("Shared", "process");

        expect(notifier.openedDocuments).toEqual(["/b.bpmn"]);
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });

        await service.navigate("Shared", "process");

        expect(notifier.openedDocuments).toEqual([]);
    });

    it("shows an info notification when matches is empty", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("Missing", "process");

        expect(notifier.infos).toEqual([expect.stringContaining("Missing")]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("shows the 'open a folder' hint when the locator reports no-search-scope", async () => {
        const { service, notifier } = createService({ kind: "no-search-scope" });

        await service.navigate("ProcessB", "process");

        expect(notifier.infos).toEqual([expect.stringContaining("Open a folder")]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("logs each failure and shows an error when the locator reports all-unreadable", async () => {
        const { service, notifier } = createService({
            kind: "all-unreadable",
            attempted: 2,
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(notifier.logged("warning")).toEqual([
            "read /bad1 failed: EACCES",
            "read /bad2 failed: EACCES",
        ]);
        expect(notifier.errors).toEqual([
            expect.stringContaining("none of the candidate files were readable"),
        ]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("logs partial read failures alongside a successful match", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/good.bpmn"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await service.navigate("ProcessB", "process");

        expect(notifier.logged("warning")).toEqual([expect.stringContaining("EACCES")]);
        expect(notifier.openedDocuments).toEqual(["/good.bpmn"]);
    });

    it("surfaces an error when openDocument rejects", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });
        vi.spyOn(notifier, "openDocument").mockRejectedValueOnce(new Error("File not found"));

        await service.navigate("ProcessB", "process");

        expect(notifier.errors).toEqual([expect.stringContaining("File not found")]);
        expect(notifier.logged("error")).toEqual(["File not found"]);
    });

    it("truncates very long reference ids in user-facing notifications", async () => {
        const huge = "x".repeat(500);
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate(huge, "process");

        const [message] = notifier.infos;
        expect(message).not.toContain(huge);
        expect(message).toContain("…");
    });
});
