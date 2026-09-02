import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncDocumentCommand, UpdateFormOutputValuesCommand } from "@miragon/bpmn-modeler-shared";

import { FormEditorApp, FormEditorLike, FormViewerLike } from "./FormEditorApp";

const ORIGINAL = '{ "components": [], "type": "default", "id": "Form_1" }';
const IMPORTED = {
    components: [],
    type: "default",
    id: "Form_1",
    schemaVersion: 19,
};

class Editor implements FormEditorLike {
    schema = IMPORTED;
    handler: () => void = () => {};
    importSchema = vi.fn(async () => {
        this.handler();
        return { warnings: [] };
    });
    saveSchema = vi.fn(() => this.schema);
    on(_event: "changed", handler: () => void): void {
        this.handler = handler;
    }
}

class Viewer implements FormViewerLike {
    output: Record<string, unknown> = {};
    handlers = new Map<string, () => void>();
    importSchema = vi.fn().mockResolvedValue({ warnings: [] });
    _getSubmitData = vi.fn(() => this.output);

    on(
        event: "changed" | "formFieldInstance.added" | "formFieldInstance.removed",
        handler: () => void,
    ): void {
        this.handlers.set(event, handler);
    }

    emit(event: "changed" | "formFieldInstance.added" | "formFieldInstance.removed"): void {
        this.handlers.get(event)?.();
    }
}

function setup() {
    document.body.innerHTML = `
        <button id="edit"></button><button id="preview-button"></button>
        <div id="error" hidden></div><div id="editor"></div><div id="preview" hidden></div>`;
    const editor = new Editor();
    const viewer = new Viewer();
    const host = {
        state: { mode: "edit" as const },
        getState() {
            return this.state;
        },
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: vi.fn(),
    };
    const app = new FormEditorApp(editor, viewer, host, {
        editor: document.getElementById("editor")!,
        preview: document.getElementById("preview")!,
        error: document.getElementById("error")!,
        editButton: document.getElementById("edit") as HTMLButtonElement,
        previewButton: document.getElementById("preview-button") as HTMLButtonElement,
    });
    return { app, editor, viewer, host };
}

beforeEach(() => vi.useFakeTimers());

describe("FormEditorApp", () => {
    it("preserves source bytes until a visual edit changes the schema", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);
        editor.handler();
        await vi.runAllTimersAsync();

        expect(host.postMessage).not.toHaveBeenCalledWith(expect.any(SyncDocumentCommand));
        expect(await app.exportContent()).toBe(ORIGINAL);

        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();
        await vi.runAllTimersAsync();

        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2)),
        );
    });

    it("tags visual edits with the imported host document revision", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL, 7);
        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();
        await vi.runAllTimersAsync();

        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2), 7),
        );
    });

    it("posts a visual edit synchronously so immediate close cannot strand it", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL, 7);
        editor.schema = { ...IMPORTED, id: "Form_Closing" };

        editor.handler();

        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2), 7),
        );
        expect(app.hasPendingSync()).toBe(true);
    });

    it("does not represent a newer revision when its import fails", async () => {
        const { app, editor } = setup();
        await app.load(ORIGINAL, 1);
        editor.importSchema.mockRejectedValueOnce(new Error("invalid schema"));

        await app.load(ORIGINAL.replace("Form_1", "Form_2"), 2);

        expect(app.documentRevision()).toBe(1);
    });

    it("ignores a host query older than the latest received revision", async () => {
        const { app, editor } = setup();
        await app.load(ORIGINAL, 2);

        await app.load(ORIGINAL.replace("Form_1", "Form_Old"), 1);

        expect(editor.importSchema).toHaveBeenCalledTimes(1);
        expect(app.documentRevision()).toBe(2);
    });

    it("imports preview only when the schema changed", async () => {
        const { app, editor, viewer } = setup();
        await app.load(ORIGINAL);

        await app.setMode("preview");
        await app.setMode("edit");
        await app.setMode("preview");
        expect(viewer.importSchema).toHaveBeenCalledTimes(1);

        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();
        await app.setMode("edit");
        await app.setMode("preview");
        expect(viewer.importSchema).toHaveBeenCalledTimes(2);
    });

    it("reimports the preview with new form input values", async () => {
        const { app, viewer } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");

        await app.setInputValues('{ "customer": { "name": "Ada" } }');

        expect(viewer.importSchema).toHaveBeenLastCalledWith(IMPORTED, {
            customer: { name: "Ada" },
        });
    });

    it("publishes current submit data when preview values or instances change", async () => {
        const { app, viewer, host } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");

        viewer.output = { approved: true };
        viewer.emit("changed");
        viewer.output = { approved: true, reviewers: ["Ada"] };
        viewer.emit("formFieldInstance.added");
        viewer.output = { approved: true, reviewers: [] };
        viewer.emit("formFieldInstance.removed");

        expect(host.postMessage).toHaveBeenCalledWith(
            new UpdateFormOutputValuesCommand(
                JSON.stringify({ approved: true, reviewers: [] }, null, 2),
            ),
        );
    });

    it("publishes the first empty preview output as an authoritative reset", async () => {
        const { app, host } = setup();
        await app.load(ORIGINAL);

        await app.setMode("preview");

        expect(host.postMessage).toHaveBeenCalledWith(new UpdateFormOutputValuesCommand("{}"));
    });

    it("clears stale output when preview rendering fails", async () => {
        const { app, viewer, host } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");
        viewer.output = { approved: true };
        viewer.emit("changed");
        await app.setMode("edit");
        vi.mocked(viewer.importSchema).mockRejectedValueOnce(new Error("preview failed"));

        await app.setInputValues('{ "customer": "Ada" }');
        await app.setMode("preview");

        const outputMessages = host.postMessage.mock.calls
            .map(([message]) => message)
            .filter((message) => message instanceof UpdateFormOutputValuesCommand);
        expect(outputMessages.at(-1)).toEqual(new UpdateFormOutputValuesCommand("{}"));
    });

    it("serializes rapid input imports so the newest values win", async () => {
        const { app, viewer } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");
        viewer.importSchema.mockClear();
        let finishFirst: (result: { warnings: never[] }) => void = () => {};
        viewer.importSchema
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    finishFirst = resolve;
                }),
            )
            .mockResolvedValueOnce({ warnings: [] });

        const first = app.setInputValues('{ "customer": "Ada" }');
        await Promise.resolve();
        const second = app.setInputValues('{ "customer": "Grace" }');
        finishFirst({ warnings: [] });
        await Promise.all([first, second]);

        expect(viewer.importSchema).toHaveBeenLastCalledWith(IMPORTED, {
            customer: "Grace",
        });
    });

    it("reimports prior values after a superseded import changes the viewer", async () => {
        const { app, viewer } = setup();
        await app.load(ORIGINAL);
        await app.setInputValues('{ "customer": "Ada" }');
        await app.setMode("preview");
        viewer.importSchema.mockClear();
        let finishImport: (result: { warnings: never[] }) => void = () => {};
        viewer.importSchema.mockReturnValueOnce(
            new Promise((resolve) => {
                finishImport = resolve;
            }),
        );

        const changed = app.setInputValues('{ "customer": "Grace" }');
        await Promise.resolve();
        const restored = app.setInputValues('{ "customer": "Ada" }');
        finishImport({ warnings: [] });
        await Promise.all([changed, restored]);

        expect(viewer.importSchema).toHaveBeenCalledTimes(2);
        expect(viewer.importSchema).toHaveBeenLastCalledWith(IMPORTED, {
            customer: "Ada",
        });
    });

    it("does not republish an in-flight preview after the host form becomes invalid", async () => {
        const { app, viewer, host } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");
        viewer.output = { approved: true };
        viewer.emit("changed");
        let finishImport: (result: { warnings: never[] }) => void = () => {};
        viewer.importSchema.mockReturnValueOnce(
            new Promise((resolve) => {
                finishImport = resolve;
            }),
        );
        const refreshing = app.setInputValues('{ "customer": "Ada" }');
        await Promise.resolve();

        await app.load("not json");
        finishImport({ warnings: [] });
        await refreshing;
        viewer.emit("changed");

        const outputMessages = host.postMessage.mock.calls
            .map(([message]) => message)
            .filter((message) => message instanceof UpdateFormOutputValuesCommand);
        expect(outputMessages.at(-1)).toEqual(new UpdateFormOutputValuesCommand("{}"));
    });

    it("shows invalid JSON without writing fallback content", async () => {
        const { app, editor, host } = setup();
        await app.load("not json");

        expect(editor.importSchema).not.toHaveBeenCalled();
        expect(document.getElementById("error")?.hidden).toBe(false);
        expect(app.isReady()).toBe(false);
        expect(host.postMessage).not.toHaveBeenCalledWith(expect.any(SyncDocumentCommand));
    });

    it("reports a host update while its schema import is in flight", async () => {
        const { app, editor } = setup();
        let finishImport: (result: { warnings: never[] }) => void = () => {};
        editor.importSchema.mockReturnValueOnce(
            new Promise((resolve) => {
                finishImport = resolve;
            }),
        );

        const loading = app.load(ORIGINAL);
        expect(app.hasPendingHostUpdate()).toBe(true);

        finishImport({ warnings: [] });
        await loading;
        expect(app.hasPendingHostUpdate()).toBe(false);
    });

    it("serializes overlapping host imports and stays pending until both settle", async () => {
        const { app, editor } = setup();
        let finishFirst: (result: { warnings: never[] }) => void = () => {};
        let finishSecond: (result: { warnings: never[] }) => void = () => {};
        editor.importSchema
            .mockReset()
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    finishFirst = resolve;
                }),
            )
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    finishSecond = resolve;
                }),
            );

        const first = app.load(ORIGINAL);
        const second = app.load(ORIGINAL.replace("Form_1", "Form_2"));
        await Promise.resolve();

        expect(editor.importSchema).toHaveBeenCalledTimes(1);
        expect(app.hasPendingHostUpdate()).toBe(true);

        finishFirst({ warnings: [] });
        await first;
        await Promise.resolve();
        expect(editor.importSchema).toHaveBeenCalledTimes(2);
        expect(app.hasPendingHostUpdate()).toBe(true);

        finishSecond({ warnings: [] });
        await second;
        expect(app.hasPendingHostUpdate()).toBe(false);
    });

    it("exports the latest visual change while tracking pending delivery", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);
        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();

        expect(app.hasPendingSync()).toBe(true);
        app.cancelPendingSync();
        expect(app.hasPendingSync()).toBe(false);
        expect(await app.exportContent()).toBe(JSON.stringify(editor.schema, null, 2));
        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2)),
        );
    });

    it("does not duplicate an immediate sync when exporting the current content", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);
        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();
        const callsBeforeExport = host.postMessage.mock.calls.length;

        await app.exportContent();

        expect(host.postMessage).toHaveBeenCalledTimes(callsBeforeExport);
    });

    it("syncs a pending visual change before the webview is hidden", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);
        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();
        expect(host.postMessage).toHaveBeenCalledTimes(1);

        const flushing = app.flushPendingSync();

        expect(app.hasPendingSync()).toBe(false);
        expect(host.postMessage).toHaveBeenCalledTimes(2);
        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2)),
        );
        await flushing;
    });

    it("locks interaction while a destructive flush exports immediate sync state", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);
        editor.schema = { ...IMPORTED, id: "Form_Changed" };
        editor.handler();

        app.beginDestructiveFlush();

        expect(document.body.inert).toBe(true);
        expect(app.hasPendingSync()).toBe(true);

        await app.flushPendingSync();

        expect(app.hasPendingSync()).toBe(false);
        expect(host.postMessage).toHaveBeenCalledWith(
            new SyncDocumentCommand(JSON.stringify(editor.schema, null, 2)),
        );

        app.endDestructiveFlush();
        expect(document.body.inert).toBe(false);
    });

    it("posts every sustained visual edit without waiting for a timer", async () => {
        const { app, editor, host } = setup();
        await app.load(ORIGINAL);

        for (let index = 0; index < 8; index++) {
            editor.schema = { ...IMPORTED, id: `Form_${index}` };
            editor.handler();
        }

        expect(host.postMessage).toHaveBeenCalledTimes(8);
    });

    it("falls back to the ready editor when preview rendering fails", async () => {
        const { app, viewer, host } = setup();
        await app.load(ORIGINAL);
        vi.mocked(viewer.importSchema).mockRejectedValueOnce(new Error("preview failed"));

        await app.setMode("preview");

        expect(document.getElementById("error")?.hidden).toBe(false);
        expect(document.getElementById("editor")?.hidden).toBe(false);
        expect(document.getElementById("preview")?.hidden).toBe(true);
        expect(app.isReady()).toBe(true);
        expect(host.updateState).toHaveBeenLastCalledWith({ mode: "edit" });
    });

    it("reimports the last valid schema after a failed preview import", async () => {
        const { app, editor, viewer } = setup();
        await app.load(ORIGINAL);
        await app.setMode("preview");
        await app.setMode("edit");

        editor.schema = { ...IMPORTED, id: "Form_InvalidPreview" };
        vi.mocked(viewer.importSchema).mockRejectedValueOnce(new Error("preview failed"));
        await app.setMode("preview");

        editor.schema = IMPORTED;
        await app.setMode("preview");

        expect(viewer.importSchema).toHaveBeenCalledTimes(3);
        expect(document.getElementById("preview")?.hidden).toBe(false);
    });
});
