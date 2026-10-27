import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { PlannedWrite } from "./MigrationPlan";

export type WriteResult =
    | { readonly kind: "updated"; readonly write: PlannedWrite }
    | { readonly kind: "unchanged" }
    | { readonly kind: "skipped" };

export function migrationSummary(results: readonly WriteResult[]): string {
    const updatedByEngine = new Map<Engine, PlannedWrite[]>();
    let skippedCount = 0;
    for (const result of results) {
        if (result.kind === "updated") {
            const writes = updatedByEngine.get(result.write.engine) ?? [];
            updatedByEngine.set(result.write.engine, [...writes, result.write]);
        } else if (result.kind === "skipped") {
            skippedCount++;
        }
    }

    const updatedParts = [...updatedByEngine.entries()].map(
        ([engine, writes]) =>
            `${writes.length} diagram(s) to ${ENGINE_LABEL[engine]} (${writes[0].version})`,
    );
    const updated = updatedParts.length > 0 ? `Updated ${updatedParts.join(" and ")}.` : undefined;
    if (skippedCount === 0) {
        return updated ?? "All diagrams are already at the selected version.";
    }
    return `${updated ?? "No diagrams were updated."} Skipped ${skippedCount} diagram(s); see the log for details.`;
}
