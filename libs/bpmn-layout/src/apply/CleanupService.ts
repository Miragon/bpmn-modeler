import type { CleanupItem } from "@miragon/bpmn-modeler-types";

import { findCleanupCandidates, indexModelElements, planCleanupActions } from "../cleanup/rules";
import type { CleanupAction, ModdleNode } from "../cleanup/rules";
import { CLEANUP_COMMAND } from "./CleanupHandlers";
import type { ElementRegistryLike } from "./LayoutApplyHandler";

interface CommandStackLike {
    execute(command: string, context: unknown): void;
}

interface BpmnJsLike {
    getDefinitions(): unknown;
}

/**
 * Finds and — on explicit confirmation — removes diagram garbage.
 *
 * `apply` deliberately recomputes rather than accepting the ids from the
 * report it handed out: the user confirms in a host dialog, and may have
 * edited the diagram in between, so a stale id list is not something to
 * delete by.
 */
export class CleanupService {
    static $inject = ["elementRegistry", "commandStack", "bpmnjs"];

    constructor(
        private readonly elementRegistry: ElementRegistryLike,
        private readonly commandStack: CommandStackLike,
        private readonly bpmnjs: BpmnJsLike,
    ) {}

    inspect(): CleanupItem[] {
        return findCleanupCandidates(this.definitions());
    }

    apply(): CleanupItem[] {
        const definitions = this.definitions();
        const items = findCleanupCandidates(definitions);
        if (items.length === 0) return [];

        const actions = this.resolve(definitions, planCleanupActions(definitions));
        if (actions.length === 0) return [];

        this.commandStack.execute(CLEANUP_COMMAND, { actions });
        return items;
    }

    /**
     * Turns a `remove-element` for something the registry never saw into a
     * moddle splice. The rules cannot make this call themselves — they know
     * the model, not which parts of it were rendered.
     */
    private resolve(definitions: ModdleNode, actions: CleanupAction[]): CleanupAction[] {
        let index: Map<string, ModdleNode> | undefined;

        return actions.flatMap((action) => {
            if (action.kind !== "remove-element") return [action];
            if (this.elementRegistry.get(action.id)) return [action];

            index ??= indexModelElements(definitions);
            const node = index.get(action.id);
            const parent = node?.$parent as ModdleNode | undefined;
            if (!node || !parent) return [];

            for (const value of Object.values(parent)) {
                if (!Array.isArray(value)) continue;
                const at = value.indexOf(node);
                if (at >= 0) {
                    return [{ kind: "splice", array: value, index: at, node } as CleanupAction];
                }
            }
            return [];
        });
    }

    private definitions(): ModdleNode {
        return this.bpmnjs.getDefinitions() as ModdleNode;
    }
}
