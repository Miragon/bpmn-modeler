import type { DiagramElementLike, ElementRegistryLike, RenameTarget } from "./candidates";
import type { ModdleElementLike } from "./moddleElement";
import { dropBlockedRenames, orderRenames, type Rename } from "./renameOrder";

export const RENAME_ELEMENT_IDS_COMMAND = "elementIds.rename";
export const UPDATE_LABEL_ID_COMMAND = "elementIds.updateLabelId";

/** The slice of bpmn-js `modeling` the rename uses. */
export interface ModelingLike {
    updateProperties(element: DiagramElementLike, properties: Record<string, unknown>): void;
    updateModdleProperties(
        element: DiagramElementLike,
        moddleElement: ModdleElementLike,
        properties: Record<string, unknown>,
    ): void;
    claimId(id: string, moddleElement: unknown): void;
    unclaimId(id: string, moddleElement: unknown): void;
}

export interface IdsLike {
    assigned(id: string): unknown;
}

export interface CommandStackLike {
    execute(command: string, context: unknown): void;
}

export interface RenameContext {
    readonly steps: readonly Rename<RenameTarget>[];
}

/**
 * Renames every element of a review in one undo step.
 *
 * The handler has only `preExecute`: diagram-js gives the commands it runs the
 * outer action's id, so `undo()` unwinds them together, as `LayoutApplyHandler`
 * in bpmn-layout relies on. Running them from `execute` would throw.
 */
export class RenameElementIdsHandler {
    static $inject = ["modeling", "moddle", "elementRegistry", "commandStack"];

    constructor(
        private readonly modeling: ModelingLike,
        private readonly moddle: { ids: IdsLike },
        private readonly elementRegistry: ElementRegistryLike,
        private readonly commandStack: CommandStackLike,
    ) {}

    preExecute({ steps }: RenameContext): void {
        const originalIds = new Map<RenameTarget, string>();
        const finalIds = new Map<RenameTarget, string>();
        for (const step of steps) {
            if (!originalIds.has(step.item)) {
                originalIds.set(step.item, step.from);
            }
            finalIds.set(step.item, step.to);
            this.rename(step);
        }
        const moved = [...finalIds].flatMap(([target, to]) =>
            target.kind === "element"
                ? [{ element: target.element, from: originalIds.get(target)!, to }]
                : [],
        );
        this.renameDiIds(moved);
        this.renameLabelIds(moved);
    }

    // Each step names its target object, so a target stays found through a temporary ID.
    private rename({ item: target, from, to }: Rename<RenameTarget>): void {
        if (target.kind === "element") {
            this.modeling.updateProperties(target.element, { id: to });
            return;
        }
        // `element.updateModdleProperties` leaves the ID registry alone.
        this.modeling.unclaimId(from, target.process);
        this.modeling.updateModdleProperties(target.participant, target.process, { id: to });
        this.modeling.claimId(to, target.process);
    }

    /**
     * bpmn-js names a DI element `<element ID>_di`; one that still follows the
     * old ID follows the new one. Swapped elements swap their DI IDs too, which
     * needs the same ordering as the elements themselves.
     */
    private renameDiIds(moved: readonly Moved[]): void {
        const isHeld = (id: string) => Boolean(this.moddle.ids.assigned(id));
        const renames = moved.flatMap(({ element, from, to }) =>
            element.di?.id === `${from}_di`
                ? [{ item: element, from: `${from}_di`, to: `${to}_di` }]
                : [],
        );
        for (const { item: element, from, to } of orderRenames(
            dropBlockedRenames(renames, isHeld),
            isHeld,
        )) {
            this.modeling.unclaimId(from, element.di);
            this.modeling.updateProperties(element, { di: { id: to } });
            this.modeling.claimId(to, element.di);
        }
    }

    /** A label keeps `<element ID>_label`, so a later label for the old ID cannot collide with it. */
    private renameLabelIds(moved: readonly Moved[]): void {
        const isHeld = (id: string) => this.elementRegistry.get(id) !== undefined;
        const renames = moved.flatMap(({ element, from, to }) =>
            element.label?.id === `${from}_label`
                ? [{ item: element.label, from: `${from}_label`, to: `${to}_label` }]
                : [],
        );
        for (const { item: label, to } of orderRenames(
            dropBlockedRenames(renames, isHeld),
            isHeld,
        )) {
            this.commandStack.execute(UPDATE_LABEL_ID_COMMAND, { label, id: to });
        }
    }
}

interface Moved {
    readonly element: DiagramElementLike;
    readonly from: string;
    readonly to: string;
}

interface UpdateLabelIdContext {
    readonly label: DiagramElementLike;
    readonly id: string;
    oldId?: string;
}

interface IdUpdatingRegistry {
    updateId(element: DiagramElementLike, id: string): void;
}

/**
 * Keeps a label's registry ID on `<element ID>_label`, as bpmn-js names a new
 * label, so a later label for the old ID cannot collide with this one.
 */
export class UpdateLabelIdHandler {
    static $inject = ["elementRegistry"];

    constructor(private readonly elementRegistry: IdUpdatingRegistry) {}

    execute(context: UpdateLabelIdContext): DiagramElementLike[] {
        context.oldId = context.label.id;
        this.elementRegistry.updateId(context.label, context.id);
        return [];
    }

    revert(context: UpdateLabelIdContext): DiagramElementLike[] {
        this.elementRegistry.updateId(context.label, context.oldId!);
        return [];
    }
}
