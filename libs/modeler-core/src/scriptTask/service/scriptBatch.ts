import type { ScriptTaskScript } from "@miragon/bpmn-modeler-types";

import { notifiedErrorLogText } from "../../kernel/domain/errorLogText";
import type { LoggerPort } from "../../kernel/domain/hostPorts";

/**
 * What materialising one script did. `alreadyOpen` means an open tab owns the
 * script and its buffer was left untouched; `cancelled` means the language
 * picker was dismissed.
 */
export type ScriptMaterialization =
    | { readonly kind: "written" }
    | { readonly kind: "alreadyOpen" }
    | { readonly kind: "cancelled" }
    | { readonly kind: "failed"; readonly error: Error };

/** Counts of one "Generate Script Files" batch run; a cancelled script is in none. */
export interface ScriptBatchOutcome {
    readonly generated: number;
    readonly alreadyOpen: number;
    readonly failed: number;
}

/** Shown when the diagram has no inline script task to materialise. */
export const NO_INLINE_SCRIPTS_MESSAGE =
    "No script tasks with inline scripts found in this diagram.";

/**
 * Runs the "Generate Script Files" batch: materialises every script strictly
 * sequentially and counts the outcomes. Sequential on purpose — `materialize`
 * may surface a language quick-pick for an unsupported `scriptFormat`, and a
 * parallel loop would stack one picker per script. A thrown `materialize`
 * counts as failed, and every failure is logged; the batch never aborts.
 *
 * Lives in core so the two hosts (VS Code handler, bridge) can never drift on
 * this policy or on the user-facing summary ({@link scriptBatchSummary}).
 */
export async function materializeScriptBatch(
    scripts: readonly ScriptTaskScript[],
    materialize: (script: ScriptTaskScript) => Promise<ScriptMaterialization>,
    logger: LoggerPort,
): Promise<ScriptBatchOutcome> {
    let generated = 0;
    let alreadyOpen = 0;
    let failed = 0;
    for (const script of scripts) {
        const materialization = await materializeSafely(script, materialize);
        switch (materialization.kind) {
            case "written":
                generated += 1;
                break;
            case "alreadyOpen":
                alreadyOpen += 1;
                break;
            case "failed":
                failed += 1;
                logger.logError(
                    notifiedErrorLogText(
                        `Could not write the script file of ${script.elementId}`,
                        materialization.error,
                    ),
                );
                break;
            case "cancelled":
                break;
        }
    }
    return { generated, alreadyOpen, failed };
}

async function materializeSafely(
    script: ScriptTaskScript,
    materialize: (script: ScriptTaskScript) => Promise<ScriptMaterialization>,
): Promise<ScriptMaterialization> {
    try {
        return await materialize(script);
    } catch (error) {
        return { kind: "failed", error: error as Error };
    }
}

/**
 * The completion toast for a batch run: names the output folder, any
 * already-open scripts left untouched and the scripts that could not be written.
 */
export function scriptBatchSummary(outcome: ScriptBatchOutcome, folder: string): string {
    const skipped =
        outcome.alreadyOpen > 0 ? ` (${outcome.alreadyOpen} already open, left untouched)` : "";
    const failed =
        outcome.failed > 0
            ? ` Could not write ${outcome.failed} script file(s); see the log for details.`
            : "";
    return `Generated ${outcome.generated} script file(s) in ${folder}${skipped} — open a file to edit it with live sync into the diagram.${failed}`;
}
