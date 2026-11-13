import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createInertLockGroup,
    FORM_INVALID_JSON_MESSAGE,
    FORM_SCHEMA_IMPORT_ERROR_MESSAGE,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import type {
    FormDocumentLoadListener,
    FormSchemaEditor,
    PendingEditorInput,
} from "../port/formDocument";
import { FormDocumentSession } from "./documentSession";

const ORIGINAL = '{ "components": [], "type": "default", "id": "Form_1" }';
const IMPORTED = {
    components: [],
    type: "default",
    id: "Form_1",
    schemaVersion: 19,
};

type ImportResult = { warnings: unknown[] };

/** form-js fires `changed` while it imports, so the fake does too. */
class Editor implements FormSchemaEditor {
    schema = IMPORTED;
    changed: () => void = () => undefined;
    importSchema = vi.fn(async (): Promise<ImportResult> => {
        this.changed();
        return { warnings: [] };
    });
    saveSchema = vi.fn(() => this.schema);

    edit(schema: typeof IMPORTED): void {
        this.schema = schema;
        this.changed();
    }
}

/** A field edit form-js's `debounce` service still holds. */
class EditorInput implements PendingEditorInput {
    private waiting: (() => void) | undefined;

    hold(apply: () => void): void {
        this.waiting = apply;
    }

    hasPending(): boolean {
        return this.waiting !== undefined;
    }

    flush(): void {
        const apply = this.waiting;
        this.waiting = undefined;
        apply?.();
    }
}

function deferredImport() {
    let finish!: (result: ImportResult) => void;
    const result = new Promise<ImportResult>((resolve) => {
        finish = resolve;
    });
    return { result, finish: () => finish({ warnings: [] }) };
}

function setup() {
    const editor = new Editor();
    const editorInput = new EditorInput();
    const host = { postMessage: vi.fn() };
    const page = { inert: false };
    const locks = createInertLockGroup(page);
    const session = new FormDocumentSession(editor, editorInput, host, {
        flush: locks.createLock(),
        hostImport: locks.createLock(),
    });
    editor.changed = () => session.syncChangedContent();
    const listener = {
        onArrived: vi.fn<FormDocumentLoadListener["onArrived"]>(),
        onImported: vi.fn<FormDocumentLoadListener["onImported"]>(async () => undefined),
        onFailed: vi.fn<FormDocumentLoadListener["onFailed"]>(),
    };
    const load = (content: string, documentRevision = 0) =>
        session.load(content, documentRevision, listener);
    const typeDebouncedEdit = (schema: typeof IMPORTED) =>
        editorInput.hold(() => editor.edit(schema));
    return { session, editor, host, page, listener, load, typeDebouncedEdit };
}

const serialized = (schema: object) => JSON.stringify(schema, null, 2);

beforeEach(() => vi.useFakeTimers());

describe("FormDocumentSession", () => {
    describe("host imports", () => {
        it("reports an imported document with the editor's warnings", async () => {
            const { session, editor, load, listener } = setup();
            editor.importSchema.mockResolvedValueOnce({ warnings: ["unknown field"] });

            await load(ORIGINAL, 1);

            expect(listener.onArrived).toHaveBeenCalledWith(false);
            expect(listener.onImported).toHaveBeenCalledWith(["unknown field"]);
            expect(session.holdsDocument).toBe(true);
            expect(session.isReady()).toBe(true);
        });

        it("tells a later document that it replaces the one it holds", async () => {
            const { load, listener } = setup();
            await load(ORIGINAL, 1);

            await load(ORIGINAL, 2);

            expect(listener.onArrived).toHaveBeenLastCalledWith(true);
        });

        it("drops the document on invalid JSON without importing or writing it", async () => {
            const { session, editor, host, load, listener } = setup();
            await load(ORIGINAL, 1);

            await load("not json", 2);

            expect(editor.importSchema).toHaveBeenCalledTimes(1);
            expect(listener.onFailed).toHaveBeenCalledWith(
                FORM_INVALID_JSON_MESSAGE,
                expect.any(SyntaxError),
            );
            expect(session.holdsDocument).toBe(false);
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("reports a failed schema import and restores interaction", async () => {
            const { session, editor, page, load, listener } = setup();
            const cause = new Error("bad schema");
            editor.importSchema.mockRejectedValueOnce(cause);

            await load(ORIGINAL, 1);

            expect(listener.onFailed).toHaveBeenCalledWith(FORM_SCHEMA_IMPORT_ERROR_MESSAGE, cause);
            expect(session.holdsDocument).toBe(false);
            expect(page.inert).toBe(false);
        });

        it("does not represent a newer revision when its import fails", async () => {
            const { session, editor, load } = setup();
            await load(ORIGINAL, 1);
            editor.importSchema.mockRejectedValueOnce(new Error("invalid schema"));

            await load(ORIGINAL.replace("Form_1", "Form_2"), 2);

            expect(session.documentRevision()).toBe(1);
        });

        it("ignores a host query older than the latest received revision", async () => {
            const { session, editor, load, listener } = setup();
            await load(ORIGINAL, 2);

            await load(ORIGINAL.replace("Form_1", "Form_Old"), 1);

            expect(editor.importSchema).toHaveBeenCalledTimes(1);
            expect(listener.onArrived).toHaveBeenCalledTimes(1);
            expect(session.documentRevision()).toBe(2);
        });

        it("reports neither outcome for an import a newer host document superseded", async () => {
            const { editor, load, listener } = setup();
            const first = deferredImport();
            editor.importSchema.mockReturnValueOnce(first.result);

            const superseded = load(ORIGINAL, 1);
            const current = load(ORIGINAL.replace("Form_1", "Form_2"), 2);
            first.finish();
            await Promise.all([superseded, current]);

            expect(listener.onImported).toHaveBeenCalledTimes(1);
            expect(listener.onFailed).not.toHaveBeenCalled();
        });

        it("reports a host update while its schema import is in flight", async () => {
            const { session, editor, load } = setup();
            const pending = deferredImport();
            editor.importSchema.mockReturnValueOnce(pending.result);

            const loading = load(ORIGINAL);
            expect(session.hasPendingHostUpdate()).toBe(true);

            pending.finish();
            await loading;
            expect(session.hasPendingHostUpdate()).toBe(false);
        });

        it("counts the page's own import step as part of the host update", async () => {
            const { session, load, listener } = setup();
            let pendingDuringImportStep: boolean | undefined;
            listener.onImported.mockImplementationOnce(async () => {
                pendingDuringImportStep = session.hasPendingHostUpdate();
            });

            await load(ORIGINAL);

            expect(pendingDuringImportStep).toBe(true);
        });

        it("serializes overlapping host imports and stays pending until both settle", async () => {
            const { session, editor, load } = setup();
            const first = deferredImport();
            const second = deferredImport();
            editor.importSchema
                .mockReset()
                .mockReturnValueOnce(first.result)
                .mockReturnValueOnce(second.result);

            const loadingFirst = load(ORIGINAL);
            const loadingSecond = load(ORIGINAL.replace("Form_1", "Form_2"));
            await Promise.resolve();

            expect(editor.importSchema).toHaveBeenCalledTimes(1);
            expect(session.hasPendingHostUpdate()).toBe(true);

            first.finish();
            await loadingFirst;
            await Promise.resolve();
            expect(editor.importSchema).toHaveBeenCalledTimes(2);
            expect(session.hasPendingHostUpdate()).toBe(true);

            second.finish();
            await loadingSecond;
            expect(session.hasPendingHostUpdate()).toBe(false);
        });
    });

    describe("interaction locks", () => {
        it("keeps interaction locked through host import after the destructive flush is released", async () => {
            const { session, editor, page, load } = setup();
            await load(ORIGINAL, 1);
            const pending = deferredImport();
            editor.importSchema.mockReturnValueOnce(pending.result);

            session.beginDestructiveFlush();
            const importing = load(ORIGINAL, 2);
            session.endDestructiveFlush();
            expect(page.inert).toBe(true);

            pending.finish();
            await importing;
            expect(page.inert).toBe(false);
        });

        it("does not unlock a destructive flush when host import finishes first", async () => {
            const { session, page, load } = setup();
            session.beginDestructiveFlush();

            await load(ORIGINAL, 1);
            expect(page.inert).toBe(true);

            session.endDestructiveFlush();
            expect(page.inert).toBe(false);
        });
    });

    describe("outbound sync", () => {
        it("preserves source bytes until a visual edit changes the schema", async () => {
            const { session, editor, host, load } = setup();
            await load(ORIGINAL);
            editor.edit(IMPORTED);
            await vi.runAllTimersAsync();

            expect(host.postMessage).not.toHaveBeenCalled();
            expect(await session.exportContent()).toBe(ORIGINAL);

            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            await vi.runAllTimersAsync();

            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema)),
            );
        });

        it("posts nothing before a document is imported", () => {
            const { session, editor, host } = setup();

            editor.edit({ ...IMPORTED, id: "Form_Early" });

            expect(host.postMessage).not.toHaveBeenCalled();
            expect(session.hasPendingSync()).toBe(false);
        });

        it("tags visual edits with the imported host document revision", async () => {
            const { editor, host, load } = setup();
            await load(ORIGINAL, 7);

            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            await vi.runAllTimersAsync();

            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema), 7),
            );
        });

        it("posts a visual edit synchronously so immediate close cannot strand it", async () => {
            const { session, editor, host, load } = setup();
            await load(ORIGINAL, 7);

            editor.edit({ ...IMPORTED, id: "Form_Closing" });

            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema), 7),
            );
            expect(session.hasPendingSync()).toBe(true);
        });

        it("ends the delivery guard once its grace period passes", async () => {
            const { session, editor, load } = setup();
            await load(ORIGINAL);

            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            await vi.runAllTimersAsync();

            expect(session.hasPendingSync()).toBe(false);
        });

        it("counts a posted visual edit as edited until the next host import", async () => {
            const { session, editor, load } = setup();
            await load(ORIGINAL, 1);
            expect(session.isEditedSinceHostImport()).toBe(false);

            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            expect(session.isEditedSinceHostImport()).toBe(true);

            await load(ORIGINAL, 2);
            expect(session.isEditedSinceHostImport()).toBe(false);
        });

        it("cancels the delivery guard when a newer host document arrives", async () => {
            const { session, editor, load } = setup();
            await load(ORIGINAL, 1);
            editor.edit({ ...IMPORTED, id: "Form_Changed" });

            const importing = load(ORIGINAL, 2);

            expect(session.hasPendingSync()).toBe(false);
            expect(session.hostUpdateVersion()).toBe(2);
            await importing;
        });

        it("posts every sustained visual edit without waiting for a timer", async () => {
            const { editor, host, load } = setup();
            await load(ORIGINAL);

            for (let index = 0; index < 8; index++) {
                editor.edit({ ...IMPORTED, id: `Form_${index}` });
            }

            expect(host.postMessage).toHaveBeenCalledTimes(8);
        });
    });

    describe("flush", () => {
        it("exports the latest visual change while tracking pending delivery", async () => {
            const { session, editor, host, load } = setup();
            await load(ORIGINAL);
            editor.edit({ ...IMPORTED, id: "Form_Changed" });

            expect(session.hasPendingSync()).toBe(true);
            session.cancelPendingSync();
            expect(session.hasPendingSync()).toBe(false);
            expect(await session.exportContent()).toBe(serialized(editor.schema));
            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema)),
            );
        });

        it("does not duplicate an immediate sync when exporting the current content", async () => {
            const { session, editor, host, load } = setup();
            await load(ORIGINAL);
            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            const callsBeforeExport = host.postMessage.mock.calls.length;

            await session.exportContent();

            expect(host.postMessage).toHaveBeenCalledTimes(callsBeforeExport);
        });

        it("syncs a pending visual change before the webview is hidden", async () => {
            const { session, editor, host, load } = setup();
            await load(ORIGINAL);
            editor.edit({ ...IMPORTED, id: "Form_Changed" });
            expect(host.postMessage).toHaveBeenCalledTimes(1);

            const flushing = session.flushPendingSync();

            expect(session.hasPendingSync()).toBe(false);
            expect(host.postMessage).toHaveBeenCalledTimes(2);
            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema)),
            );
            await flushing;
        });

        it("posts nothing when a flush finds no pending sync", async () => {
            const { session, host, load } = setup();
            await load(ORIGINAL);

            await session.flushPendingSync();

            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("reports a field edit the editor still debounces as a pending sync", async () => {
            const { session, load, typeDebouncedEdit } = setup();
            await load(ORIGINAL, 1);

            typeDebouncedEdit({ ...IMPORTED, id: "Form_Typed" });

            expect(session.hasPendingSync()).toBe(true);
        });

        it("applies a field edit the editor still debounces before it exports the form", async () => {
            const { session, host, load, typeDebouncedEdit } = setup();
            await load(ORIGINAL, 1);
            const typed = { ...IMPORTED, id: "Form_Typed" };
            typeDebouncedEdit(typed);

            const exported = await session.exportContent();

            expect(exported).toBe(serialized(typed));
            expect(host.postMessage).toHaveBeenCalledWith(new SyncDocumentCommand(exported, 1));
        });

        it("posts a field edit the editor still debounces when its pending sync is flushed", async () => {
            const { session, host, load, typeDebouncedEdit } = setup();
            await load(ORIGINAL, 1);
            const typed = { ...IMPORTED, id: "Form_Typed" };
            typeDebouncedEdit(typed);

            await session.flushPendingSync();

            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(typed), 1),
            );
            expect(session.hasPendingSync()).toBe(false);
        });

        it("locks interaction while a destructive flush exports immediate sync state", async () => {
            const { session, editor, host, page, load } = setup();
            await load(ORIGINAL);
            editor.edit({ ...IMPORTED, id: "Form_Changed" });

            session.beginDestructiveFlush();

            expect(page.inert).toBe(true);
            expect(session.hasPendingSync()).toBe(true);

            await session.flushPendingSync();

            expect(session.hasPendingSync()).toBe(false);
            expect(host.postMessage).toHaveBeenCalledWith(
                new SyncDocumentCommand(serialized(editor.schema)),
            );

            session.endDestructiveFlush();
            expect(page.inert).toBe(false);
        });
    });
});
