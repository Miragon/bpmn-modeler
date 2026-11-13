import { FormEditor } from "@bpmn-io/form-js-editor";
import { Form } from "@bpmn-io/form-js-viewer";
import {
    Command,
    createFlushResponder,
    createInertLockGroup,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    Query,
} from "@miragon/bpmn-modeler-shared";
import { createFlushableDebounceInput } from "@miragon/bpmn-modeler-types";

import { FormEditorApp } from "../adapter/in/FormEditorApp";
import { numericValidationModule } from "../adapter/in/numericValidationModule";
import { FORM_TEMPLATE } from "../adapter/in/formTemplate";
import { routeFormHostMessage } from "../adapter/in/hostMessageRouter";
import type { FormHost } from "../port/formHost";
import { FormDocumentSession } from "../service/documentSession";

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
    const formEditor = new FormEditor({
        container: editorElement,
        additionalModules: [{ debounce: ["value", editorInput] }, numericValidationModule],
    });
    const session = new FormDocumentSession(
        formEditor,
        editorInput,
        host,
        createInertLockGroup(document.body),
    );
    const app = new FormEditorApp(
        formEditor,
        new Form({ container: previewElement }),
        host,
        {
            editor: editorElement,
            preview: previewElement,
            error: requiredElement("form-error"),
            editButton: requiredElement("edit-view"),
            previewButton: requiredElement("preview-view"),
        },
        session,
        host.getState()?.mode,
    );

    const respondToFlush = createFlushResponder(session, (message) => host.postMessage(message));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void session.flushPendingSync();
    });
    window.addEventListener("message", (event: MessageEvent<Query | Command>) =>
        routeFormHostMessage(event, app, respondToFlush),
    );
    host.postMessage(new GetFormFileCommand());
    host.postMessage(new GetFormInputValuesCommand());
}
