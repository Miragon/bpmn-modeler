import { commentAndCdataRanges } from "./xmlMarkup";

/**
 * Root-level BPMN definitions an engine correlates by name or code — the kinds
 * the workspace definition search offers across model files.
 */
export type DefinitionKind = "message" | "signal" | "error" | "escalation";

export const DEFINITION_KINDS: readonly DefinitionKind[] = [
    "message",
    "signal",
    "error",
    "escalation",
];

export interface DefinitionUsage {
    readonly elementId: string;
    readonly elementName?: string;
    readonly elementType: string;
    readonly role: "throw" | "catch";
}

/** One definition as declared inside a single model file. */
export interface ModelDefinition {
    readonly kind: DefinitionKind;
    readonly name?: string;
    readonly code?: string;
    readonly usages: readonly DefinitionUsage[];
}

export interface DefinitionSource {
    readonly path: string;
    readonly label: string;
}

/** A {@link ModelDefinition} found in another model, plus where it came from. */
export interface WorkspaceDefinition extends ModelDefinition {
    readonly source: DefinitionSource;
}

export interface DefinitionSearchQuery {
    readonly kind: DefinitionKind;
    readonly text: string;
}

const CODE_ATTRIBUTE: Partial<Record<DefinitionKind, string>> = {
    error: "errorCode",
    escalation: "escalationCode",
};

const THROWING_ELEMENTS = new Set(["endEvent", "intermediateThrowEvent", "sendTask"]);
const CATCHING_ELEMENTS = new Set([
    "startEvent",
    "intermediateCatchEvent",
    "boundaryEvent",
    "receiveTask",
]);

const TAG = /<(\/?)([\w.:-]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

interface OpenElement {
    readonly localName: string;
    readonly attributes: Record<string, string>;
}

interface PendingDefinition {
    readonly id: string;
    readonly kind: DefinitionKind;
    readonly name?: string;
    readonly code?: string;
}

interface PendingUsage extends DefinitionUsage {
    readonly kind: DefinitionKind;
    readonly ref: string;
}

/**
 * Lists the messages, signals, errors and escalations a BPMN file declares,
 * together with the flow nodes that throw or catch them.
 *
 * A tag scanner rather than bpmn-moddle: hosts index whole workspaces with it,
 * and a full moddle parse per file is one to two orders of magnitude slower.
 */
export function extractModelDefinitions(xml: string): ModelDefinition[] {
    const definitions: PendingDefinition[] = [];
    const usages: PendingUsage[] = [];
    const stack: OpenElement[] = [];

    for (const match of withoutCommentsAndCdata(xml).matchAll(TAG)) {
        if (match[1]) {
            stack.pop();
            continue;
        }
        const element: OpenElement = {
            localName: withoutPrefix(match[2]),
            attributes: parseAttributes(match[3]),
        };
        const parent = stack[stack.length - 1];

        const definition = toDefinition(element, parent, stack.length);
        if (definition) {
            definitions.push(definition);
        }
        const usage = toUsage(element, parent);
        if (usage) {
            usages.push(usage);
        }

        const selfClosing = match[4] === "/";
        if (!selfClosing) {
            stack.push(element);
        }
    }

    return definitions
        .filter((definition) => definition.name || definition.code)
        .map(({ id, ...definition }) => ({
            ...definition,
            usages: usages
                .filter((usage) => usage.kind === definition.kind && usage.ref === id)
                .map(({ kind: _kind, ref: _ref, ...usage }) => usage),
        }));
}

function toDefinition(
    element: OpenElement,
    parent: OpenElement | undefined,
    depth: number,
): PendingDefinition | undefined {
    const kind = element.localName as DefinitionKind;
    if (depth !== 1 || parent?.localName !== "definitions" || !DEFINITION_KINDS.includes(kind)) {
        return undefined;
    }
    const { id, name } = element.attributes;
    const codeAttribute = CODE_ATTRIBUTE[kind];
    const code = codeAttribute ? element.attributes[codeAttribute] : undefined;
    return id ? { id, kind, name: name || undefined, code: code || undefined } : undefined;
}

function toUsage(element: OpenElement, parent: OpenElement | undefined): PendingUsage | undefined {
    const directMessageRef = element.attributes.messageRef;
    if (
        directMessageRef &&
        (element.localName === "sendTask" || element.localName === "receiveTask")
    ) {
        return usageOf(element, "message", directMessageRef);
    }
    const eventDefinition = /^(message|signal|error|escalation)EventDefinition$/.exec(
        element.localName,
    );
    if (!eventDefinition || !parent) {
        return undefined;
    }
    const kind = eventDefinition[1] as DefinitionKind;
    const ref = element.attributes[`${kind}Ref`];
    return ref ? usageOf(parent, kind, ref) : undefined;
}

function usageOf(owner: OpenElement, kind: DefinitionKind, ref: string): PendingUsage | undefined {
    const role = THROWING_ELEMENTS.has(owner.localName)
        ? "throw"
        : CATCHING_ELEMENTS.has(owner.localName)
          ? "catch"
          : undefined;
    if (!role) {
        return undefined;
    }
    return {
        kind,
        ref,
        role,
        elementId: owner.attributes.id ?? "",
        elementName: owner.attributes.name || undefined,
        elementType: owner.localName,
    };
}

function withoutCommentsAndCdata(xml: string): string {
    const kept: string[] = [];
    let cursor = 0;
    for (const [start, end] of commentAndCdataRanges(xml)) {
        kept.push(xml.slice(cursor, start));
        cursor = end;
    }
    kept.push(xml.slice(cursor));
    return kept.join("");
}

function withoutPrefix(qualifiedName: string): string {
    return qualifiedName.slice(qualifiedName.indexOf(":") + 1);
}

// `raw` already matched TAG's attribute syntax, so a plain scan suffices.
function parseAttributes(raw: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    let index = 0;
    for (;;) {
        const equals = raw.indexOf("=", index);
        if (equals === -1) {
            return attributes;
        }
        let valueStart = equals + 1;
        while (raw[valueStart] !== '"' && raw[valueStart] !== "'") {
            valueStart++;
        }
        const valueEnd = raw.indexOf(raw[valueStart], valueStart + 1);
        const name = raw.slice(index, equals).trim();
        attributes[withoutPrefix(name)] = decodeEntities(raw.slice(valueStart + 1, valueEnd));
        index = valueEnd + 1;
    }
}

function decodeEntities(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

/** Case-insensitive substring match on name or code, as both search UIs filter. */
export function matchesDefinitionQuery(
    definition: ModelDefinition,
    query: DefinitionSearchQuery,
): boolean {
    if (definition.kind !== query.kind) {
        return false;
    }
    const needle = query.text.trim().toLowerCase();
    return [definition.name, definition.code].some((value) =>
        value?.toLowerCase().includes(needle),
    );
}
