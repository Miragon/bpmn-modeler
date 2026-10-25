import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    FlushDocumentQuery,
    FormFileQuery,
    FormInputValuesQuery,
    HostApiImpl,
    type Command,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import packageJson from "../package.json";
import type { FormHost, WebviewState } from "./app/host";
import { bootstrap } from "./bootstrap";

const mocks = vi.hoisted(() => {
    const editor = {
        importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
        saveSchema: vi.fn((): Record<string, unknown> => ({})),
        on: vi.fn(),
    };
    const viewer = {
        importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
        on: vi.fn(),
        _getSubmitData: vi.fn(() => ({})),
    };

    return {
        editor,
        dedicatedEditor: vi.fn(function () {
            return editor;
        }),
        dedicatedViewer: vi.fn(function () {
            return viewer;
        }),
        aggregateEditor: vi.fn(function () {
            return editor;
        }),
        aggregateViewer: vi.fn(function () {
            return viewer;
        }),
    };
});

vi.mock("@bpmn-io/form-js-editor", () => ({ FormEditor: mocks.dedicatedEditor }));
vi.mock("@bpmn-io/form-js-viewer", () => ({ Form: mocks.dedicatedViewer }));
vi.mock("@bpmn-io/form-js", () => ({
    FormEditor: mocks.aggregateEditor,
    Form: mocks.aggregateViewer,
}));

type Posted = { type: string } & Record<string, unknown>;

function fakeHost(savedState: WebviewState = { mode: "edit" }) {
    return {
        getState: vi.fn(() => savedState),
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: vi.fn(),
    };
}

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

const sentOfType = (host: { postMessage: ReturnType<typeof vi.fn> }, type: string): Posted[] =>
    host.postMessage.mock.calls
        .map(([message]) => message as Posted)
        .filter((message) => message.type === type);

const pressed = (id: string) => document.getElementById(id)!.getAttribute("aria-pressed");

describe("form webview bootstrap", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    let documentAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        documentAddEventListener = vi.spyOn(document, "addEventListener");
        document.body.innerHTML = '<div id="app"></div>';
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        for (const [type, listener, options] of documentAddEventListener.mock.calls) {
            document.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
        mocks.editor.saveSchema.mockReturnValue({});
        Object.defineProperty(document, "visibilityState", {
            value: "visible",
            configurable: true,
        });
        document.body.innerHTML = "";
    });

    it("declares the editor and viewer packages directly", () => {
        const editorVersion = packageJson.dependencies["@bpmn-io/form-js-editor"];
        const viewerVersion = packageJson.dependencies["@bpmn-io/form-js-viewer"];

        expect(editorVersion).toBeDefined();
        expect(viewerVersion).toBe(editorVersion);
        expect(packageJson.dependencies).not.toHaveProperty("@bpmn-io/form-js");
    });

    it("creates the visual editor and preview from their dedicated packages", () => {
        bootstrap(fakeHost() as never);

        expect(mocks.dedicatedEditor).toHaveBeenCalledWith({
            container: document.getElementById("form-editor"),
        });
        expect(mocks.dedicatedViewer).toHaveBeenCalledWith({
            container: document.getElementById("form-preview"),
        });
        expect(mocks.aggregateEditor).not.toHaveBeenCalled();
        expect(mocks.aggregateViewer).not.toHaveBeenCalled();
    });

    it("requests the form and the current ephemeral input values", () => {
        const host = fakeHost();

        bootstrap(host as never);

        expect(host.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
            "GetFormFileCommand",
            "GetFormInputValuesCommand",
        ]);
    });

    it("fails loudly when the host page lacks the app container", () => {
        document.body.innerHTML = "";

        expect(() => bootstrap(fakeHost() as never)).toThrow("Missing form webview element: app");
    });

    describe("initial mode", () => {
        it("opens a first-ever form in edit mode against the real host API", () => {
            let persisted: WebviewState | undefined;
            vi.stubGlobal("acquireVsCodeApi", () => ({
                getState: () => persisted,
                setState: (state: WebviewState) => {
                    persisted = state;
                },
                postMessage: vi.fn(),
            }));
            const host: FormHost = new HostApiImpl<WebviewState, Command | Query>();

            bootstrap(host);

            expect(persisted).toEqual({ mode: "edit" });
            expect(pressed("edit-view")).toBe("true");
        });

        it("reopens a form in the preview it was left in", () => {
            const host = fakeHost({ mode: "preview" });

            bootstrap(host as never);

            expect(host.setState).not.toHaveBeenCalled();
            expect(pressed("preview-view")).toBe("true");
        });
    });

    describe("host messages", () => {
        it("loads a form document into the visual editor", async () => {
            bootstrap(fakeHost() as never);

            dispatch(new FormFileQuery('{"components":[]}', 3));

            await vi.waitFor(() =>
                expect(mocks.editor.importSchema).toHaveBeenCalledWith({ components: [] }),
            );
        });

        it("reports input values that are not valid JSON", async () => {
            const host = fakeHost();
            bootstrap(host as never);

            dispatch(new FormInputValuesQuery("not json"));

            await vi.waitFor(() =>
                expect(sentOfType(host, "LogErrorCommand")).toEqual([
                    expect.objectContaining({
                        message: expect.stringContaining(
                            "The form input values contain invalid JSON.",
                        ),
                    }),
                ]),
            );
        });

        it("ignores a message whose payload has the wrong shape", async () => {
            bootstrap(fakeHost() as never);

            dispatch({ type: "FormFileQuery", content: 42 });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(mocks.editor.importSchema).not.toHaveBeenCalled();
        });

        it("refuses a flush until a form is loaded, then returns the edited form", async () => {
            const host = fakeHost();
            bootstrap(host as never);

            dispatch(new FlushDocumentQuery(9));
            await vi.waitFor(() =>
                expect(sentOfType(host, "DocumentFlushedCommand")).toHaveLength(1),
            );
            dispatch(new FormFileQuery('{"components":[]}', 3));
            await vi.waitFor(() => expect(mocks.editor.importSchema).toHaveBeenCalled());
            await new Promise((resolve) => setTimeout(resolve, 0));
            mocks.editor.saveSchema.mockReturnValue({ components: [{ type: "textfield" }] });
            const [, onEditorChanged] = mocks.editor.on.mock.calls[0];
            onEditorChanged();
            dispatch(new FlushDocumentQuery(10));

            await vi.waitFor(() =>
                expect(sentOfType(host, "DocumentFlushedCommand")).toHaveLength(2),
            );
            expect(sentOfType(host, "DocumentFlushedCommand")).toEqual([
                expect.objectContaining({ token: 9, status: "unavailable" }),
                expect.objectContaining({
                    token: 10,
                    status: "flushed",
                    content: expect.stringContaining("textfield"),
                    documentRevision: 3,
                }),
            ]);
        });
    });

    it("re-sends the pending edit when the webview is hidden", async () => {
        const host = fakeHost();
        bootstrap(host as never);
        dispatch(new FormFileQuery('{"components":[]}'));
        await vi.waitFor(() => expect(mocks.editor.importSchema).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 0));
        mocks.editor.saveSchema.mockReturnValue({ components: [{ type: "textfield" }] });
        mocks.editor.on.mock.calls[0][1]();

        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));

        expect(sentOfType(host, "SyncDocumentCommand")).toHaveLength(2);
    });
});
