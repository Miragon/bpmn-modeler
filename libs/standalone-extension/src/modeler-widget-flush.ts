import type { Widget } from "@theia/core/lib/browser";
import type { CommandService } from "@theia/core/lib/common/command";

const FLUSH_DOCUMENT_COMMAND = "bpmn-modeler.flushDocument";
const MODELER_VIEW_TYPES = new Set(["bpmn-modeler.bpmn", "bpmn-modeler.dmn"]);

export function isModelerWidget(widget: Widget): widget is Widget & {
    resource: { toString(): string };
    viewType: string;
} {
    const candidate = widget as Widget & {
        resource?: { toString(): string };
        viewType?: string;
    };
    return (
        !!candidate.viewType && MODELER_VIEW_TYPES.has(candidate.viewType) && !!candidate.resource
    );
}

export async function flushModelerWidget(
    commands: CommandService,
    widget: Widget,
): Promise<boolean> {
    if (!isModelerWidget(widget)) {
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
