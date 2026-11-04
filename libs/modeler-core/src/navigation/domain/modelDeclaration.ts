import { matchesOutsideCommentsAndCdata } from "@miragon/bpmn-modeler-types";

import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";

export interface ReferencedModel {
    id: string;
    kind: "process" | "decision";
    /** Target namespace the declaring definitions must have; any when omitted. */
    namespace?: string;
}

/**
 * A regex rather than bpmn-moddle / dmn-moddle: a per-file parse is 50-100×
 * slower, which matters across a 100-file workspace.
 */
export function declaresReferencedModel(content: string, reference: ReferencedModel): boolean {
    return declarationPatterns(reference).every((pattern) =>
        matchesOutsideCommentsAndCdata(content, pattern),
    );
}

function declarationPatterns({ id, kind, namespace }: ReferencedModel): RegExp[] {
    const idPattern = elementWithAttribute(kind, "id", id);
    return namespace === undefined
        ? [idPattern]
        : [idPattern, elementWithAttribute("definitions", "targetNamespace", namespace)];
}

function elementWithAttribute(element: string, attribute: string, value: string): RegExp {
    return new RegExp(
        `<(?:[\\w-]+:)?${element}\\b[^>]*\\b${attribute}\\s*=\\s*["']${escapeRegExpLiteral(value)}["']`,
    );
}
