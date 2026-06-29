/**
 * Pure, dependency-free parser for a `*.bpmn.vars.json` manifest — the explicit,
 * author-written override that sits next to a diagram and declares process
 * variables the heuristic extraction (see {@link import("./processVariables")})
 * can't see: variables injected from outside the model (REST start, message
 * correlation, a parent process) plus author-supplied types and docs.
 *
 * The parser deliberately never throws. A malformed or hand-edited manifest must
 * not break completion for the whole diagram, so any structural problem (bad
 * JSON, a non-array `variables`) degrades to an empty result; the host boundary
 * is where the read error is surfaced to the author, not here.
 */

import { VariableDef } from "./processVariables";

/** A single declared variable in a `*.bpmn.vars.json` manifest. */
export interface VariableManifestEntry {
    readonly name: string;
    readonly type?: string;
    readonly description?: string;
}

/** The on-disk shape of a `*.bpmn.vars.json` manifest. */
export interface VariableManifest {
    readonly variables: VariableManifestEntry[];
}

/**
 * Parses a `*.bpmn.vars.json` manifest into `authored`-tier {@link VariableDef}s.
 *
 * Entries with a missing/empty `name` are skipped (a nameless variable can't be
 * completed). `manifestName` names the source file in each entry's `origin` so
 * completion docs can trace the suggestion back to the manifest. Returns `[]` on
 * any parse/shape error — never throws (see the file doc).
 */
export function parseVariableManifest(jsonText: string, manifestName: string): VariableDef[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch {
        return [];
    }

    const variables = (parsed as Partial<VariableManifest> | null)?.variables;
    if (!Array.isArray(variables)) {
        return [];
    }

    const out: VariableDef[] = [];
    for (const entry of variables) {
        const name = (entry as VariableManifestEntry)?.name;
        if (typeof name !== "string" || !name) {
            continue;
        }
        const type = (entry as VariableManifestEntry).type;
        const description = (entry as VariableManifestEntry).description;
        out.push({
            name,
            origin: `declared in ${manifestName}`,
            typeHint: typeof type === "string" && type ? type : undefined,
            description:
                typeof description === "string" && description ? description : undefined,
            confidence: "authored",
        });
    }
    return out;
}
