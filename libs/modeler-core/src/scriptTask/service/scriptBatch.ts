import type { ScriptTaskScript } from "@miragon/bpmn-modeler-shared";

/** Counts of one "Generate Script Files" batch run. */
export interface ScriptBatchOutcome {
    generated: number;
    alreadyOpen: number;
}

/** Shown when the diagram has no inline script task to materialise. */
export const NO_INLINE_SCRIPTS_MESSAGE =
    "No script tasks with inline scripts found in this diagram.";

/**
 * Runs the "Generate Script Files" batch: materialises every script strictly
 * sequentially and counts the outcomes. Sequential on purpose — `materialize`
 * may surface a language quick-pick for an unsupported `scriptFormat`, and a
 * parallel loop would stack one picker per script. A cancelled pick skips just
 * that script (it lands in neither counter); `written: false` means an open
 * tab already owned the script and its buffer was left untouched.
 *
 * Lives in core so the two hosts (VS Code handler, bridge) can never drift on
 * this policy or on the user-facing summary ({@link scriptBatchSummary}).
 */
export async function materializeScriptBatch(
    scripts: readonly ScriptTaskScript[],
    materialize: (script: ScriptTaskScript) => Promise<{ written: boolean } | undefined>,
): Promise<ScriptBatchOutcome> {
    const outcome: ScriptBatchOutcome = { generated: 0, alreadyOpen: 0 };
    for (const script of scripts) {
        const result = await materialize(script);
        if (!result) {
            continue; // language picker cancelled for this script
        }
        if (result.written) {
            outcome.generated += 1;
        } else {
            outcome.alreadyOpen += 1;
        }
    }
    return outcome;
}

/**
 * The completion toast for a batch run: names the output folder and any
 * already-open scripts left untouched.
 */
export function scriptBatchSummary(outcome: ScriptBatchOutcome, folder: string): string {
    const skipped =
        outcome.alreadyOpen > 0 ? ` (${outcome.alreadyOpen} already open, left untouched)` : "";
    return `Generated ${outcome.generated} script file(s) in ${folder}${skipped} — open a file to edit it with live sync into the diagram.`;
}
