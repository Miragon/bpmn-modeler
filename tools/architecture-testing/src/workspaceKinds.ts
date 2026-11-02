import type { ArchitectureRule } from "./architectureRule";
import { FLAT_RULES } from "./flatRules";
import { HEXAGONAL_RULES } from "./hexagonalRules";

export type WorkspaceKind = "hexagonal" | "diagram-js" | "flat";

const WORKSPACE_KINDS: readonly string[] = ["hexagonal", "diagram-js", "flat"];

/** diagram-js modules follow the bpmn-js module layout, which has no role folders either. */
export const RULES_BY_KIND: Readonly<Record<WorkspaceKind, readonly ArchitectureRule[]>> = {
    "hexagonal": HEXAGONAL_RULES,
    "diagram-js": FLAT_RULES,
    "flat": FLAT_RULES,
};

export function isWorkspaceKind(kind: string | undefined): kind is WorkspaceKind {
    return kind !== undefined && WORKSPACE_KINDS.includes(kind);
}
