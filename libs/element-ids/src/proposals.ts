import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";

import { technicalIdFor } from "./technicalId";

export interface IdCandidate {
    readonly id: string;
    readonly name: string;
    readonly type: string;
}

/**
 * `matches`: the ID already follows the name. `unchecked`: the user keeps the
 * current ID. `skipped`: the name yields no ID.
 */
type IdProposalStatus = "rename" | "matches" | "unchecked" | "skipped";

export interface IdProposal<C extends IdCandidate = IdCandidate> {
    readonly candidate: C;
    readonly status: IdProposalStatus;
    /** The ID the element gets, or would get if checked; absent when skipped. */
    readonly newId: string | undefined;
    /** A counter was added because another element claims the plain ID. */
    readonly clash: boolean;
}

export interface ProposeOptions {
    readonly style: ElementIdStyle;
    readonly unchecked: ReadonlySet<string>;
    /** Whether an ID belongs to something outside the candidates, such as a message or a DI element. */
    readonly isTakenElsewhere: (id: string) => boolean;
}

const COUNTER_SEPARATOR: Readonly<Record<ElementIdStyle, string>> = {
    typePrefix: "_",
    typeSuffix: "",
    snakeCase: "_",
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An ID with a counter still follows its name, so a second run leaves `Task_Notify_2` alone. */
function followsName(id: string, base: string, style: ElementIdStyle): boolean {
    return new RegExp(
        `^${escapeRegExp(base)}(${escapeRegExp(COUNTER_SEPARATOR[style])}\\d+)?$`,
    ).test(id);
}

/** Whether an ID is the one its name yields, with or without a counter. */
export function idFollowsName(
    id: string,
    name: string,
    type: string,
    style: ElementIdStyle,
): boolean {
    const base = technicalIdFor(name, type, style);
    return base !== undefined && followsName(id, base, style);
}

function firstFree(base: string, style: ElementIdStyle, isFree: (id: string) => boolean): string {
    if (isFree(base)) {
        return base;
    }
    let counter = 2;
    while (!isFree(`${base}${COUNTER_SEPARATOR[style]}${counter}`)) {
        counter++;
    }
    return `${base}${COUNTER_SEPARATOR[style]}${counter}`;
}

/**
 * The ID each candidate gets from its name, unique among the candidates and
 * against every ID they do not give up. Every element that keeps its ID (it
 * already follows its name, is unchecked or has no name) holds it first, so the
 * others steer around it.
 */
export function proposeIds<C extends IdCandidate>(
    candidates: readonly C[],
    options: ProposeOptions,
): IdProposal<C>[] {
    const { style, unchecked, isTakenElsewhere } = options;
    const bases = candidates.map((candidate) =>
        technicalIdFor(candidate.name, candidate.type, style),
    );

    const kept = new Set<string>();
    candidates.forEach((candidate, index) => {
        const base = bases[index];
        if (
            base === undefined ||
            followsName(candidate.id, base, style) ||
            unchecked.has(candidate.id)
        ) {
            kept.add(candidate.id);
        }
    });

    const assigned = new Set<string>();
    const isFree = (id: string) => !kept.has(id) && !assigned.has(id) && !isTakenElsewhere(id);

    const proposals = candidates.map((candidate, index): IdProposal<C> => {
        const base = bases[index];
        if (base === undefined) {
            return { candidate, status: "skipped", newId: undefined, clash: false };
        }
        if (followsName(candidate.id, base, style)) {
            return { candidate, status: "matches", newId: candidate.id, clash: false };
        }
        if (unchecked.has(candidate.id)) {
            return { candidate, status: "unchecked", newId: base, clash: false };
        }
        const newId = firstFree(base, style, isFree);
        assigned.add(newId);
        return { candidate, status: "rename", newId, clash: newId !== base };
    });

    // An unchecked row shows what it would become, among the IDs the checked rows took.
    return proposals.map((proposal) =>
        proposal.status === "unchecked" && proposal.newId !== undefined
            ? {
                  ...proposal,
                  newId: firstFree(proposal.newId, style, isFree),
                  clash: !isFree(proposal.newId),
              }
            : proposal,
    );
}
