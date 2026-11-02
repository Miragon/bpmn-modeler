import type { Diagnostic } from "./diagnostics";

/** A text to translate with its replacements. */
export type SummaryPart = [text: string, replacements?: Record<string, string>];

function part(count: number, one: string, many: string): SummaryPart[] {
    if (count === 0) {
        return [];
    }
    return count === 1 ? [[one]] : [[many, { count: String(count) }]];
}

/** The chip's words: only what there is, so never "0 Errors". */
export function problemSummary(diagnostics: readonly Diagnostic[]): SummaryPart[] {
    const count = (severity: Diagnostic["severity"]) =>
        diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
    const parts = [
        ...part(count("error"), "1 Error", "{count} Errors"),
        ...part(count("warning"), "1 Warning", "{count} Warnings"),
    ];
    return parts.length > 0 ? parts : [["No Issues"]];
}
