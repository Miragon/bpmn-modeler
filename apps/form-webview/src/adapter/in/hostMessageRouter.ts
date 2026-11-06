import {
    asProtocolMessage,
    type Command,
    type FlushQuery,
    isFlushQuery,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import type { FormEditorApp } from "./FormEditorApp";
import { shouldHandleHostMessage } from "./hostMessage";

type FormMessageApp = Pick<FormEditorApp, "load" | "setInputValues">;

type FlushResponder = (query: FlushQuery) => Promise<void>;

export function routeFormHostMessage(
    event: MessageEvent<Query | Command>,
    app: FormMessageApp,
    respondToFlush: FlushResponder,
): void {
    if (!shouldHandleHostMessage(event)) return;
    const query = asProtocolMessage(event.data);
    if (query.type === "FormFileQuery") {
        void app.load(query.content, query.documentRevision);
    } else if (query.type === "FormInputValuesQuery") {
        void app.setInputValues(query.content);
    } else if (isFlushQuery(query)) {
        void respondToFlush(query);
    }
}
