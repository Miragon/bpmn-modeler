import { matchesOutsideCommentsAndCdata, type ReferenceKind } from "@miragon/bpmn-modeler-types";

import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";

export interface ReferencedModel {
    id: string;
    kind: ReferenceKind;
    /** Target namespace the declaring definitions must have; any when omitted. */
    namespace?: string;
}

type Declares = (content: string, reference: ReferencedModel) => boolean;

interface Declaration {
    readonly fileExtension: string;
    readonly declares: Declares;
}

const DECLARATIONS: Readonly<Record<ReferenceKind, Declaration>> = {
    process: { fileExtension: ".bpmn", declares: declaresXmlElement("process") },
    decision: { fileExtension: ".dmn", declares: declaresXmlElement("decision") },
    form: {
        fileExtension: ".form",
        declares: (content, { id }) => formIdDeclaredIn(content) === id,
    },
};

export function declaringFileExtension(kind: ReferenceKind): string {
    return DECLARATIONS[kind].fileExtension;
}

export function declaresReferencedModel(content: string, reference: ReferencedModel): boolean {
    return DECLARATIONS[reference.kind].declares(content, reference);
}

/** The non-empty top-level id of a Camunda Form schema; a component's id declares nothing. */
export function formIdDeclaredIn(content: string): string | undefined {
    const id = parseFormSchema(content)?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
}

function parseFormSchema(content: string): { id?: unknown } | null | undefined {
    try {
        return JSON.parse(content) as { id?: unknown } | null;
    } catch {
        return undefined;
    }
}

/**
 * A regex rather than bpmn-moddle / dmn-moddle: a per-file parse is 50-100×
 * slower, which matters across a 100-file workspace.
 */
function declaresXmlElement(element: string): Declares {
    return (content, reference) =>
        declarationPatterns(element, reference).every((pattern) =>
            matchesOutsideCommentsAndCdata(content, pattern),
        );
}

function declarationPatterns(element: string, { id, namespace }: ReferencedModel): RegExp[] {
    const idPattern = elementWithAttribute(element, "id", id);
    return namespace === undefined
        ? [idPattern]
        : [idPattern, elementWithAttribute("definitions", "targetNamespace", namespace)];
}

function elementWithAttribute(element: string, attribute: string, value: string): RegExp {
    return new RegExp(
        `<(?:[\\w-]+:)?${element}\\b[^>]*\\b${attribute}\\s*=\\s*["']${escapeRegExpLiteral(value)}["']`,
    );
}
