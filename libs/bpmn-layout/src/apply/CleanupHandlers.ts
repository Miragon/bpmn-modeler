import type { CleanupAction } from "../cleanup/rules";
import type { ElementRegistryLike, ModelingLike } from "./LayoutApplyHandler";
import { WAYPOINT_HINTS } from "./LayoutApplyHandler";

export const CLEANUP_COMMAND = "layout.cleanup";
export const CLEANUP_MODDLE_COMMAND = "layout.cleanupModdle";

interface ModelingWithRemove extends ModelingLike {
    removeElements(elements: unknown[]): void;
}

interface CommandStackLike {
    execute(command: string, context: unknown): void;
}

/**
 * Carries out a confirmed cleanup as one undo step.
 *
 * Like the layout applier, this is `preExecute` only: the registry-backed
 * removals go through `modeling`, the moddle-only ones through a nested raw
 * command, and diagram-js's action-id inheritance folds all of it into a
 * single entry.
 */
export class CleanupApplyHandler {
    static $inject = ["modeling", "elementRegistry", "commandStack"];

    constructor(
        private readonly modeling: ModelingWithRemove,
        private readonly elementRegistry: ElementRegistryLike,
        private readonly commandStack: CommandStackLike,
    ) {}

    preExecute(context: { actions: CleanupAction[] }): void {
        const elements: unknown[] = [];
        const moddleActions: CleanupAction[] = [];

        for (const action of context.actions) {
            switch (action.kind) {
                case "remove-element": {
                    const element = this.elementRegistry.get(action.id);
                    if (element) elements.push(element);
                    break;
                }
                case "set-waypoints": {
                    const element = this.elementRegistry.get(action.id);
                    if (element) {
                        this.modeling.updateWaypoints(element, action.waypoints, WAYPOINT_HINTS);
                    }
                    break;
                }
                default:
                    moddleActions.push(action);
            }
        }

        // `elements.delete` nests removeShape/removeConnection under the same
        // action id, so semantics, DI, labels and id unclaiming all come free.
        if (elements.length > 0) this.modeling.removeElements(elements);
        if (moddleActions.length > 0) {
            this.commandStack.execute(CLEANUP_MODDLE_COMMAND, { actions: moddleActions });
        }
    }
}

interface AppliedSplice {
    kind: "splice";
    array: unknown[];
    index: number;
    node: unknown;
}

interface AppliedUnset {
    kind: "unset";
    owner: Record<string, unknown>;
    property: string;
    value: unknown;
}

/**
 * Removes model content that exists only in the moddle tree.
 *
 * This is the one place in the feature where a raw `execute`/`revert` handler
 * is right rather than a workaround: there is no diagram-js element to command,
 * and correspondingly nothing for `BpmnUpdater` to mirror.
 *
 * Note the consequence for the host: a moddle-only edit dirties no elements, so
 * `elements.changed` carries nothing — but `commandStack.changed` still fires
 * when the outermost action pops, which is the event the webview's debounced
 * sync listens on. The document is written back as usual.
 */
export class CleanupModdleHandler {
    execute(context: { actions: CleanupAction[]; applied?: (AppliedSplice | AppliedUnset)[] }): [] {
        const applied: (AppliedSplice | AppliedUnset)[] = [];

        for (const action of context.actions) {
            if (action.kind === "splice") {
                // Resolved by identity rather than by the planned index: an
                // earlier splice on the same array would have shifted it.
                const index = action.array.indexOf(action.node);
                if (index < 0) continue;
                action.array.splice(index, 1);
                applied.push({ kind: "splice", array: action.array, index, node: action.node });
            } else if (action.kind === "unset") {
                if (!(action.property in action.owner)) continue;
                const value = action.owner[action.property];
                delete action.owner[action.property];
                applied.push({
                    kind: "unset",
                    owner: action.owner,
                    property: action.property,
                    value,
                });
            }
        }

        context.applied = applied;
        return [];
    }

    revert(context: { actions?: CleanupAction[]; applied?: (AppliedSplice | AppliedUnset)[] }): [] {
        for (const action of [...(context.applied ?? [])].reverse()) {
            if (action.kind === "splice") action.array.splice(action.index, 0, action.node);
            else action.owner[action.property] = action.value;
        }
        context.applied = [];
        return [];
    }
}
