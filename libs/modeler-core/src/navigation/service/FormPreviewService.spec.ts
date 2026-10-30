import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { ReferencedModelLocator } from "./ReferencedModelLocator";
import { FormPreviewService } from "./FormPreviewService";
import type { LocateResult } from "../../kernel/domain/locateResult";

function setup(files: Record<string, string>, selected?: string) {
    const host = createTestHost({
        folders: ["/work"],
        files,
        answers: { locatedFile: selected },
    });
    const locator = new ReferencedModelLocator(host.workspace, host.notifier);
    const service = new FormPreviewService(locator, host.workspace, host.picker, host.notifier);
    return { host, service, locator };
}

describe("form preview reads", () => {
    it.each<{ outcome: LocateResult; expected: object; warnings: string[] }>([
        {
            outcome: { kind: "no-search-scope" },
            expected: { kind: "unavailable", reason: "noScope" },
            warnings: [],
        },
        {
            outcome: { kind: "all-unreadable", failures: ["denied"] },
            expected: { kind: "unavailable", reason: "unreadable" },
            warnings: ["denied"],
        },
        {
            outcome: { kind: "matches", paths: [], readFailures: ["partial"] },
            expected: { kind: "unavailable", reason: "notFound" },
            warnings: ["partial"],
        },
        {
            outcome: { kind: "matches", paths: ["/work/a.form"], readFailures: ["partial"] },
            expected: { kind: "loaded", content: '{"id":"Form_1"}' },
            warnings: ["partial"],
        },
        {
            outcome: {
                kind: "matches",
                paths: ["/work/a.form", "/work/b.form"],
                readFailures: ["partial"],
            },
            expected: { kind: "unavailable", reason: "ambiguous" },
            warnings: ["partial"],
        },
    ])(
        "classifies $outcome.kind and preserves search diagnostics",
        async ({ outcome, expected, warnings }) => {
            const { service, host, locator } = setup({ "/work/a.form": '{"id":"Form_1"}' });
            vi.spyOn(locator, "findDeclaringFiles").mockResolvedValue(outcome);
            expect(await service.read("Form_1", "/work/a.bpmn", true)).toEqual(expected);
            expect(host.notifier.logged("warning")).toEqual(warnings);
            expect(host.notifier.openedDocuments).toEqual([]);
        },
    );
    it("automatically reads a unique form without opening a picker", async () => {
        const { service, host } = setup({ "/work/a.form": '{"id":"Form_1"}' });
        expect(await service.read("Form_1", "/work/a.bpmn", true)).toEqual({
            kind: "loaded",
            content: '{"id":"Form_1"}',
        });
        expect(host.picker.prompts).toEqual([]);
    });

    it("silently declines ambiguous automatic previews without prompting", async () => {
        const { service, host } = setup(
            { "/work/a.form": '{"id":"Form_1"}', "/work/b.form": '{"id":"Form_1"}' },
            "/work/b.form",
        );
        expect((await service.read("Form_1", "/work/a.bpmn", true)).kind).toBe("unavailable");
        expect(host.picker.prompts).toEqual([]);
    });
    it("settles a form disappearing after resolution with retry feedback", async () => {
        const { service, host } = setup({ "/work/a.form": '{"id":"Form_1"}' });
        vi.spyOn(host.workspace, "readFile")
            .mockResolvedValueOnce('{"id":"Form_1"}')
            .mockRejectedValueOnce(new Error("deleted"));
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "unavailable",
            reason: "unreadable",
        });
        expect(host.notifier.loggedErrors[0].message).toBe("deleted");
    });
    it("rereads saved content without opening or modifying any document", async () => {
        const initial = '{"id":"Form_1","components":[]}';
        const updated = '{"id":"Form_1","components":[],"schemaVersion":19}';
        const { host, service } = setup({ "/work/a.form": initial });
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "loaded",
            content: initial,
        });
        await host.workspace.writeFile("/work/a.form", updated);
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "loaded",
            content: updated,
        });
        expect(await host.workspace.readFile("/work/a.form")).toBe(updated);
        expect(host.notifier.openedDocuments).toEqual([]);
    });

    it("uses the duplicate picker selection", async () => {
        const { service } = setup(
            {
                "/work/a.form": '{"id":"Form_1"}',
                "/work/b.form": '{"id":"Form_1","title":"chosen"}',
            },
            "/work/b.form",
        );
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "loaded",
            content: '{"id":"Form_1","title":"chosen"}',
        });
    });

    it.each<Record<string, string>>([
        {},
        { "/work/a.form": "invalid JSON" },
        { "/work/a.form": '{"id":"other"}' },
    ])("answers missing or invalid references without opening a document: %j", async (files) => {
        const { service, host } = setup(files);
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "unavailable",
            reason: "notFound",
        });
        expect(host.notifier.openedDocuments).toEqual([]);
    });

    it("settles cancellation instead of leaving a pending preview", async () => {
        const { service, host } = setup({
            "/work/a.form": '{"id":"Form_1"}',
            "/work/b.form": '{"id":"Form_1"}',
        });
        expect((await service.read("Form_1", "/work/a.bpmn")).kind).toBe("cancelled");
        expect(host.notifier.infos).toEqual([]);
        expect(host.notifier.warnings).toEqual([]);
        expect(host.notifier.errors).toEqual([]);
    });

    it("distinguishes unreadable candidates and logs failures", async () => {
        const { service, host } = setup({ "/work/a.form": '{"id":"Form_1"}' });
        vi.spyOn(host.workspace, "readFile").mockRejectedValue(new Error("denied"));
        expect(await service.read("Form_1", "/work/a.bpmn", true)).toMatchObject({
            kind: "unavailable",
            reason: "unreadable",
        });
        expect(host.notifier.logs).not.toEqual([]);
    });
});
