import { MockHostApi, type Query, type TemplateEditorCommand } from "@miragon/bpmn-modeler-shared";

import { routePreviewCommand } from "./previewCommands";

/**
 * The browser preview's host: answers the template editor's commands with
 * synthetic `MessageEvent`s, as the command table in `previewCommands.ts`
 * routes them.
 */
export class PreviewHost extends MockHostApi<unknown, TemplateEditorCommand> {
    override postMessage(message: TemplateEditorCommand): void {
        routePreviewCommand(message, { search: window.location.search, reply });
    }
}

function reply(query: Query): void {
    window.dispatchEvent(new MessageEvent("message", { data: query }));
}
