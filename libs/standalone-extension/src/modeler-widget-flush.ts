import type { Widget } from "@theia/core/lib/browser";
import type { CommandService } from "@theia/core/lib/common/command";

export const FLUSH_DOCUMENT_COMMAND = "bpmn-modeler.flushDocument";
export const MODELER_CUSTOM_EDITOR_FACTORY_ID = "plugin-custom-editor";
const MODELER_VIEW_TYPES = new Set(["bpmn-modeler.bpmn", "bpmn-modeler.dmn"]);

export function isModelerViewType(viewType: unknown): viewType is string {
    return typeof viewType === "string" && MODELER_VIEW_TYPES.has(viewType);
}

export function isModelerWidget(widget: Widget): widget is Widget & {
    resource: { toString(): string };
    viewType: string;
} {
    const candidate = widget as Widget & {
        resource?: { toString(): string };
        viewType?: string;
    };
    return isModelerViewType(candidate.viewType) && !!candidate.resource;
}

export function hasLiveModelerWebview(
    widget: Widget,
): widget is Widget & { element: HTMLIFrameElement } {
    return !!(widget as Widget & { element?: HTMLIFrameElement }).element;
}

export async function flushModelerWidget(
    commands: CommandService,
    widget: Widget,
): Promise<boolean> {
    if (!isModelerWidget(widget)) {
        return true;
    }
    if (!hasLiveModelerWebview(widget)) {
        return true;
    }

    // Moving the iframe reloads it, so the host buffer must receive pending XML first.
    return (
        (await commands.executeCommand<boolean>(
            FLUSH_DOCUMENT_COMMAND,
            widget.resource.toString(),
            widget.viewType,
        )) === true
    );
}
