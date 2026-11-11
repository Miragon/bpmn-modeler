import type { DiagramElementLike } from "./candidates";
import type { ElementIdsService } from "./ElementIdsService";
import { followsNameChange } from "./followName";

interface EventBusLike {
    on(event: string, listener: (event: { context: NameChangeContext }) => void): void;
}

interface NameChangeContext {
    readonly element: DiagramElementLike;
    readonly oldLabel?: string;
    readonly properties?: Record<string, unknown>;
    readonly oldProperties?: Record<string, unknown>;
    readonly moddleElement?: unknown;
}

/**
 * Renames an ID along with its element's name while the setting is on. It runs
 * in the name change's `postExecute`, so one undo reverts name and ID together.
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
    }

    private follow(element: DiagramElementLike, oldName: unknown): void {
        const { followName, style } = this.elementIds.getSettings();
        const target = (element.labelTarget as DiagramElementLike | undefined) ?? element;
        const businessObject = target.businessObject;
        if (!followName || businessObject?.id === undefined) {
            return;
        }
        const change = {
            id: businessObject.id,
            oldName: typeof oldName === "string" && oldName !== "" ? oldName : undefined,
            type: businessObject.$type,
            style,
        };
        if (followsNameChange(change)) {
            this.elementIds.renameFromName(target);
        }
    }
}
