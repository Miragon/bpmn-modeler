import { FormEditor } from "@bpmn-io/form-js-editor";
import { Form } from "@bpmn-io/form-js-viewer";
import {
    Command,
    createFlushResponder,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    Query,
} from "@miragon/bpmn-modeler-shared";
import { createFlushableDebounceInput } from "@miragon/bpmn-modeler-types";

import { FormEditorApp } from "../adapter/in/FormEditorApp";
import { FORM_TEMPLATE } from "../adapter/in/formTemplate";
import { routeFormHostMessage } from "../adapter/in/hostMessageRouter";
import type { FormHost } from "../port/formHost";

const FORM_JS_DEFAULT_DEBOUNCE_MS = 300;

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
    const editorInput = createFlushableDebounceInput(FORM_JS_DEFAULT_DEBOUNCE_MS);
    const app = new FormEditorApp(
        new FormEditor({
            container: editorElement,
            additionalModules: [{ debounce: ["value", editorInput] }],
        }),
        new Form({ container: previewElement }),
        host,
        {
            editor: editorElement,
            preview: previewElement,
            error: requiredElement("form-error"),
            editButton: requiredElement("edit-view"),
            previewButton: requiredElement("preview-view"),
        },
        editorInput,
        host.getState()?.mode,
    );

    const respondToFlush = createFlushResponder(app, (message) => host.postMessage(message));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void app.flushPendingSync();
    });
    window.addEventListener("message", (event: MessageEvent<Query | Command>) =>
        routeFormHostMessage(event, app, respondToFlush),
    );
    host.postMessage(new GetFormFileCommand());
    host.postMessage(new GetFormInputValuesCommand());
}
