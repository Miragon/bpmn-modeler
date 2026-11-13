import type { ElementIdRowStatus } from "@miragon/bpmn-modeler-types";

import type { ModdleElementLike } from "./moddleElement";
import type { IdConvention } from "./convention";
import { counterSeparatorOf, technicalIdFor } from "./technicalId";

export interface IdCandidate {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    /** The business object; the convention reads its type and event definitions. */
    readonly element: ModdleElementLike;
}

export interface IdProposal<C extends IdCandidate = IdCandidate> {
    readonly candidate: C;
    readonly status: ElementIdRowStatus;
    /** The ID the element gets, or would get if checked; absent when skipped. */
    readonly newId: string | undefined;
    /** A counter was added because another element claims the plain ID. */
    readonly clash: boolean;
}

export interface ProposeOptions {
    readonly convention: IdConvention;
    readonly unchecked: ReadonlySet<string>;
    /** Whether an ID belongs to something outside the candidates, such as a message or a DI element. */
    readonly isTakenElsewhere: (id: string) => boolean;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An ID follows its name with any prefix the convention accepts for the element,
 * an event qualifier included, and with a counter, so a second run leaves
 * `task_notify2` alone.
 */
function followsName(
    id: string,
    base: string,
    element: ModdleElementLike,
    convention: IdConvention,
): boolean {
    const prefixes = convention.prefixesFor(element);
    const name = base.slice((prefixes[0] ?? "").length);
    const spellings = (prefixes.length > 0 ? prefixes : [""]).map((prefix) =>
        escapeRegExp(`${prefix}${name}`),
    );
    const counter = `${escapeRegExp(counterSeparatorOf(convention))}\\d+`;
    return new RegExp(`^(?:${spellings.join("|")})(?:${counter})?$`).test(id);
}

/** Whether an ID is the one its name yields, with or without a counter. */
export function idFollowsName(
    id: string,
    name: string,
    element: ModdleElementLike,
    convention: IdConvention,
): boolean {
    const base = technicalIdFor(name, element, convention);
    return base !== undefined && followsName(id, base, element, convention);
}

function firstFree(base: string, separator: string, isFree: (id: string) => boolean): string {
    if (isFree(base)) {
        return base;
    }
    let counter = 2;
    while (!isFree(`${base}${separator}${counter}`)) {
        counter++;
    }
    return `${base}${separator}${counter}`;
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
    const { convention, unchecked, isTakenElsewhere } = options;
    const separator = counterSeparatorOf(convention);
    const bases = candidates.map((candidate) =>
        technicalIdFor(candidate.name, candidate.element, convention),
    );
    const follows = candidates.map((candidate, index) => {
        const base = bases[index];
        return base !== undefined && followsName(candidate.id, base, candidate.element, convention);
    });

    const kept = new Set<string>();
    candidates.forEach((candidate, index) => {
        if (bases[index] === undefined || follows[index] || unchecked.has(candidate.id)) {
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
        if (follows[index]) {
            return { candidate, status: "matches", newId: candidate.id, clash: false };
        }
        if (unchecked.has(candidate.id)) {
            return { candidate, status: "unchecked", newId: base, clash: false };
        }
        const newId = firstFree(base, separator, isFree);
        assigned.add(newId);
        return { candidate, status: "rename", newId, clash: newId !== base };
    });

    // An unchecked row shows what it would become, among the IDs the checked rows took.
    return proposals.map((proposal) =>
        proposal.status === "unchecked" && proposal.newId !== undefined
            ? {
                  ...proposal,
                  newId: firstFree(proposal.newId, separator, isFree),
                  clash: !isFree(proposal.newId),
              }
            : proposal,
    );
}
