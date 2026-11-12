import { describe, expect, it, vi } from "vitest";
import { createTestHost } from "../../testing";
import { EngineVersionSelectionService } from "./EngineVersionSelectionService";

function setup() {
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const bpmn = vi.fn(async (_id: string) => true);
    const form = vi.fn(async (_id: string) => false);
    const service = new EngineVersionSelectionService(host.store, host.documents, {
        ".bpmn": bpmn,
        ".form": form,
    });
    return { host, editor, bpmn, form, service };
}

describe("engine version selection dispatch", () => {
    it.each(["/work/model.bpmn", "/work/model.BPMN", "/work/request.form", "/work/request.FORM"])(
        "uses the authoritative document path %s, not the editor URI or focus",
        async (path) => {
            const { host, editor, bpmn, form, service } = setup();
            host.openEditor("/work/other.form", "", { focused: true });
            vi.spyOn(host.documents, "getFilePath").mockReturnValue(path);
            const isForm = path.toLowerCase().endsWith(".form");
            expect(await service.changeEngineVersion(editor.id)).toBe(!isForm);
            expect(isForm ? form : bpmn).toHaveBeenCalledExactlyOnceWith(editor.id);
            expect(isForm ? bpmn : form).not.toHaveBeenCalled();
        },
    );

    it.each(["/work/decision.dmn", "/work/template.json", "/work/unknown.txt"])(
        "declines an unregistered format %s",
        async (path) => {
            const { host, bpmn, form, service } = setup();
            const editor = host.openEditor(path);
            expect(await service.changeEngineVersion(editor.id)).toBe(false);
            expect(bpmn).not.toHaveBeenCalled();
            expect(form).not.toHaveBeenCalled();
        },
    );

    it("declines a host's unavailable capability", async () => {
        const { host, bpmn } = setup();
        const editor = host.openEditor("/work/request.form");
        const service = new EngineVersionSelectionService(host.store, host.documents, {
            ".bpmn": bpmn,
        });
        expect(await service.changeEngineVersion(editor.id)).toBe(false);
        expect(bpmn).not.toHaveBeenCalled();
    });

    it("does not read the path of a closed editor", async () => {
        const { host, editor, bpmn, service } = setup();
        host.store.unregister(editor.id, editor);
        const path = vi.spyOn(host.documents, "getFilePath");
        expect(await service.changeEngineVersion(editor.id)).toBe(false);
        expect(path).not.toHaveBeenCalled();
        expect(bpmn).not.toHaveBeenCalled();
    });

    it("forwards the selected handler's failure unchanged", async () => {
        const { editor, bpmn, form, service } = setup();
        const failure = new Error("selection failed");
        bpmn.mockRejectedValueOnce(failure);
        await expect(service.changeEngineVersion(editor.id)).rejects.toBe(failure);
        expect(bpmn).toHaveBeenCalledExactlyOnceWith(editor.id);
        expect(form).not.toHaveBeenCalled();
    });
});
