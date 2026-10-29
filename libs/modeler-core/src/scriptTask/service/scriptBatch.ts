import type { ScriptTaskScript } from "@miragon/bpmn-modeler-types";

import { notifiedErrorLogText } from "../../kernel/domain/errorLogText";
import type { LoggerPort } from "../../kernel/domain/hostPorts";
import {
    type ScriptBatchOutcome,
    scriptBatchOutcome,
    type ScriptBatchResult,
    type ScriptMaterialization,
} from "../domain/scriptBatchSummary";

/**
 * Runs the "Generate Script Files" batch: materialises every script strictly
 * sequentially and counts the outcomes. Sequential on purpose — `materialize`
 * may surface a language quick-pick for an unsupported `scriptFormat`, and a
 * parallel loop would stack one picker per script. A rejected `materialize`
 * counts as failed and is logged; the batch never aborts. Lives in core so the
 * hosts cannot drift on this policy.
 */
export async function materializeScriptBatch(
    scripts: readonly ScriptTaskScript[],
    materialize: (script: ScriptTaskScript) => Promise<ScriptMaterialization>,
    logger: LoggerPort,
): Promise<ScriptBatchOutcome> {
    const results: ScriptBatchResult[] = [];
    for (const script of scripts) {
        results.push(await materializeOrLogFailure(script, materialize, logger));
    }
    return scriptBatchOutcome(results);
}

async function materializeOrLogFailure(
    script: ScriptTaskScript,
    materialize: (script: ScriptTaskScript) => Promise<ScriptMaterialization>,
    logger: LoggerPort,
): Promise<ScriptBatchResult> {
    try {
        return await materialize(script);
    } catch (error) {
        logger.logError(
            notifiedErrorLogText(
                `Could not write the script file of ${script.elementId}`,
                error as Error,
            ),
        );
        return { kind: "failed" };
    }
}
