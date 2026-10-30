import { describe, expect, it } from "vitest";

import {
    CleanupDiagramQuery,
    CleanupReportCommand,
    DiagramFormattedCommand,
    FormatDiagramQuery,
} from "@miragon/bpmn-modeler-shared";
import type { CleanupItem, CleanupStatus, LayoutErrorCode } from "@miragon/bpmn-modeler-types";

import { createTestHost } from "../../../testing";
import { BpmnLayoutService } from "./BpmnLayoutService";

const NOTHING_TO_CLEAN = "Nothing to clean up — the diagram carries no leftovers.";

function createService({ userConfirms = false } = {}) {
    const host = createTestHost({ promptAnswers: { cleanupLeftovers: userConfirms } });
    const editor = host.openEditor("/work/diagram.bpmn");
    const service = new BpmnLayoutService(host.store, host.notifier, host.picker);
    return { service, editor, notifier: host.notifier, picker: host.picker };
}

function failedFormat(code?: LayoutErrorCode, detail?: string): DiagramFormattedCommand {
    return new DiagramFormattedCommand("failed", [], code, detail);
}

function cleanupReport(
    status: CleanupStatus,
    options: { items?: CleanupItem[]; applied?: boolean; detail?: string } = {},
): CleanupReportCommand {
    const { items = [], applied = false, detail } = options;
    return new CleanupReportCommand({ status, items, message: detail }, applied);
}

const leftovers: CleanupItem[] = [
    { kind: "orphan-di", id: "Shape_1", label: "Shape_1" },
    { kind: "empty-label-di", label: "Label of Task_1" },
];

describe("BpmnLayoutService.format", () => {
    it("asks the given editor to format its diagram", async () => {
        const { service, editor } = createService();

        await service.format(editor.id);

        expect(editor.posted).toHaveLength(1);
        expect(editor.posted[0]).toBeInstanceOf(FormatDiagramQuery);
    });
});

describe("BpmnLayoutService.reportFormatted", () => {
    it("logs every engine remark, naming the element when known, without notifying", () => {
        const { service, notifier } = createService();

        service.reportFormatted(
            new DiagramFormattedCommand("formatted", [
                { message: "label overlaps", elementId: "Task_1" },
                { message: "lane resized" },
            ]),
        );

        expect(notifier.logged("info")).toEqual([
            "Format: label overlaps (Task_1)",
            "Format: lane resized",
        ]);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("tells the user when the diagram was already formatted", () => {
        const { service, notifier } = createService();

        service.reportFormatted(new DiagramFormattedCommand("unchanged", []));

        expect(notifier.infos).toEqual(["The diagram is already formatted."]);
        expect(notifier.errors).toEqual([]);
    });

    it.each<[LayoutErrorCode, string]>([
        ["UNSUPPORTED_SURFACE", "This diagram is read-only, so it cannot be formatted."],
        ["EMPTY_DIAGRAM", "There is nothing to format yet."],
        ["ENGINE_FAILED", "The diagram could not be formatted."],
        ["DIAGRAM_CHANGED", "The diagram changed while it was being formatted. Try again."],
        ["APPLY_FAILED", "The new layout could not be applied, so the diagram is unchanged."],
    ])("explains a %s refusal in user terms", (code, explanation) => {
        const { service, notifier } = createService();

        service.reportFormatted(failedFormat(code));

        expect(notifier.errors).toEqual([explanation]);
        expect(notifier.logged("error")).toEqual([]);
    });

    it("logs an engine failure and appends its detail to the error", () => {
        const { service, notifier } = createService();

        service.reportFormatted(failedFormat("ENGINE_FAILED", "boom"));

        expect(notifier.logged("error")).toEqual(["Format failed: boom"]);
        expect(notifier.errors).toEqual(["The diagram could not be formatted. boom"]);
    });

    it("logs the detail of any other refusal but keeps it out of the error", () => {
        const { service, notifier } = createService();

        service.reportFormatted(failedFormat("APPLY_FAILED", "modeling threw"));

        expect(notifier.logged("error")).toEqual(["Format failed: modeling threw"]);
        expect(notifier.errors).toEqual([
            "The new layout could not be applied, so the diagram is unchanged.",
        ]);
    });

    it.each([
        ["no code is given", undefined],
        ["the code is outside the protocol union", "NOT_A_CODE" as never],
    ])("treats a failure as an engine failure when %s", (_case, code) => {
        const { service, notifier } = createService();

        service.reportFormatted(failedFormat(code, "boom"));

        expect(notifier.logged("error")).toEqual(["Format failed: boom"]);
        expect(notifier.errors).toEqual(["The diagram could not be formatted. boom"]);
    });

    it("does not treat inherited object keys as refusal codes", () => {
        const { service, notifier } = createService();

        service.reportFormatted(failedFormat("toString" as never));

        expect(notifier.errors).toEqual(["The diagram could not be formatted."]);
    });
});

describe("BpmnLayoutService.inspectCleanup", () => {
    it("asks the given editor for a cleanup report without applying anything", async () => {
        const { service, editor } = createService();

        await service.inspectCleanup(editor.id);

        expect(editor.posted).toHaveLength(1);
        const [query] = editor.posted;
        expect(query).toBeInstanceOf(CleanupDiagramQuery);
        expect((query as CleanupDiagramQuery).apply).toBe(false);
    });
});

describe("BpmnLayoutService.reportCleanup", () => {
    it.each([
        [false, "The diagram could not be checked for leftovers."],
        [true, "The leftovers could not be removed, so the diagram is unchanged."],
    ])("reports a failure (applied=%s) without asking to clean up", async (applied, error) => {
        const { service, notifier, picker, editor } = createService();

        await service.reportCleanup(cleanupReport("failed", { applied, detail: "x" }), editor.id);

        expect(notifier.logged("error")).toEqual(["Cleanup failed: x"]);
        expect(notifier.errors).toEqual([error]);
        expect(notifier.infos).toEqual([]);
        expect(picker.prompts).toEqual([]);
        expect(editor.posted).toEqual([]);
    });

    it("logs nothing for a failure that carries no detail", async () => {
        const { service, notifier, editor } = createService();

        await service.reportCleanup(cleanupReport("failed"), editor.id);

        expect(notifier.logged("error")).toEqual([]);
        expect(notifier.errors).toHaveLength(1);
    });

    it("confirms how many items an applied cleanup removed", async () => {
        const { service, notifier, editor } = createService();

        await service.reportCleanup(
            cleanupReport("applied", { items: leftovers, applied: true }),
            editor.id,
        );

        expect(notifier.infos).toEqual(["Cleaned up 2 item(s)."]);
    });

    it("says there was nothing to clean up when an applied cleanup removed nothing", async () => {
        const { service, notifier, editor } = createService();

        await service.reportCleanup(cleanupReport("applied", { applied: true }), editor.id);

        expect(notifier.infos).toEqual([NOTHING_TO_CLEAN]);
    });

    it("does not ask for confirmation when the report is empty", async () => {
        const { service, notifier, picker, editor } = createService();

        await service.reportCleanup(cleanupReport("reported"), editor.id);

        expect(notifier.infos).toEqual([NOTHING_TO_CLEAN]);
        expect(picker.prompts).toEqual([]);
        expect(editor.posted).toEqual([]);
    });

    it("applies the cleanup only after the user confirms the listed leftovers", async () => {
        const { service, picker, editor } = createService({ userConfirms: true });

        await service.reportCleanup(cleanupReport("reported", { items: leftovers }), editor.id);

        expect(picker.prompts).toEqual([
            {
                method: "confirm",
                args: [
                    {
                        id: "cleanupLeftovers",
                        title: "Remove 2 leftover item(s) from this diagram?",
                        confirmLabel: "Clean Up",
                        details: ["Shape_1", "Label of Task_1"],
                    },
                ],
            },
        ]);
        expect(editor.posted).toHaveLength(1);
        const [query] = editor.posted;
        expect(query).toBeInstanceOf(CleanupDiagramQuery);
        expect((query as CleanupDiagramQuery).apply).toBe(true);
    });

    it("lists the first 12 leftovers and counts the rest", async () => {
        const { service, picker, editor } = createService();
        const many: CleanupItem[] = Array.from({ length: 14 }, (_, i) => ({
            kind: "orphan-di",
            id: `Shape_${i + 1}`,
            label: `Shape_${i + 1}`,
        }));

        await service.reportCleanup(cleanupReport("reported", { items: many }), editor.id);

        expect(picker.prompts).toEqual([
            {
                method: "confirm",
                args: [
                    expect.objectContaining({
                        title: "Remove 14 leftover item(s) from this diagram?",
                        details: [...many.slice(0, 12).map((item) => item.label), "…and 2 more"],
                    }),
                ],
            },
        ]);
    });

    it("removes nothing when the user declines", async () => {
        const { service, notifier, picker, editor } = createService({ userConfirms: false });

        await service.reportCleanup(cleanupReport("reported", { items: leftovers }), editor.id);

        expect(picker.prompts).toHaveLength(1);
        expect(editor.posted).toEqual([]);
        expect(notifier.infos).toEqual([]);
    });
});
