import { afterEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    FormFileQuery,
} from "@miragon/bpmn-modeler-shared";

import { DocumentFlushService } from "../../../editorSession/service/DocumentFlushService";
import { DocumentRenderParticipant } from "../../../editorSession/service/DocumentRenderParticipant";
import { PendingEditsFlush } from "../../../editorSession/service/PendingEditsFlush";
import { createTestHost, TestHost } from "../../../testing";
import { formPlatformPrompt, formVersionPrompt } from "../domain/formEngine";
import { FormModelerService } from "./FormModelerService";
import { JsonFormTextEdits } from "../adapter/out/JsonFormTextEdits";

const PATH = "/work/request.form";
const FORM = `{
  "schemaVersion": 18,
  "components" : [ { "key": "name", "label": "Original", "type": "textfield" } ],
  "executionPlatform": "Camunda Cloud",
  "executionPlatformVersion": "8.8.0",
  "type": "default", "id": "Form_Request",
  "custom": { "preserve": true }
}
`;
const ANSWERS = { formExecutionPlatform: "c7", c7FormEngineVersion: "7" };

async function createSelection(content = FORM, promptAnswers: Record<string, unknown> = ANSWERS) {
    const host = createTestHost({ promptAnswers });
    const flushes = new DocumentFlushService(host.store, host.notifier);
    const pendingEdits = new PendingEditsFlush(host.store, flushes, host.notifier);
    const service = new FormModelerService(host.store, host.documents, host.notifier, {
        picker: host.picker,
        pendingEdits,
        textEdits: new JsonFormTextEdits(),
    });
    pendingEdits.serve(".form", service);
    const editor = await host.openSession(
        PATH,
        [new DocumentRenderParticipant(service, ".form", host.notifier)],
        { content },
    );
    return { host, editor, service, flushes, pendingEdits };
}

type Selection = Awaited<ReturnType<typeof createSelection>>;

async function replyToFlush(
    { editor, flushes }: Selection,
    content?: string,
    status: "clean" | "flushed" | "unavailable" = content === undefined ? "clean" : "flushed",
) {
    await vi.waitFor(() => {
        expect(editor.postedOfType("FlushDocumentQuery")).toHaveLength(1);
    });
    const [query] = editor.postedOfType<FlushDocumentQuery>("FlushDocumentQuery");
    expect(query.destructive).toBe(true);
    flushes.handleReply(new DocumentFlushedCommand(query.token, content, status, 0), editor.id);
}

function holdNextChoice(host: TestHost, step: "platform" | "version" = "platform") {
    let finishChoice: (value: unknown) => void = () => {};
    const choose = host.picker.choose.bind(host.picker);
    const choosing = vi.spyOn(host.picker, "choose");
    if (step === "version") choosing.mockImplementationOnce(choose);
    choosing.mockImplementationOnce(
        <V>() =>
            new Promise<V | undefined>((resolve) => {
                finishChoice = (value) => resolve(value as V);
            }),
    );
    return (value: unknown) => finishChoice(value);
}

afterEach(() => vi.restoreAllMocks());

describe("Form platform and version selection", () => {
    it("explains how to recover invalid JSON without prompting, flushing or changing it", async () => {
        const { service, host, editor } = await createSelection("not json");

        expect(await service.changeEngineVersion(editor.id)).toBe(false);
        expect(host.notifier.infos).toEqual([
            "The form contains invalid JSON. Open the raw JSON editor to fix it.",
        ]);
        expect(host.picker.prompts).toEqual([]);
        expect(editor.posted).toEqual([]);
        expect(editor.content).toBe("not json");
        expect(editor.saveCount).toBe(0);
    });

    it.each(["platform", "version"] as const)(
        "keeps an unrelated visual sync arriving while the %s picker is open",
        async (step) => {
            const selection = await createSelection();
            const { service, host, editor } = selection;
            const finishChoice = holdNextChoice(host, step);
            const changing = service.changeEngineVersion(editor.id);
            await vi.waitFor(() =>
                expect(host.picker.choose).toHaveBeenCalledTimes(step === "platform" ? 1 : 2),
            );
            const visualEdit = FORM.replace('"Original"', '"Debounced label"');
            expect(await service.sync(editor.id, visualEdit, 0)).toBe(true);
            expect(host.store.currentHostDocumentRevision(editor.id)).toBe(0);
            finishChoice(step === "platform" ? "c7" : "7");
            await replyToFlush(selection);

            expect(await changing).toBe(true);
            expect(editor.content).toBe(
                visualEdit
                    .replace('"Camunda Cloud"', '"Camunda Platform"')
                    .replace('"8.8.0"', '"7"'),
            );
            expect(editor.postedOfType("FormFileQuery")).toEqual([
                new FormFileQuery(editor.content, 1),
            ]);
            expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
            expect(editor.saveCount).toBe(0);
        },
    );

    it("keeps a queued sync interleaved between flush completion and the metadata-write queue", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        const interleaved = FORM.replace('"Original"', '"Queued visual edit"');
        const enqueue = host.store.runInEditorQueue.bind(host.store);
        vi.spyOn(host.store, "runInEditorQueue").mockImplementationOnce(
            <T>(editorId: string, task: () => T | Promise<T>): Promise<T | undefined> => {
                void enqueue(editorId, () => service.sync(editorId, interleaved, 0));
                return enqueue(editorId, task);
            },
        );
        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection);

        expect(await changing).toBe(false);
        expect(editor.content).toBe(interleaved);
        expect(editor.postedOfType("FormFileQuery")).toEqual([]);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
        expect(editor.saveCount).toBe(0);
    });

    it("does not reload stale metadata or leak the lock when a host edit arrives while the write completes", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        let finishWrite!: () => void;
        const heldWrite = new Promise<void>((resolve) => {
            finishWrite = resolve;
        });
        const write = host.documents.write.bind(host.documents);
        vi.spyOn(host.documents, "write").mockImplementationOnce(async (...args) => {
            const written = await write(...args);
            await heldWrite;
            return written;
        });
        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection);
        await vi.waitFor(() =>
            expect(JSON.parse(editor.content).executionPlatformVersion).toBe("7"),
        );
        const hostEdit = FORM.replace('"Original"', '"Concurrent host edit"');
        editor.changeDocument(hostEdit);
        finishWrite();

        expect(await changing).toBe(false);
        expect(editor.content).toBe(hostEdit);
        expect(editor.postedOfType("FormFileQuery")).toEqual([new FormFileQuery(hostEdit, 1)]);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
        expect(host.store.currentHostDocumentRevision(editor.id)).toBe(1);
        expect(editor.saveCount).toBe(0);
    });

    it.each([
        '{ "id": "Missing", "schemaVersion": 18, "components": [] }',
        FORM.replace('"Camunda Cloud"', '"Other"').replace('"8.8.0"', '"99"'),
    ])(
        "replaces missing or unsupported metadata only after an explicit complete choice",
        async (source) => {
            const selection = await createSelection(source);
            const { service, editor } = selection;
            const changing = service.changeEngineVersion(editor.id);
            await replyToFlush(selection);
            expect(await changing).toBe(true);
            expect(JSON.parse(editor.content)).toEqual({
                ...JSON.parse(source),
                executionPlatform: "Camunda Platform",
                executionPlatformVersion: "7",
            });
            expect(editor.saveCount).toBe(0);
        },
    );

    it.each(["refused", "failed"] as const)(
        "releases the destructive lock after a %s metadata write",
        async (failure) => {
            const selection = await createSelection();
            const { service, host, editor } = selection;
            if (failure === "refused") editor.refusesWrites = true;
            else vi.spyOn(host.documents, "write").mockRejectedValueOnce(new Error("write failed"));
            const changing = service.changeEngineVersion(editor.id);
            await replyToFlush(selection);
            expect(await changing).toBe(false);
            expect(editor.content).toBe(FORM);
            expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
            expect(editor.postedOfType("FormFileQuery")).toEqual([]);
            expect(editor.saveCount).toBe(0);
        },
    );

    it("rejects source changes arriving while the destructive flush is pending", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        const changing = service.changeEngineVersion(editor.id);
        await vi.waitFor(() => expect(editor.postedOfType("FlushDocumentQuery")).toHaveLength(1));
        const edited = FORM.replace('"Original"', '"Concurrent source"');
        editor.changeDocument(edited);
        host.store.markHostDocumentUpdated(editor.id);
        await replyToFlush(selection);
        expect(await changing).toBe(false);
        expect(editor.content).toBe(edited);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
    });

    it("does not force a metadata write to a replacement session after a flush reply", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection);
        const replacement = host.openEditor(PATH, FORM);
        expect(await changing).toBe(false);
        expect(editor.content).toBe(FORM);
        expect(replacement.content).toBe(FORM);
        expect(replacement.posted).toEqual([]);
    });

    it("commits both fields in one unsaved source-preserving write and reloads at a newer revision", async () => {
        const selection = await createSelection();
        const { service, editor, host } = selection;
        const writes: string[] = [];
        editor.onDidChangeDocument(() => writes.push(editor.content));

        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection);
        expect(await changing).toBe(true);

        const expected = FORM.replace('"Camunda Cloud"', '"Camunda Platform"').replace(
            '"8.8.0"',
            '"7"',
        );
        expect(editor.content).toBe(expected);
        expect(writes).toEqual([expected]);
        expect(editor.saveCount).toBe(0);
        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [formPlatformPrompt()] },
            { method: "choose", args: [formVersionPrompt("c7")] },
        ]);
        const [reload] = editor.postedOfType<FormFileQuery>("FormFileQuery");
        expect(reload).toEqual(new FormFileQuery(expected, 1));
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
        expect(await service.sync(editor.id, FORM, 0)).toBe(false);
        expect(editor.content).toBe(expected);
    });

    it.each([
        [{}, 1],
        [{ formExecutionPlatform: "c7" }, 2],
        [{ formExecutionPlatform: "c8", c8FormEngineVersion: "8.8.0" }, 2],
    ] as const)(
        "does not flush, write or reload on cancellation or the existing pair %j",
        async (answers, promptCount) => {
            const { service, editor, host } = await createSelection(FORM, answers);

            expect(await service.changeEngineVersion(editor.id)).toBe(false);
            expect(host.picker.prompts).toHaveLength(promptCount);
            expect(editor.content).toBe(FORM);
            expect(editor.posted).toEqual([]);
            expect(editor.saveCount).toBe(0);
            expect(host.notifier.errors).toEqual([]);
            expect(host.notifier.infos).toEqual([]);
        },
    );

    it.each([
        FORM.replace('"Camunda Cloud"', '"Other"').replace('"8.8.0"', '"99"'),
        '{ "schemaVersion": 18, "components": [], "id": "Missing" }',
    ])(
        "does not normalize unsupported or missing metadata on display or cancellation",
        async (content) => {
            const { service, editor } = await createSelection(content, {});

            expect(await service.display(editor.id)).toBe(true);
            expect(await service.changeEngineVersion(editor.id)).toBe(false);
            expect(editor.content).toBe(content);
            expect(editor.posted).toEqual([new FormFileQuery(content)]);
            expect(editor.saveCount).toBe(0);
        },
    );

    it("patches the just-flushed visual edits rather than the pre-picker source", async () => {
        const selection = await createSelection();
        const { service, editor } = selection;
        const visualEdit = FORM.replace('"Original"', '"Pending input"');

        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection, visualEdit);

        expect(await changing).toBe(true);
        expect(editor.content).toBe(
            visualEdit.replace('"Camunda Cloud"', '"Camunda Platform"').replace('"8.8.0"', '"7"'),
        );
        expect(editor.saveCount).toBe(0);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
    });

    it("leaves the document unchanged when the webview cannot confirm a flush", async () => {
        const selection = await createSelection();
        const { service, editor } = selection;

        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection, undefined, "unavailable");

        expect(await changing).toBe(false);
        expect(editor.content).toBe(FORM);
        expect(editor.postedOfType("FormFileQuery")).toEqual([]);
        expect(editor.saveCount).toBe(0);
    });

    it("does not overwrite metadata changed in the flush", async () => {
        const selection = await createSelection();
        const { service, editor } = selection;
        const changedMetadata = FORM.replace('"8.8.0"', '"8.9.0"');

        const changing = service.changeEngineVersion(editor.id);
        await replyToFlush(selection, changedMetadata);

        expect(await changing).toBe(false);
        expect(editor.content).toBe(changedMetadata);
        expect(editor.postedOfType("FormFileQuery")).toEqual([]);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toHaveLength(1);
    });

    it.each(["source", "revision", "replacement", "closed"] as const)(
        "declines a stale selection after a %s change while picking",
        async (change) => {
            const { service, host, editor } = await createSelection();
            const finishChoice = holdNextChoice(host);
            const changing = service.changeEngineVersion(editor.id);
            let expected = FORM;
            if (change === "source") {
                expected = FORM.replace('"Original"', '"Source edit"');
                editor.changeDocument(expected);
            } else if (change === "revision") {
                host.store.markHostDocumentUpdated(editor.id);
            } else if (change === "replacement") {
                host.openEditor(PATH, FORM);
            } else {
                host.store.unregister(editor.id, editor);
            }
            finishChoice("c7");

            expect(await changing).toBe(false);
            expect(editor.content).toBe(expected);
            expect(editor.posted).toEqual(
                change === "source" ? [new FormFileQuery(expected, 1)] : [],
            );
            expect(editor.saveCount).toBe(0);
        },
    );

    it("keeps the captured editor as target when another Form gains focus", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        const finishChoice = holdNextChoice(host);
        const changing = service.changeEngineVersion(editor.id);
        const other = host.openEditor("/work/other.form", FORM, { focused: true });
        finishChoice("c7");
        await replyToFlush(selection);

        expect(await changing).toBe(true);
        expect(JSON.parse(editor.content).executionPlatformVersion).toBe("7");
        expect(other.content).toBe(FORM);
        expect(other.posted).toEqual([]);
    });

    it("prevents overlapping selectors for one editor session", async () => {
        const selection = await createSelection();
        const { service, host, editor } = selection;
        const finishChoice = holdNextChoice(host);
        const first = service.changeEngineVersion(editor.id);

        expect(await service.changeEngineVersion(editor.id)).toBe(false);
        expect(host.picker.choose).toHaveBeenCalledOnce();
        finishChoice("c7");
        await replyToFlush(selection);
        expect(await first).toBe(true);
    });
});
