import type { DiagramElementLike } from "./candidates";
import type { ElementIdsService } from "./ElementIdsService";
import { followsChange } from "./followName";

interface EventBusLike {
    on(
        event: "commandStack.shape.replace.postExecuted",
        listener: (event: { context: ReplaceContext }) => void,
    ): void;
    on(event: string, listener: (event: { context: NameChangeContext }) => void): void;
}

interface NameChangeContext {
    readonly element: DiagramElementLike;
    readonly oldLabel?: string;
    readonly properties?: Record<string, unknown>;
    readonly oldProperties?: Record<string, unknown>;
    readonly moddleElement?: unknown;
}

interface ReplaceContext {
    readonly oldShape: DiagramElementLike;
    readonly newShape: DiagramElementLike;
}

/**
 * Renames an ID along with its element's name or type while the setting is on.
 * It runs inside the changing command, so one undo reverts the change and the ID together.
 */
export class FollowNameBehavior {
    static $inject = ["eventBus", "elementIds"];

    constructor(
        eventBus: EventBusLike,
        private readonly elementIds: ElementIdsService,
    ) {
        eventBus.on("commandStack.element.updateLabel.postExecute", ({ context }) => {
            this.follow(context.element, context.oldLabel);
        });
        eventBus.on("commandStack.element.updateProperties.postExecute", ({ context }) => {
            if (context.properties && "name" in context.properties) {
                this.follow(context.element, context.oldProperties?.name);
            }
        });
        eventBus.on("commandStack.element.updateModdleProperties.postExecute", ({ context }) => {
            if (
                context.properties &&
                "name" in context.properties &&
                context.moddleElement === context.element.businessObject
            ) {
                this.follow(context.element, context.oldProperties?.name);
            }
        });
        // After bpmn-js hands the old ID to the new shape, which it does at priority 1500.
        eventBus.on("commandStack.shape.replace.postExecuted", ({ context }) => {
            const { oldShape, newShape } = context;
            this.follow(newShape, newShape.businessObject?.name, oldShape.businessObject?.$type);
        });
    }

    private follow(element: DiagramElementLike, oldName: unknown, oldType?: string): void {
        const { followName, style } = this.elementIds.getSettings();
        const target = (element.labelTarget as DiagramElementLike | undefined) ?? element;
        const businessObject = target.businessObject;
        if (!followName || businessObject?.id === undefined) {
            return;
        }
        const change = {
            id: businessObject.id,
            oldName: typeof oldName === "string" && oldName !== "" ? oldName : undefined,
            oldType: oldType ?? businessObject.$type,
            style,
        };
        if (followsChange(change)) {
            this.elementIds.renameFromName(target);
        }
    }
}
