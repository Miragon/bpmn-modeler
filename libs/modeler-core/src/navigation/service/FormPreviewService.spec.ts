import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { ReferencedModelLocator } from "./ReferencedModelLocator";
import { FormPreviewService } from "./FormPreviewService";

function setup(files: Record<string, string>, selected?: string) {
    const host = createTestHost({
        folders: ["/work"],
        files,
        answers: { referencedModel: selected },
    });
    const service = new FormPreviewService(
        new ReferencedModelLocator(host.workspace, host.notifier),
        host.workspace,
        host.picker,
    );
    return { host, service };
}

describe("form preview reads", () => {
    it("settles a form disappearing after resolution with retry feedback", async () => {
        const { service, host } = setup({ "/work/a.form": '{"id":"Form_1"}' });
        vi.spyOn(host.workspace, "readFile")
            .mockResolvedValueOnce('{"id":"Form_1"}')
            .mockRejectedValueOnce(new Error("deleted"));
        expect(await service.read("Form_1", "/work/a.bpmn")).toEqual({
            kind: "unavailable",
            message: expect.stringContaining("could not be read"),
        });
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
            message: expect.any(String),
        });
        expect(host.notifier.openedDocuments).toEqual([]);
    });

    it("settles cancellation instead of leaving a pending preview", async () => {
        const { service } = setup({
            "/work/a.form": '{"id":"Form_1"}',
            "/work/b.form": '{"id":"Form_1"}',
        });
        expect((await service.read("Form_1", "/work/a.bpmn")).kind).toBe("unavailable");
    });
});
