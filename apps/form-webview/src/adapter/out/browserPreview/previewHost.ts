import { type FormEditorCommand, MockHostApi, type Query } from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../../port/formHost";
import { routePreviewCommand } from "./previewCommands";

/**
 * The browser preview's host: answers the Form editor's commands with
 * synthetic `MessageEvent`s, as the command table in `previewCommands.ts`
 * routes them.
 */
export class PreviewHost extends MockHostApi<WebviewState, FormEditorCommand> {
    override postMessage(message: FormEditorCommand): void {
        routePreviewCommand(message, { reply });
    }
}

function reply(query: Query): void {
    window.dispatchEvent(new MessageEvent("message", { data: query }));
}
