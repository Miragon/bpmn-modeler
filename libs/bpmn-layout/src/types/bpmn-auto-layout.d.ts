/**
 * Ambient type declarations for `bpmn-auto-layout`, which ships no `.d.ts`
 * (its published `exports` map has no `types` condition). Covers only what the
 * engine adapter uses.
 *
 * Verified against the installed `2.0.0-alpha.2` dist: both diagnostic classes
 * are `Error` subclasses constructed as
 * `(code, elementId, message, relatedElementIds = [])`.
 */
declare module "bpmn-auto-layout" {
    class LayoutDiagnosticBase extends Error {
        readonly code: string;
        readonly elementId?: string;
        readonly relatedElementIds: string[];
    }

    /** A layout-relevant structural error; formatting produced no result. */
    export class LayoutError extends LayoutDiagnosticBase {}

    /** A non-fatal remark; formatting produced a result regardless. */
    export class LayoutWarning extends LayoutDiagnosticBase {}

    export function layoutProcess(xml: string): Promise<{
        xml: string;
        warnings: LayoutWarning[];
    }>;
}
