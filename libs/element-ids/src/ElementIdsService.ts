import {
    DEFAULT_ELEMENT_IDS_FOLLOW_NAME,
    type ElementIdProposals,
    type ElementIdRow,
    type ElementIdSettings,
} from "@miragon/bpmn-modeler-types";

import {
    collectCandidates,
    type DiagramElementLike,
    type ElementIdCandidate,
    type ElementRegistryLike,
} from "./candidates";
import { FALLBACK_CONVENTION, type IdConvention } from "./convention";
import { keepsIdUnlessAsked } from "./elementKinds";
import { proposeIds, type IdProposal } from "./proposals";
import {
    RENAME_ELEMENT_IDS_COMMAND,
    type CommandStackLike,
    type IdsLike,
} from "./RenameElementIdsHandler";
import { orderRenames } from "./renameOrder";

export type ElementIdProposal = IdProposal<ElementIdCandidate>;

/** What a surface sets on the service; a field left out keeps its value. */
export interface ElementIdOptions {
    readonly followName?: boolean;
    /** The lint rule's convention, which the lint stack builds and hands in. */
    readonly convention?: IdConvention;
    /** Opens the host's own review panel in place of the canvas panel. */
    readonly openReview?: () => void;
}

const rowOf = ({ candidate, status, newId, clash }: ElementIdProposal): ElementIdRow => ({
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    kind: candidate.kind,
    status,
    ...(newId === undefined ? {} : { newId }),
    clash,
    shownId: candidate.shown.id,
});

/**
 * Proposes IDs from names and applies them. Everything recomputes from the live
 * diagram on each call, so an edit made while the review is open is never
 * overwritten with a stale proposal.
 */
export class ElementIdsService {
    static $inject = ["elementRegistry", "moddle", "commandStack"];

    private settings: ElementIdSettings = { followName: DEFAULT_ELEMENT_IDS_FOLLOW_NAME };
    private convention: IdConvention = FALLBACK_CONVENTION;
    private openReview: (() => void) | undefined;

    constructor(
        private readonly elementRegistry: ElementRegistryLike,
        private readonly moddle: { ids: IdsLike },
        private readonly commandStack: CommandStackLike,
    ) {}

    configure(options: ElementIdOptions): void {
        this.settings = { followName: options.followName ?? this.settings.followName };
        this.convention = options.convention ?? this.convention;
        this.openReview = options.openReview ?? this.openReview;
    }

    /** Whether the host took the review into its own panel. */
    openHostReview(): boolean {
        this.openReview?.();
        return this.openReview !== undefined;
    }

    getSettings(): ElementIdSettings {
        return this.settings;
    }

    getConvention(): IdConvention {
        return this.convention;
    }

    propose(unchecked: ReadonlySet<string> = new Set()): ElementIdProposal[] {
        const candidates = collectCandidates(this.elementRegistry);
        return proposeIds(candidates, {
            convention: this.convention,
            unchecked,
            isTakenElsewhere: this.takenOutside(candidates),
        });
    }

    /** The review's rows for a host's own panel; without `unchecked`, the rows it starts with. */
    list(unchecked: ReadonlySet<string> = this.initiallyUnchecked()): ElementIdProposals {
        return { rows: this.propose(unchecked).map(rowOf), unchecked: [...unchecked] };
    }

    /** The IDs the review starts with unchecked. */
    initiallyUnchecked(): ReadonlySet<string> {
        return new Set(
            collectCandidates(this.elementRegistry)
                .filter((candidate) => keepsIdUnlessAsked(candidate.type))
                .map((candidate) => candidate.id),
        );
    }

    /** Renames every checked element in one undo step and says how many changed. */
    rename(unchecked: ReadonlySet<string> = new Set()): number {
        return this.apply(this.propose(unchecked));
    }

    /** The proposal for one element against every other ID in the diagram; none for an element without an ID of its own. */
    proposalFor(element: DiagramElementLike): ElementIdProposal | undefined {
        const target = (element.labelTarget as DiagramElementLike | undefined) ?? element;
        const candidate = collectCandidates(this.elementRegistry).find(
            (each) => each.target.kind === "element" && each.target.element === target,
        );
        if (!candidate) {
            return undefined;
        }
        const [proposal] = proposeIds([candidate], {
            convention: this.convention,
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
