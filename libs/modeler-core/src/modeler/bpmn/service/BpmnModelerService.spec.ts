import { describe, expect, it, vi } from "vitest";

import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnModelerService } from "./BpmnModelerService";
import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import { NewModelEngine } from "../../../shared/domain/newModelEngine";
import { createTestHost, PickerAnswers, TestHost } from "../../../testing";

const PATH = "/work/diagram.bpmn";

// Real, valid documents so detection/version extraction run the production code.
const C8_DOC = BpmnDocument.empty("c8", "8.8.0").xml;
// Non-empty but carries no platform signal → `detectPlatform` throws.
const NO_PLATFORM_DOC =
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://x" id="d"><bpmn:process id="P"/></bpmn:definitions>';

function createService(content: string, answers: PickerAnswers = {}) {
    const host = createTestHost({ settings: { language: "de" }, answers });
    const editor = host.openEditor(PATH, content);
    const service = new BpmnModelerService(
        host.store,
        host.documents,
        host.picker,
        host.statusBar,
        host.notifier,
        host.settings,
    );
    service.registerSession(editor.id);
    return { service, host, editor };
}

function holdNextWrite(host: TestHost) {
    let finishWrite: (applied: boolean) => void = () => {};
    vi.spyOn(host.documents, "write").mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
            finishWrite = resolve;
        }),
    );
    return (applied: boolean) => finishWrite(applied);
}

describe("BpmnModelerService.display", () => {
    it("renders a valid document and shows its engine version", async () => {
        const { service, host, editor } = createService(C8_DOC);

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBe("c8");
        expect(msg.defaultMode).toBe("implement");
        expect(msg.locale).toBe("de");
        expect(host.statusBar.engineVersion).toEqual({ platform: "c8", version: "8.8.0" });
    });

    it("seeds an empty document with the picked platform before rendering", async () => {
        const { service, editor } = createService("", { newModelEngine: "c7" });

        await service.display(editor.id);

        expect(new BpmnDocument(editor.content).detectEngine()).toBe("c7");
        expect(editor.saveCount).toBe(1);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBe("c7");
        expect(msg.content).toBe(editor.content);
    });

    it("routes an untagged document to an engine-neutral render without rewriting it", async () => {
        const { service, host, editor } = createService(NO_PLATFORM_DOC);
        host.statusBar.showEngineVersion("c8", "8.8.0");

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBeUndefined();
        expect(msg.content).toBe(NO_PLATFORM_DOC);
        expect(host.statusBar.engineVersion).toBeUndefined();
        // No stamp-on-open: the untagged document is never written back.
        expect(editor.content).toBe(NO_PLATFORM_DOC);
        expect(editor.saveCount).toBe(0);
    });

    it("scaffolds an engine-neutral document when the neutral choice is picked", async () => {
        const { service, editor } = createService("", { newModelEngine: "neutral" });

        await service.display(editor.id);

        expect(editor.content).not.toBe("");
        expect(editor.content).not.toContain("modeler:executionPlatform");
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBeUndefined();
    });

    it("returns false without notifying when the editor is hidden", async () => {
        const { service, host, editor } = createService(C8_DOC);
        editor.hidden = true;

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.notifier.errors).toEqual([]);
    });

    it("returns false without notifying when the user cancels the platform prompt", async () => {
        const { service, host, editor } = createService("");

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.picker.prompts.map((prompt) => prompt.method)).toEqual(["pickNewModelEngine"]);
        expect(host.notifier.errors).toEqual([]);
    });

    it("notifies and returns false on an unexpected error", async () => {
        const { service, host, editor } = createService(C8_DOC);
        vi.spyOn(host.documents, "getContent").mockImplementation(() => {
            throw new Error("boom");
        });

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to display the BPMN Modeler.\nboom",
        ]);
    });

    it("skips the matching document-change echo while a sync write is pending", async () => {
        const { service, host, editor } = createService("<xml/>");

        // Hold the guard by leaving the sync write pending, then race a display.
        const finishWrite = holdNextWrite(host);
        const syncing = service.sync(editor.id, "<xml/>");

        const rendered = await service.display(editor.id);
        expect(rendered).toBe(false);
        expect(editor.posted).toEqual([]);

        finishWrite(true);
        await syncing;
    });

    it("renders and revisions a different host edit while a sync write is pending", async () => {
        const { service, host, editor } = createService("");
        const finishWrite = holdNextWrite(host);
        const syncing = service.sync(editor.id, "<webview/>", 0);
        editor.content = C8_DOC;

        expect(await service.display(editor.id, true)).toBe(true);
        expect(host.store.currentHostDocumentRevision(editor.id)).toBe(1);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.documentRevision).toBe(1);

        finishWrite(false);
        await syncing;
    });

    it("asks for the platform once when two displays of an empty document overlap", async () => {
        const { service, host, editor } = createService("");
        let pick: (engine: NewModelEngine) => void = () => {};
        const prompt = vi.spyOn(host.picker, "pickNewModelEngine").mockReturnValueOnce(
            new Promise<NewModelEngine>((resolve) => {
                pick = resolve;
            }),
        );

        const firstDisplay = service.display(editor.id);

        expect(await service.display(editor.id)).toBe(false);
        pick("c8");
        expect(await firstDisplay).toBe(true);
        expect(prompt).toHaveBeenCalledOnce();
        expect(editor.postedOfType<BpmnFileQuery>("BpmnFileQuery")).toHaveLength(1);
    });

    it("does not seed an empty document after the host revision changes during the prompt", async () => {
        const { service, host, editor } = createService("");
        let finishPick: (platform: NewModelEngine) => void = () => {};
        vi.spyOn(host.picker, "pickNewModelEngine").mockReturnValueOnce(
            new Promise((resolve) => {
                finishPick = resolve;
            }),
        );

        const displaying = service.display(editor.id);
        host.store.markHostDocumentUpdated(editor.id);
        finishPick("c7");

        expect(await displaying).toBe(false);
        expect(editor.content).toBe("");
        expect(editor.saveCount).toBe(0);
        expect(editor.posted).toEqual([]);
    });
});

describe("BpmnModelerService.sync", () => {
    it("writes the content and releases the guard so later renders proceed", async () => {
        const { service, editor } = createService(C8_DOC);

        const synced = await service.sync(editor.id, NO_PLATFORM_DOC);
        expect(synced).toBe(true);
        expect(editor.content).toBe(NO_PLATFORM_DOC);

        // Guard must have been released in the `finally`, so display is not skipped.
        await service.display(editor.id);
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });

    it("notifies, returns false, and still releases the guard on a write error", async () => {
        const { service, host, editor } = createService(C8_DOC);
        vi.spyOn(host.documents, "write").mockRejectedValueOnce(new Error("disk full"));

        const synced = await service.sync(editor.id, "<xml/>");
        expect(synced).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to sync the BPMN file.\ndisk full",
        ]);

        // The failed write must not leave the guard stuck, or rendering would
        // be permanently skipped.
        await service.display(editor.id);
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });

    it("rejects content exported from an older host document revision", async () => {
        const { service, editor } = createService(C8_DOC);
        await service.display(editor.id, true);

        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.documentRevision).toBe(1);
        expect(await service.sync(editor.id, "<stale/>", 0)).toBe(false);
        expect(editor.content).toBe(C8_DOC);
    });
});

describe("BpmnModelerService.changeEngineVersion", () => {
    it("writes the picked version, updates the status bar, and re-renders", async () => {
        const { service, host, editor } = createService(C8_DOC, { engineVersion: "8.5.0" });

        await service.changeEngineVersion(editor.id);

        expect(editor.content).toContain('modeler:executionPlatformVersion="8.5.0"');
        expect(host.statusBar.engineVersion).toEqual({ platform: "c8", version: "8.5.0" });
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });

    it("informs and returns false for an untagged diagram with no engine version", async () => {
        const { service, host, editor } = createService(NO_PLATFORM_DOC);

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.infos).toHaveLength(1);
        expect(host.picker.prompts).toEqual([]);
        expect(editor.content).toBe(NO_PLATFORM_DOC);
    });

    it("returns false without notifying when the version prompt is cancelled", async () => {
        const { service, host, editor } = createService(C8_DOC);

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.errors).toEqual([]);
    });

    it("does not apply a picked version to a replacement same-uri session", async () => {
        const { service, host, editor } = createService(C8_DOC);
        let finishPick: (version: string) => void = () => {};
        vi.spyOn(host.picker, "pickEngineVersion").mockReturnValueOnce(
            new Promise((resolve) => {
                finishPick = resolve;
            }),
        );

        const changing = service.changeEngineVersion(editor.id);
        const replacement = host.openEditor(PATH, C8_DOC);
        finishPick("8.5.0");

        expect(await changing).toBe(false);
        expect(editor.content).toBe(C8_DOC);
        expect(replacement.content).toBe(C8_DOC);
        expect(host.statusBar.engineVersion).toBeUndefined();
    });
});

describe("BpmnModelerService session lifecycle", () => {
    it("does not skip rendering for a disposed session", async () => {
        const { service, editor } = createService(C8_DOC);
        service.disposeSession(editor.id);

        await service.display(editor.id);

        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });
});
