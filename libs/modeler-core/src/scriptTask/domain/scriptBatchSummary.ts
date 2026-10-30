/**
 * What a host's materialisation of one script did. `alreadyOpen` means an open
 * tab owns the script and its buffer was left untouched; `cancelled` means the
 * language picker was dismissed. A failed write rejects instead.
 */
export type ScriptMaterialization =
    | { readonly kind: "written" }
    | { readonly kind: "alreadyOpen" }
    | { readonly kind: "cancelled" };

/** One script's result in a batch run: its materialisation, or `failed` when that rejected. */
export type ScriptBatchResult = ScriptMaterialization | { readonly kind: "failed" };

/** Counts of one "Generate Script Files" batch run; a cancelled script is in none. */
export interface ScriptBatchOutcome {
    readonly generated: number;
    readonly alreadyOpen: number;
    readonly failed: number;
}

/** Shown when the diagram has no inline script task to materialise. */
export const NO_INLINE_SCRIPTS_MESSAGE =
    "No script tasks with inline scripts found in this diagram.";

export function scriptBatchOutcome(results: readonly ScriptBatchResult[]): ScriptBatchOutcome {
    const count = (kind: ScriptBatchResult["kind"]) =>
        results.filter((result) => result.kind === kind).length;
    return {
        generated: count("written"),
        alreadyOpen: count("alreadyOpen"),
        failed: count("failed"),
    };
}

/**
 * The completion toast for a batch run: names the output folder, any
 * already-open scripts left untouched and the scripts that could not be written.
 * It asks the user to open a file only when one was generated. `folder` is
 * `undefined` when no script got as far as resolving one.
 */
export function scriptBatchSummary(
    outcome: ScriptBatchOutcome,
    folder: string | undefined,
): string {
    const location = folder === undefined ? "" : ` in ${folder}`;
    const skipped =
        outcome.alreadyOpen > 0 ? ` (${outcome.alreadyOpen} already open, left untouched)` : "";
    const failed =
        outcome.failed > 0
            ? ` Could not write ${outcome.failed} script file(s); see the log for details.`
            : "";
    const generated =
        outcome.generated > 0
            ? `Generated ${outcome.generated} script file(s)${location}${skipped} — open a file to edit it with live sync into the diagram.`
            : `No script files generated${location}${skipped}.`;
    return `${generated}${failed}`;
}
