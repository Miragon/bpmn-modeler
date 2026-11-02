import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type DocumentFlushedCommand,
    FlushDocumentQuery,
    FormFileQuery,
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
    return { flushReplies };
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

async function typeInto(entryId: string, value: string): Promise<void> {
    const input = await vi.waitFor(() => {
        const element = document.querySelector<HTMLInputElement>(
            `#bio-properties-panel-${entryId}`,
        );
        expect(element).not.toBeNull();
        return element!;
    });
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("form webview with the real form-js editor", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        document.body.innerHTML = '<div id="app"></div>';
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("saves a number typed into the properties panel while form-js still debounces it", async () => {
        const { flushReplies } = bootstrapWithRealFormJs();
        dispatch(new FormFileQuery(FORM, 1));
        await selectField("Field_1");

        await typeInto("minLength", "5");
        dispatch(new FlushDocumentQuery(7));

        await vi.waitFor(() => expect(flushReplies()).toHaveLength(1));
        const [reply] = flushReplies();
        expect(reply.status).toBe("flushed");
        const saved = JSON.parse(reply.content!) as {
            components: [{ validate?: { minLength?: number } }];
        };
        expect(saved.components[0].validate?.minLength).toBe(5);
    });
});
