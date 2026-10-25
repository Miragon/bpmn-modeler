import { FormEditor } from "@bpmn-io/form-js-editor";
import { Form } from "@bpmn-io/form-js-viewer";
import {
    asProtocolMessage,
    Command,
    createFlushResponder,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    Query,
} from "@miragon/bpmn-modeler-shared";

import { FormEditorApp } from "./app/FormEditorApp";
import { FORM_TEMPLATE } from "./app/formTemplate";
import type { FormHost } from "./app/host";
import { shouldHandleHostMessage } from "./app/hostMessage";

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing form webview element: ${id}`);
    return element as T;
}

export function bootstrap(host: FormHost): void {
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
        host.getState()?.mode,
    );

    const respondToFlush = createFlushResponder(app, (message) => host.postMessage(message));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void app.flushPendingSync();
    });
    window.addEventListener("message", (event: MessageEvent<Query | Command>) => {
        if (!shouldHandleHostMessage(event)) return;
        const query = asProtocolMessage(event.data);
        if (query.type === "FormFileQuery") {
            void app.load(query.content, query.documentRevision);
        } else if (query.type === "FormInputValuesQuery") {
            void app.setInputValues(query.content);
        } else if (
            query.type === "FlushDocumentQuery" ||
            query.type === "ReleaseDocumentFlushQuery"
        ) {
            void respondToFlush(query);
        }
    });
    host.postMessage(new GetFormFileCommand());
    host.postMessage(new GetFormInputValuesCommand());
}
