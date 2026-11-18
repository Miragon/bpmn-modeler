import type { ReleaseLineRegistry } from "./release-routing.mjs";

export interface ShipsInDeclaration {
    /** Whether the body has a "Ships in" section at all. */
    found: boolean;
    /** The ticked release lines, in the registry's order. */
    lines: string[];
    none: boolean;
    /** A ticked line's own changelog subject, by line id. */
    wording: Record<string, string>;
    /** Boxes the section cannot hold: unknown or unreadable ids, a line ticked twice, a second section. */
    errors: string[];
}

export const NO_LINE: string;

export function parseShipsIn(
    body: string | undefined,
    registry: ReleaseLineRegistry,
): ShipsInDeclaration;
export function isDeclared(declaration: Pick<ShipsInDeclaration, "lines" | "none">): boolean;
export const CANDIDATES_GUIDANCE: string;
export function shipsInCandidates(
    candidateIds: readonly string[],
    registry: ReleaseLineRegistry,
): string;
