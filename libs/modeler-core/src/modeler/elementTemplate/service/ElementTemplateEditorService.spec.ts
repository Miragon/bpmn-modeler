import { describe, expect, it, vi } from "vitest";

import { ElementTemplateFileQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost, InMemorySettings } from "../../../testing";
import { ElementTemplateEditorService } from "./ElementTemplateEditorService";

const PATH = "/work/.camunda/element-templates/status.json";
const TEMPLATE = '{"$schema":"…/zeebe-element-templates-json-schema/…","id":"status"}';

function createService(content: string) {
    const host = createTestHost();
    const editor = host.openEditor(PATH, content);
    const settings = new InMemorySettings({ language: "de" });
    const service = new ElementTemplateEditorService(
        host.store,
        host.documents,
        settings,
        host.notifier,
    );
    service.registerSession(editor.id);
    return { service, host, editor };
}

describe("ElementTemplateEditorService", () => {
    it.each([
        ["a template", TEMPLATE],
        ["an empty file", ""],
        ["broken JSON", '{ "id": '],
    ])("sends %s to the preview as it is, without writing", async (_, content) => {
        const { service, editor } = createService(content);

        expect(await service.display(editor.id)).toBe(true);
        expect(editor.posted).toEqual([new ElementTemplateFileQuery(content, 0, "de")]);
        expect(editor.content).toBe(content);
        expect(editor.saveCount).toBe(0);
    });

    it("sends each host edit with the document's revision", async () => {
        const { service, editor } = createService(TEMPLATE);
        await service.display(editor.id);

        editor.content = '{"id":"edited"}';
        expect(await service.display(editor.id, true)).toBe(true);

        expect(editor.posted.at(-1)).toEqual(
            new ElementTemplateFileQuery('{"id":"edited"}', 1, "de"),
        );
    });

    it("stays quiet when the preview is hidden", async () => {
        const { service, host, editor } = createService(TEMPLATE);
        editor.hidden = true;

        expect(await service.display(editor.id)).toBe(false);
        expect(host.notifier.errors).toEqual([]);
    });

    it("reports any other failure", async () => {
        const { service, host, editor } = createService(TEMPLATE);
        vi.spyOn(host.store, "postMessage").mockRejectedValueOnce(new Error("channel closed"));

        expect(await service.display(editor.id)).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to display the element template preview.\nchannel closed",
        ]);
    });
});
