import { describe, expect, it, vi } from "vitest";

import { LocateImplementationResult } from "./ImplementationLocator";
import { ImplementationNavigationService } from "./ImplementationNavigationService";

function createService(result: LocateImplementationResult) {
    const locator = {
        resolve: vi.fn().mockResolvedValue(result),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        openDocument: vi.fn().mockResolvedValue(undefined),
    };
    // Default stub runs the search and returns no pick; tests override `chosen`.
    const picker = {
        searchAndPickReferencedModel: vi.fn(
            async (_placeholder: string, search: () => Promise<LocateImplementationResult>) => ({
                outcome: await search(),
                chosen: undefined as string | undefined,
            }),
        ),
    };
    const service = new ImplementationNavigationService(
        locator as never,
        notifier as never,
        picker as never,
    );
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

        expect(picker.searchAndPickReferencedModel).toHaveBeenCalledTimes(1);
        const [placeholder, search] = picker.searchAndPickReferencedModel.mock.calls[0];
        expect(placeholder).toContain("com.example.MyDelegate");
        expect(placeholder).toContain("class");
        // Service hands over a thunk, not a resolved result.
        expect(search).toBeTypeOf("function");
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
        expect(notifier.openDocument).toHaveBeenCalledWith("/src/MyDelegate.java");
    });

    it("opens the QuickPick selection when the locator returns multiple matches", async () => {
        const { service, picker, notifier } = createService({
            kind: "matches",
            paths: ["/src/A.java", "/src/B.java"],
            readFailures: [],
        });
        picker.searchAndPickReferencedModel.mockImplementation(async (_placeholder, search) => ({
            outcome: await search(),
            chosen: "/src/B.java",
        }));

        await service.navigate("t", "jobType");

        expect(notifier.openDocument).toHaveBeenCalledWith("/src/B.java");
    });

    it("does not open anything when the user cancels the QuickPick", async () => {
        const { service, picker, notifier } = createService({
            kind: "matches",
            paths: ["/src/A.java", "/src/B.java"],
            readFailures: [],
        });
        picker.searchAndPickReferencedModel.mockImplementation(async (_placeholder, search) => ({
            outcome: await search(),
            chosen: undefined,
        }));

        await service.navigate("t", "jobType");

        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("shows an info notification when matches is empty", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate("payment-topic", "externalTopic");

        expect(notifier.showInfo).toHaveBeenCalledWith(expect.stringContaining("payment-topic"));
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("shows the 'open a folder' hint when the locator reports no-search-scope", async () => {
        const { service, notifier } = createService({ kind: "no-search-scope" });

        await service.navigate("com.example.X", "javaClass");

        expect(notifier.showInfo).toHaveBeenCalledWith(expect.stringContaining("Open a folder"));
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("logs each failure and shows an error when the locator reports all-unreadable", async () => {
        const { service, notifier } = createService({
            kind: "all-unreadable",
            attempted: 2,
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await service.navigate("t", "jobType");

        expect(notifier.logWarning).toHaveBeenCalledTimes(2);
        expect(notifier.showError).toHaveBeenCalledWith(
            expect.stringContaining("none of the candidate files were readable"),
        );
        expect(notifier.openDocument).not.toHaveBeenCalled();
    });

    it("logs partial read failures alongside a successful match", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/src/good.java"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await service.navigate("t", "jobType");

        expect(notifier.logWarning).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
        expect(notifier.openDocument).toHaveBeenCalledWith("/src/good.java");
    });

    it("surfaces an error when openDocument rejects", async () => {
        const { service, notifier } = createService({
            kind: "matches",
            paths: ["/src/MyDelegate.java"],
            readFailures: [],
        });
        notifier.openDocument.mockRejectedValueOnce(new Error("File not found"));

        await service.navigate("com.example.MyDelegate", "javaClass");

        expect(notifier.showError).toHaveBeenCalledWith(expect.stringContaining("File not found"));
        expect(notifier.logError).toHaveBeenCalled();
    });

    it("truncates very long references in user-facing notifications", async () => {
        const huge = "x".repeat(500);
        const { service, notifier } = createService({
            kind: "matches",
            paths: [],
            readFailures: [],
        });

        await service.navigate(huge, "jobType");

        const message = notifier.showInfo.mock.calls[0][0] as string;
        expect(message).not.toContain(huge);
        expect(message).toContain("…");
    });
});
