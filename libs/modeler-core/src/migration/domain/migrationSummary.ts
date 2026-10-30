import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { PlannedWrite } from "./MigrationPlan";

/** A diagram the run could not read counts as skipped, like one it could not write. */
export type MigrationResult =
    | { readonly kind: "updated"; readonly write: PlannedWrite }
    | { readonly kind: "unchanged" }
    | { readonly kind: "skipped" };

const NOTHING_UPDATED = "No diagrams were updated.";

export function migrationSummary(results: readonly MigrationResult[]): string {
    const updatedByEngine = new Map<Engine, { readonly version: string; readonly count: number }>();
    let skippedCount = 0;
    for (const result of results) {
        if (result.kind === "updated") {
            const { engine, version } = result.write;
            const count = updatedByEngine.get(engine)?.count ?? 0;
            updatedByEngine.set(engine, { version, count: count + 1 });
        } else if (result.kind === "skipped") {
            skippedCount++;
        }
    }

    const updatedParts = [...updatedByEngine].map(
        ([engine, { version, count }]) =>
            `${count} diagram(s) to ${ENGINE_LABEL[engine]} (${version})`,
    );
    const updated = updatedParts.length > 0 ? `Updated ${updatedParts.join(" and ")}.` : undefined;
    if (skippedCount === 0) {
        return updated ?? "All diagrams are already at the selected version.";
    }
    return withSkippedCount(updated ?? NOTHING_UPDATED, skippedCount);
}

/** A diagram that could not be read may well have an engine, so it must not be reported as undetected. */
export function nothingToMigrateSummary(skippedCount: number): string {
    if (skippedCount === 0) {
        return "Could not detect the engine for any BPMN file in the workspace.";
    }
    return withSkippedCount(NOTHING_UPDATED, skippedCount);
}

function withSkippedCount(outcome: string, skippedCount: number): string {
    return `${outcome} Skipped ${skippedCount} diagram(s); see the log for details.`;
}
