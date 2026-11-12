import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type DocumentFlushedCommand,
    FlushDocumentQuery,
    FormFileQuery,
    ReleaseDocumentFlushQuery,
    type SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import { bootstrap } from "./bootstrap";

// jsdom lacks the observers the form-js editor installs. They stay stubbed for
// the whole file: Preact runs the editor's effects after a test has finished.
class NoopObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

const FORM = JSON.stringify({
    type: "default",
    id: "Form_1",
    components: [{ type: "textfield", id: "Field_1", key: "name", label: "Name" }],
});

type Posted = { type: string } & Record<string, unknown>;
type SavedField = {
    validate?: Record<string, string | number | boolean>;
    defaultValue?: number;
    decimalDigits?: number;
};

function formWithField(field: Record<string, unknown>): string {
    return JSON.stringify({
        type: "default",
        id: "Form_1",
        components: [{ id: "Field_1", key: "value", label: "Value", ...field }],
    });
}

function savedField(content: string): SavedField {
    return (JSON.parse(content) as { components: SavedField[] }).components[0];
}

function bootstrapWithRealFormJs() {
    const posted: Posted[] = [];
    bootstrap({
        getState: () => ({ mode: "edit" }),
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: (message) => posted.push(message as unknown as Posted),
    });
    const flushReplies = () =>
        posted.filter(
            (message): message is Posted & DocumentFlushedCommand =>
                message.type === "DocumentFlushedCommand",
        );
    const syncCommands = () =>
        posted.filter(
            (message): message is Posted & SyncDocumentCommand =>
                message.type === "SyncDocumentCommand",
        );
    return { flushReplies, posted, syncCommands };
}

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

async function selectField(id: string): Promise<void> {
    const field = await vi.waitFor(() => {
        const element = document.querySelector<HTMLElement>(`.fjs-element[data-id="${id}"]`);
        expect(element).not.toBeNull();
        return element!;
    });
    field.click();
}

async function typeInto(entryId: string, value: string): Promise<HTMLInputElement> {
    const input = await vi.waitFor(() => {
        const element = document.querySelector<HTMLInputElement>(
            `#bio-properties-panel-${entryId}`,
        );
        expect(element).not.toBeNull();
        return element!;
    });
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return input;
}

async function flushField(flushReplies: () => DocumentFlushedCommand[]): Promise<SavedField> {
    dispatch(new FlushDocumentQuery(7));
    await vi.waitFor(() => expect(flushReplies()).toHaveLength(1));
    const [reply] = flushReplies();
    expect(reply.status).toBe("flushed");
    return savedField(reply.content!);
}

describe("form webview with the real form-js editor", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        document.body.innerHTML = '<div id="app"></div>';
        document.body.inert = false;
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("saves a string bound while form-js still debounces the focused properties input", async () => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(FORM, 1));
        await selectField("Field_1");

        await typeInto("minLength", "5");
        expect((await flushField(flushReplies)).validate?.minLength).toBe("5");
    });

    it.each([
        ["textfield", "maxLength", "20"],
        ["number", "min", "5"],
        ["number", "max", "20"],
        ["number", "min", "0"],
        ["number", "min", "-2.5"],
    ])("saves a focused %s %s bound %s as a string", async (type, bound, value) => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(formWithField({ type }), 1));
        await selectField("Field_1");

        await typeInto(bound, value);

        expect((await flushField(flushReplies)).validate?.[bound]).toBe(value);
    });

    it("syncs a focused numeric bound as a string after normal input debounce", async () => {
        // Number and FEEL inputs debounce in sequence; don't race the wall clock.
        vi.useFakeTimers();
        const { flushReplies, syncCommands } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(formWithField({ type: "number" }), 1));
        await selectField("Field_1");
        await vi.runAllTimersAsync();

        const minimum = await typeInto("min", "-2.5");
        expect(document.activeElement).toBe(minimum);
        expect(syncCommands()).toHaveLength(0);

        await vi.runAllTimersAsync();
        expect(syncCommands()).not.toHaveLength(0);
        expect(savedField(syncCommands().at(-1)!.content).validate?.min).toBe("-2.5");
        expect(flushReplies()).toHaveLength(0);
    });

    it("saves blurred and still-focused numeric bounds with the same string type", async () => {
        vi.useFakeTimers();
        const { flushReplies, syncCommands } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(formWithField({ type: "number" }), 1));
        await selectField("Field_1");
        await vi.runAllTimersAsync();

        const minimum = await typeInto("min", "5");
        minimum.blur();
        await vi.runAllTimersAsync();
        expect(syncCommands()).not.toHaveLength(0);
        expect(savedField(syncCommands().at(-1)!.content).validate?.min).toBe("5");
        await typeInto("max", "20");

        expect((await flushField(flushReplies)).validate).toMatchObject({ min: "5", max: "20" });
    });

    it("preserves an existing FEEL bound when editing its numeric sibling", async () => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(
            new FormFileQuery(
                formWithField({
                    type: "number",
                    validate: { min: "= lowerLimit + 1" },
                }),
                1,
            ),
        );
        await selectField("Field_1");

        await typeInto("max", "20");

        expect((await flushField(flushReplies)).validate).toMatchObject({
            min: "= lowerLimit + 1",
            max: "20",
        });
    });

    it.each([
        ["textfield", "minLength"],
        ["textfield", "maxLength"],
        ["number", "min"],
        ["number", "max"],
    ])("removes a cleared %s %s bound instead of saving an empty string", async (type, bound) => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(formWithField({ type, validate: { [bound]: "5" } }), 1));
        await selectField("Field_1");

        await typeInto(bound, "");

        expect((await flushField(flushReplies)).validate ?? {}).not.toHaveProperty(bound);
    });

    it("does not rewrite legacy numeric validation when opening and flushing without edits", async () => {
        const { flushReplies, syncCommands } = bootstrapWithRealFormJs();
        const content = formWithField({ type: "number", validate: { min: 0, max: 20 } });
        dispatch(new FormFileQuery(content, 1));
        await selectField("Field_1");

        dispatch(new FlushDocumentQuery(7));
        await vi.waitFor(() => expect(flushReplies()).toHaveLength(1));
        expect(flushReplies()[0].status).toBe("clean");
        expect(flushReplies()[0].content).toBeUndefined();
        expect(syncCommands()).toHaveLength(0);
    });

    it("normalizes legacy sibling bounds but keeps numeric settings and required boolean when editing validation", async () => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(
            new FormFileQuery(
                formWithField({
                    type: "number",
                    defaultValue: 1.5,
                    decimalDigits: 2,
                    validate: { min: 0, required: true },
                }),
                1,
            ),
        );
        await selectField("Field_1");

        await typeInto("max", "20");

        expect(await flushField(flushReplies)).toMatchObject({
            defaultValue: 1.5,
            decimalDigits: 2,
            validate: { min: "0", max: "20", required: true },
        });
    });

    it.each([
        ["Camunda Cloud", "8.8.0"],
        ["Camunda Cloud", "8.9.0"],
        ["Camunda Cloud", "8.10.0"],
        ["Camunda Platform", "7"],
    ])(
        "keeps %s/%s after host reload and subsequent visual edits",
        async (executionPlatform, executionPlatformVersion) => {
            const { flushReplies, posted } = bootstrapWithRealFormJs();
            const source = JSON.stringify({
                ...JSON.parse(FORM),
                schemaVersion: 18,
                executionPlatform,
                executionPlatformVersion,
            });
            dispatch(new FormFileQuery(source, 2));
            await selectField("Field_1");
            dispatch(new FlushDocumentQuery(8, true));
            await vi.waitFor(() => expect(flushReplies()).toHaveLength(1));
            expect(flushReplies()[0].status).toBe("clean");
            expect(posted.filter((message) => message.type === "SyncDocumentCommand")).toEqual([]);
            dispatch(new ReleaseDocumentFlushQuery(8));
            await vi.waitFor(() => expect(document.body.inert).toBe(false));

            await typeInto("minLength", "6");
            dispatch(new FlushDocumentQuery(9, true));
            await vi.waitFor(() => expect(flushReplies()).toHaveLength(2));
            const reply = flushReplies()[1];
            expect(reply.documentRevision).toBe(2);
            expect(JSON.parse(reply.content!)).toMatchObject({
                executionPlatform,
                executionPlatformVersion,
                components: [{ validate: { minLength: "6" } }],
            });
            dispatch(new ReleaseDocumentFlushQuery(9));
        },
    );
});
