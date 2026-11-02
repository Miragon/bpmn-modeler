import { describe, expect, it, vi } from "vitest";

import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnModelerService } from "./BpmnModelerService";
import { BpmnDocument } from "../../../kernel/domain/BpmnDocument";
import { engineVersionPrompt } from "../../../kernel/domain/engineVersions";
import { newModelEnginePrompt } from "../../../kernel/domain/newModelEngine";
import { createTestHost, PromptAnswers, TestHost } from "../../../testing";

const PATH = "/work/diagram.bpmn";

// Real, valid documents so detection/version extraction run the production code.
const C8_DOC = BpmnDocument.empty("c8", "8.8.0").xml;
// Non-empty but carries no platform signal → `detectPlatform` throws.
const NO_PLATFORM_DOC =
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://x" id="d"><bpmn:process id="P"/></bpmn:definitions>';
// No `modeler:*` attributes: `detectEngine` falls back to the engine namespace.
const C7_NAMESPACE_ONLY_DOC =
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://x" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="d"><bpmn:process id="P"/></bpmn:definitions>';
// Camunda Modeler always writes `modeler:`; another tool may bind the namespace to `cm:`.
const CUSTOM_PREFIX_C8_DOC =
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://x" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:cm="http://camunda.org/schema/modeler/1.0" cm:executionPlatform="Camunda Cloud" cm:executionPlatformVersion="8.8.0" id="d"><bpmn:process id="P"/></bpmn:definitions>';
const VERSION_NOT_CHANGED =
    "The diagram changed while you picked a version, so its engine version was not changed. Try again.";

function createService(content: string, promptAnswers: PromptAnswers = {}) {
    const host = createTestHost({ settings: { language: "de" }, promptAnswers });
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

function holdNextChoice(host: TestHost) {
    let finishChoice: (value: unknown) => void = () => {};
    vi.spyOn(host.picker, "choose").mockImplementationOnce(
        <V>() =>
            new Promise<V | undefined>((resolve) => {
                finishChoice = (value) => resolve(value as V);
            }),
    );
    return (value: unknown) => finishChoice(value);
}

// engineVersionStatusView.spec pins the whole view; these rows pin which diagram's version shows.
function engineVersionShown(host: TestHost): string | undefined {
    return host.statusBar.views.engineVersion?.text;
}

function showEngineVersion(host: TestHost, text: string): void {
    host.statusBar.show("engineVersion", { text, tone: "neutral" });
}

describe("BpmnModelerService.display", () => {
    it("renders a valid document and shows its engine version", async () => {
        const { service, host, editor } = createService(C8_DOC);
        editor.active = true;

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBe("c8");
        expect(msg.defaultMode).toBe("implement");
        expect(msg.locale).toBe("de");
        expect(engineVersionShown(host)).toBe("Camunda 8 (8.8.0)");
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
        editor.active = true;
        showEngineVersion(host, "Camunda 8 (8.8.0)");

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        const [msg] = editor.postedOfType<BpmnFileQuery>("BpmnFileQuery");
        expect(msg.engine).toBeUndefined();
        expect(msg.content).toBe(NO_PLATFORM_DOC);
        expect(engineVersionShown(host)).toBeUndefined();
        // No stamp-on-open: the untagged document is never written back.
        expect(editor.content).toBe(NO_PLATFORM_DOC);
        expect(editor.saveCount).toBe(0);
    });

    it("leaves the focused editor's engine version alone when a background editor re-renders", async () => {
        const { service, host, editor } = createService(C8_DOC);
        editor.active = true;
        showEngineVersion(host, "Camunda 8 (8.8.0)");
        const background = host.openEditor("/work/other.bpmn", NO_PLATFORM_DOC);
        service.registerSession(background.id);

        const rendered = await service.display(background.id, true);

        expect(rendered).toBe(true);
        expect(background.postedOfType("BpmnFileQuery")).toHaveLength(1);
        expect(engineVersionShown(host)).toBe("Camunda 8 (8.8.0)");
    });

    it("does not report an error when the editor closes while its render is posted", async () => {
        const { service, host, editor } = createService(C8_DOC);
        editor.active = true;
        vi.spyOn(editor, "postMessage").mockImplementationOnce(async () => {
            host.store.unregister(editor.id, editor);
            return true;
        });

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        expect(host.notifier.errors).toEqual([]);
        expect(engineVersionShown(host)).toBeUndefined();
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

    it("leaves an empty document untouched and quiet when the user dismisses the platform prompt", async () => {
        const { service, host, editor } = createService("");

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.picker.prompts).toEqual([{ method: "choose", args: [newModelEnginePrompt()] }]);
        expect(editor.content).toBe("");
        expect(editor.saveCount).toBe(0);
        expect(editor.posted).toEqual([]);
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
        const pick = holdNextChoice(host);

        const firstDisplay = service.display(editor.id);

        expect(await service.display(editor.id)).toBe(false);
        pick("c8");
        expect(await firstDisplay).toBe(true);
        expect(host.picker.choose).toHaveBeenCalledOnce();
        expect(editor.postedOfType<BpmnFileQuery>("BpmnFileQuery")).toHaveLength(1);
    });

    it("does not seed an empty document after the host revision changes during the prompt", async () => {
        const { service, host, editor } = createService("");
        const finishPick = holdNextChoice(host);

        const displaying = service.display(editor.id);
        host.store.markHostDocumentUpdated(editor.id);
        finishPick("c7");

        expect(await displaying).toBe(false);
        expect(editor.content).toBe("");
        expect(editor.saveCount).toBe(0);
        expect(editor.posted).toEqual([]);
    });

    it("seeds a document a host change empties again during the prompt", async () => {
        const { service, host, editor } = createService("");
        const finishFirstPick = holdNextChoice(host);
        const firstDisplay = service.display(editor.id);

        editor.changeDocument("");
        const finishSecondPick = holdNextChoice(host);
        const secondDisplay = service.display(editor.id, true);
        finishFirstPick("c7");
        finishSecondPick("c8");

        expect(await firstDisplay).toBe(false);
        expect(await secondDisplay).toBe(true);
        expect(host.picker.choose).toHaveBeenCalledTimes(2);
        expect(new BpmnDocument(editor.content).detectEngine()).toBe("c8");
        expect(editor.saveCount).toBe(1);
    });

    it("seeds a document the host empties again under a host-owned revision during the prompt", async () => {
        const { service, host, editor } = createService("");
        const finishFirstPick = holdNextChoice(host);
        const firstDisplay = service.display(editor.id);

        // A host that owns the revision advances it before it displays the change.
        editor.changeDocument("");
        host.store.setHostDocumentRevision(editor.id, 2);
        const finishSecondPick = holdNextChoice(host);
        const secondDisplay = service.display(editor.id);
        finishFirstPick("c7");
        finishSecondPick("c8");

        expect(await firstDisplay).toBe(false);
        expect(await secondDisplay).toBe(true);
        expect(host.picker.choose).toHaveBeenCalledTimes(2);
        expect(new BpmnDocument(editor.content).detectEngine()).toBe("c8");
        expect(editor.saveCount).toBe(1);
        expect(editor.postedOfType<BpmnFileQuery>("BpmnFileQuery")).toMatchObject([
            { engine: "c8", documentRevision: 2 },
        ]);
    });

    it("does not prompt again on a webview reload after a host change superseded the prompt", async () => {
        const { service, host, editor } = createService("");
        const finishFirstPick = holdNextChoice(host);
        const firstDisplay = service.display(editor.id);
        editor.changeDocument("");
        host.store.setHostDocumentRevision(editor.id, 2);
        const finishSecondPick = holdNextChoice(host);
        const secondDisplay = service.display(editor.id);
        finishFirstPick("c7");
        expect(await firstDisplay).toBe(false);

        expect(await service.display(editor.id)).toBe(false);
        finishSecondPick("c8");

        expect(await secondDisplay).toBe(true);
        expect(host.picker.choose).toHaveBeenCalledTimes(2);
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
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        editor.active = true;

        await service.changeEngineVersion(editor.id);

        expect(editor.content).toContain('modeler:executionPlatformVersion="8.5.0"');
        expect(engineVersionShown(host)).toBe("Camunda 8 (8.5.0)");
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });

    it("stamps the picked version on a diagram tagged only by its namespace", async () => {
        const { service, host, editor } = createService(C7_NAMESPACE_ONLY_DOC, {
            c7EngineVersion: "7.22.0",
        });
        editor.becomeActive();

        await service.changeEngineVersion(editor.id);

        expect(editor.content).toContain('modeler:executionPlatformVersion="7.22.0"');
        expect(engineVersionShown(host)).toBe("Camunda 7 (7.22.0)");
        expect(host.notifier.infos).toEqual([]);
    });

    it("shows the picked version of a diagram that binds the modeler namespace to another prefix", async () => {
        const { service, host, editor } = createService(CUSTOM_PREFIX_C8_DOC, {
            c8EngineVersion: "8.5.0",
        });
        editor.becomeActive();

        await service.changeEngineVersion(editor.id);

        expect(editor.content).toContain('cm:executionPlatformVersion="8.5.0"');
        expect(engineVersionShown(host)).toBe("Camunda 8 (8.5.0)");
        expect(host.notifier.infos).toEqual([]);
    });

    it("tells the user when the host refuses the version write", async () => {
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        vi.spyOn(host.documents, "write").mockResolvedValueOnce(false);

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.infos).toEqual([VERSION_NOT_CHANGED]);
        expect(engineVersionShown(host)).toBeUndefined();
        expect(editor.content).toBe(C8_DOC);
        expect(editor.postedOfType("BpmnFileQuery")).toEqual([]);
    });

    it("tells the user when the diagram changes while the version is picked", async () => {
        const { service, host, editor } = createService(C8_DOC);
        const finishPick = holdNextChoice(host);

        const changing = service.changeEngineVersion(editor.id);
        host.store.markHostDocumentUpdated(editor.id);
        finishPick("8.5.0");

        expect(await changing).toBe(false);
        expect(host.notifier.infos).toEqual([VERSION_NOT_CHANGED]);
        expect(engineVersionShown(host)).toBeUndefined();
        expect(editor.content).toBe(C8_DOC);
    });

    it("shows the version when the host skips a write the document already holds", async () => {
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        editor.active = true;
        vi.spyOn(host.documents, "write").mockImplementationOnce(async (_editorId, content) => {
            editor.content = content;
            return false;
        });

        await service.changeEngineVersion(editor.id);

        expect(host.notifier.infos).toEqual([]);
        expect(engineVersionShown(host)).toBe("Camunda 8 (8.5.0)");
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(1);
    });

    it("stays quiet when the diagram changes after the version is written", async () => {
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        vi.spyOn(host.documents, "write").mockImplementationOnce(async () => {
            host.store.markHostDocumentUpdated(editor.id);
            return true;
        });

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.infos).toEqual([]);
        expect(host.notifier.errors).toEqual([]);
    });

    it("stays quiet when the editor closes while the version is written", async () => {
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        vi.spyOn(host.documents, "write").mockImplementationOnce(async () => {
            host.store.unregister(editor.id, editor);
            return false;
        });

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.infos).toEqual([]);
    });

    it("stays quiet when the editor closes while the version is picked", async () => {
        const { service, host, editor } = createService(C8_DOC);
        const finishPick = holdNextChoice(host);

        const changing = service.changeEngineVersion(editor.id);
        host.store.unregister(editor.id, editor);
        finishPick("8.5.0");

        expect(await changing).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.infos).toEqual([]);
        expect(editor.content).toBe(C8_DOC);
    });

    it("leaves a diagram already at the picked version untouched and quiet", async () => {
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.8.0" });

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.infos).toEqual([]);
        expect(host.notifier.errors).toEqual([]);
        expect(editor.content).toBe(C8_DOC);
    });

    it("writes the picked version but leaves the focused diagram's engine item alone", async () => {
        // The command targets the store's pointer, which can sit on a blurred diagram.
        const { service, host, editor } = createService(C8_DOC, { c8EngineVersion: "8.5.0" });
        host.openEditor(
            "/work/focused.bpmn",
            BpmnDocument.empty("c7", "7.22.0").xml,
        ).becomeActive();
        showEngineVersion(host, "Camunda 7 (7.22.0)");

        await service.changeEngineVersion(editor.id);

        expect(editor.content).toContain('modeler:executionPlatformVersion="8.5.0"');
        expect(engineVersionShown(host)).toBe("Camunda 7 (7.22.0)");
    });

    it("informs and returns false for an untagged diagram with no engine version", async () => {
        const { service, host, editor } = createService(NO_PLATFORM_DOC);

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.infos).toHaveLength(1);
        expect(host.picker.prompts).toEqual([]);
        expect(editor.content).toBe(NO_PLATFORM_DOC);
    });

    it("leaves the diagram untouched and quiet when the user dismisses the version prompt", async () => {
        const { service, host, editor } = createService(C8_DOC);

        const result = await service.changeEngineVersion(editor.id);

        expect(result).toBe(false);
        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [engineVersionPrompt("c8")] },
        ]);
        expect(editor.content).toBe(C8_DOC);
        expect(editor.posted).toEqual([]);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.infos).toEqual([]);
    });

    it("does not apply a picked version to a replacement same-uri session", async () => {
        const { service, host, editor } = createService(C8_DOC);
        const finishPick = holdNextChoice(host);

        const changing = service.changeEngineVersion(editor.id);
        const replacement = host.openEditor(PATH, C8_DOC);
        finishPick("8.5.0");

        expect(await changing).toBe(false);
        expect(editor.content).toBe(C8_DOC);
        expect(replacement.content).toBe(C8_DOC);
        expect(engineVersionShown(host)).toBeUndefined();
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
