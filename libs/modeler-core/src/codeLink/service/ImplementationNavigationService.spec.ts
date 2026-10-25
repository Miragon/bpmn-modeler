import { describe, expect, it, vi } from "vitest";

import { PickerAnswers, RecordingNotifier, ScriptedPicker } from "../../testing";
import { LocateImplementationResult } from "./ImplementationLocator";
import { ImplementationNavigationService } from "./ImplementationNavigationService";

function createService(result: LocateImplementationResult, answers: PickerAnswers = {}) {
    const locator = {
        resolve: vi.fn().mockResolvedValue(result),
    };
    const notifier = new RecordingNotifier();
    const picker = new ScriptedPicker(answers);
    const service = new ImplementationNavigationService(locator as never, notifier, picker);
    return { service, locator, notifier, picker };
}

describe("ImplementationNavigationService.navigate", () => {
    it("runs the search behind the picker's busy list, passing its own thunk", async () => {
        const { service, picker, locator } = createService({
            kind: "matches",
            paths: ["/src/MyDelegate.java"],
            readFailures: [],
        });

        await service.navigate("com.example.MyDelegate", "javaClass");

        expect(picker.prompts).toHaveLength(1);
        const { method, args } = picker.prompts[0];
        expect(method).toBe("searchAndPickReferencedModel");
        expect(args[0]).toContain("com.example.MyDelegate");
        expect(args[0]).toContain("class");
        // The scripted picker calls the thunk itself, so a pre-resolved result would throw.
        expect(locator.resolve).toHaveBeenCalled();
    });

    it("delegates to the locator with the same arguments", async () => {
        const { service, locator } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("payment-service", "jobType", "/x.bpmn");

        expect(locator.resolve).toHaveBeenCalledWith("payment-service", "jobType", "/x.bpmn");
    });

    it("opens the file directly when the locator returns a single match", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/src/MyDelegate.java"],
            readFailures: [],
        });

        await service.navigate("com.example.MyDelegate", "javaClass");

        // Single match opens directly, without a pick.
        expect(notifier.openedDocuments).toEqual(["/src/MyDelegate.java"]);
    });

    it("opens the QuickPick selection when the locator returns multiple matches", async () => {
        const { service, notifier } = createService(
            {
                kind: "matches",
                paths: ["/src/A.java", "/src/B.java"],
                readFailures: [],
            },
            { referencedModel: "/src/B.java" },
        );

        await service.navigate("t", "jobType");

        expect(notifier.openedDocuments).toEqual(["/src/B.java"]);
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/src/A.java", "/src/B.java"],
            readFailures: [],
        });

        await service.navigate("t", "jobType");

        expect(notifier.openedDocuments).toEqual([]);
    });

    it("shows an info notification when matches is empty", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("payment-topic", "externalTopic");

        expect(notifier.infos).toEqual([expect.stringContaining("payment-topic")]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("shows the 'open a folder' hint when the locator reports no-search-scope", async () => {
        const { service, notifier } = createService({ kind: "no-search-scope" });

        await service.navigate("com.example.X", "javaClass");

        expect(notifier.infos).toEqual([expect.stringContaining("Open a folder")]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("logs each failure and shows an error when the locator reports all-unreadable", async () => {
        const { service, notifier } = createService({
            kind: "all-unreadable",
            attempted: 2,
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await service.navigate("t", "jobType");

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
            paths: ["/src/good.java"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await service.navigate("t", "jobType");

        expect(notifier.logged("warning")).toEqual([expect.stringContaining("EACCES")]);
        expect(notifier.openedDocuments).toEqual(["/src/good.java"]);
    });

    it("surfaces an error when openDocument rejects", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/src/MyDelegate.java"],
            readFailures: [],
        });
        vi.spyOn(notifier, "openDocument").mockRejectedValueOnce(new Error("File not found"));

        await service.navigate("com.example.MyDelegate", "javaClass");

        expect(notifier.errors).toEqual([expect.stringContaining("File not found")]);
        expect(notifier.logged("error")).toEqual(["File not found"]);
    });

    it("truncates very long references in user-facing notifications", async () => {
        const huge = "x".repeat(500);
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate(huge, "jobType");

        const [message] = notifier.infos;
        expect(message).not.toContain(huge);
        expect(message).toContain("…");
    });
});
