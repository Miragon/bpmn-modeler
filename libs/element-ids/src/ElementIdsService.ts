import {
    DEFAULT_ELEMENT_ID_STYLE,
    DEFAULT_ELEMENT_IDS_FOLLOW_NAME,
    type ElementIdSettings,
    type ElementIdStyle,
} from "@miragon/bpmn-modeler-types";

import {
    collectCandidates,
    type DiagramElementLike,
    type ElementIdCandidate,
    type ElementRegistryLike,
} from "./candidates";
import { proposeIds, type IdProposal } from "./proposals";
import {
    RENAME_ELEMENT_IDS_COMMAND,
    type CommandStackLike,
    type IdsLike,
} from "./RenameElementIdsHandler";
import { orderRenames } from "./renameOrder";

export type ElementIdProposal = IdProposal<ElementIdCandidate>;

/**
 * Proposes IDs from names and applies them. Everything recomputes from the live
 * diagram on each call, so an edit made while the review is open is never
 * overwritten with a stale proposal.
 */
export class ElementIdsService {
    static $inject = ["elementRegistry", "moddle", "commandStack"];

    private settings: ElementIdSettings = {
        style: DEFAULT_ELEMENT_ID_STYLE,
        followName: DEFAULT_ELEMENT_IDS_FOLLOW_NAME,
    };

    constructor(
        private readonly elementRegistry: ElementRegistryLike,
        private readonly moddle: { ids: IdsLike },
        private readonly commandStack: CommandStackLike,
    ) {}

    configure(settings: Partial<ElementIdSettings>): void {
        this.settings = {
            style: settings.style ?? this.settings.style,
            followName: settings.followName ?? this.settings.followName,
        };
    }

    getSettings(): ElementIdSettings {
        return this.settings;
    }

    propose(
        style: ElementIdStyle = this.settings.style,
        unchecked: ReadonlySet<string> = new Set(),
    ): ElementIdProposal[] {
        const candidates = collectCandidates(this.elementRegistry);
        return proposeIds(candidates, {
            style,
            unchecked,
            isTakenElsewhere: this.takenOutside(candidates),
        });
    }

    /** Renames every checked element in one undo step and says how many changed. */
    rename(
        style: ElementIdStyle = this.settings.style,
        unchecked: ReadonlySet<string> = new Set(),
    ): number {
        return this.apply(this.propose(style, unchecked));
    }

    /** The proposal for one element against every other ID in the diagram; none for an element without an ID of its own. */
    proposalFor(
        element: DiagramElementLike,
        style: ElementIdStyle = this.settings.style,
    ): ElementIdProposal | undefined {
        const target = (element.labelTarget as DiagramElementLike | undefined) ?? element;
        const candidate = collectCandidates(this.elementRegistry).find(
            (each) => each.target.kind === "element" && each.target.element === target,
        );
        if (!candidate) {
            return undefined;
        }
        const [proposal] = proposeIds([candidate], {
            style,
            unchecked: new Set(),
            isTakenElsewhere: this.takenOutside([candidate]),
        });
        return proposal;
    }

    renameFromName(element: DiagramElementLike): boolean {
        const proposal = this.proposalFor(element);
        return proposal !== undefined && this.apply([proposal]) > 0;
    }

    private apply(proposals: readonly ElementIdProposal[]): number {
        const renames = proposals.flatMap((proposal) =>
            proposal.status === "rename" && proposal.newId !== undefined
                ? [
                      {
                          item: proposal.candidate.target,
                          from: proposal.candidate.id,
                          to: proposal.newId,
                      },
                  ]
                : [],
        );
        // An empty command would still leave an undo step behind.
        if (renames.length === 0) {
            return 0;
        }
        const steps = orderRenames(renames, (id) => this.isTaken(id));
        this.commandStack.execute(RENAME_ELEMENT_IDS_COMMAND, { steps });
        return renames.length;
    }

    private isTaken(id: string): boolean {
        return Boolean(this.moddle.ids.assigned(id)) || this.elementRegistry.get(id) !== undefined;
    }

    /** An ID held by anything but the candidates: other model elements, DI, labels and planes. */
    private takenOutside(candidates: readonly ElementIdCandidate[]): (id: string) => boolean {
        const owners = new Set<unknown>();
        const elements = new Set<unknown>();
        for (const { target } of candidates) {
            if (target.kind === "element") {
                owners.add(target.element.businessObject);
                elements.add(target.element);
            } else {
                owners.add(target.process);
            }
        }
        return (id) => {
            const owner = this.moddle.ids.assigned(id);
            if (owner && !owners.has(owner)) {
                return true;
            }
            const element = this.elementRegistry.get(id);
            return element !== undefined && !elements.has(element);
        };
    }
}
