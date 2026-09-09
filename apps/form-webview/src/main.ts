import { FormEditor } from "@bpmn-io/form-js-editor";
import { Form } from "@bpmn-io/form-js-viewer";
import {
    Command,
    createFlushResponder,
    FormFileQuery,
    FormInputValuesQuery,
    FlushDocumentQuery,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    LogErrorCommand,
    Query,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import { FormEditorApp } from "./app/FormEditorApp";
import { FORM_TEMPLATE } from "./app/formTemplate";
import { getHostApi, WebviewState } from "./app/host";
import { shouldHandleHostMessage } from "./app/hostMessage";
import { ensureArrayToSorted, ensureUrlCanParse } from "./app/urlCompatibility";

ensureUrlCanParse();
ensureArrayToSorted();
const host = getHostApi();

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing form webview element: ${id}`);
    return element as T;
}

function initialMode(): WebviewState["mode"] {
    try {
        return host.getState().mode;
    } catch {
        host.setState({ mode: "edit" });
        return "edit";
    }
}

function bootstrap(): void {
    const container = requiredElement<HTMLElement>("app");
    container.innerHTML = FORM_TEMPLATE;

    const editorElement = requiredElement<HTMLElement>("form-editor");
    const previewElement = requiredElement<HTMLElement>("form-preview");
    const app = new FormEditorApp(
        new FormEditor({ container: editorElement }),
        new Form({ container: previewElement }),
        host,
        {
            editor: editorElement,
            preview: previewElement,
            error: requiredElement("form-error"),
            editButton: requiredElement("edit-view"),
            previewButton: requiredElement("preview-view"),
        },
        initialMode(),
    );

    const respondToFlush = createFlushResponder(app, (message) => host.postMessage(message));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void app.flushPendingSync();
    });
    window.addEventListener("message", (event: MessageEvent<Query | Command>) => {
        if (!shouldHandleHostMessage(event)) return;
        if (event.data.type === "FormFileQuery") {
            const query = event.data as FormFileQuery;
            void app.load(query.content, query.documentRevision);
        } else if (event.data.type === "FormInputValuesQuery") {
            void app.setInputValues((event.data as FormInputValuesQuery).content);
        } else if (
            event.data.type === "FlushDocumentQuery" ||
            event.data.type === "ReleaseDocumentFlushQuery"
        ) {
            void respondToFlush(event.data as FlushDocumentQuery | ReleaseDocumentFlushQuery);
        }
    });
    host.postMessage(new GetFormFileCommand());
    host.postMessage(new GetFormInputValuesCommand());
}

window.addEventListener("error", (event: ErrorEvent) => {
    host.postMessage(new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack));
});
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    host.postMessage(
        new LogErrorCommand(
            `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
            reason instanceof Error ? reason.stack : undefined,
        ),
    );
});
window.addEventListener("DOMContentLoaded", bootstrap);
