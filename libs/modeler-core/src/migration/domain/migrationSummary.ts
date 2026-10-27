import { PlannedWrite } from "./MigrationPlan";

export type WriteResult =
    | { readonly kind: "updated"; readonly write: PlannedWrite }
    | { readonly kind: "unchanged" }
    | { readonly kind: "skipped" };

export function migrationSummary(_results: readonly WriteResult[]): string {
    return "";
}
