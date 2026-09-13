/**
 * The webview can either host the full editable modeler or a readonly viewer
 * used for side-by-side diff rendering.
 */
export type BpmnViewerMode = "modeler" | "viewer";

/**
 * Camunda engine identifier used by the BPMN modeler.
 *
 * `"c7"` — Camunda Platform 7. `"c8"` — Camunda Cloud 8.
 *
 * Defined as a string union so values stay JSON-serializable across the
 * extension-host ↔ webview message protocol.
 */
export type Engine = "c7" | "c8";

/** Display names for UI surfaces (status bar, pickers, labels). */
export const ENGINE_LABEL: Record<Engine, string> = {
    c7: "Camunda 7",
    c8: "Camunda 8",
};

/**
 * Execution-platform names written into BPMN XML (`modeler:executionPlatform`).
 * These are spec-defined strings — do not change them independently of the BPMN spec.
 */
export const ENGINE_EXECUTION_PLATFORM: Record<Engine, string> = {
    c7: "Camunda Platform",
    c8: "Camunda Cloud",
};

/**
 * Result of {@link detectEngine}: the engine, or `undefined` when the XML
 * carries no recognisable platform metadata.
 */
export type DetectedEngine = Engine | undefined;

/** Namespace URI Camunda binds the `modeler:*` execution-platform metadata to. */
const MODELER_NS = "http://camunda.org/schema/modeler/1.0";

/** Conventional prefix used when the file omits the {@link MODELER_NS} binding. */
const MODELER_DEFAULT_PREFIX = "modeler";

/**
 * Detects the Camunda engine from raw BPMN XML by inspecting only the
 * `definitions` root element's namespace-aware attributes, so hosts can pick the
 * engine before instantiating a modeler.
 *
 * Strict signals, most authoritative first:
 * 1. `<modeler prefix>:executionPlatform` name (`"Camunda Platform"` → c7,
 *    `"Camunda Cloud"` → c8).
 * 2. else the `<modeler prefix>:executionPlatformVersion` major digit
 *    (7 → c7, 8 → c8).
 *
 * The modeler prefix is resolved from the `xmlns:*="${MODELER_NS}"` binding on
 * the root, falling back to the literal `modeler` prefix. Returns `undefined`
 * for engine-neutral diagrams and never throws on malformed input — the caller
 * owns the fallback policy. No `xmlns:camunda`/`xmlns:zeebe` heuristic here.
 */
export function detectEngine(xml: string): DetectedEngine {
    const attributes = readRootDefinitionsAttributes(xml);
    if (!attributes) {
        return undefined;
    }

    let modelerPrefix = MODELER_DEFAULT_PREFIX;
    for (const { name, value } of attributes) {
        if (name.startsWith("xmlns:") && value === MODELER_NS) {
            modelerPrefix = name.slice("xmlns:".length);
            break;
        }
    }

    const executionPlatform = attributes.find(
        (attribute) => attribute.name === `${modelerPrefix}:executionPlatform`,
    )?.value;
    if (executionPlatform !== undefined) {
        for (const engine of Object.keys(ENGINE_EXECUTION_PLATFORM) as Engine[]) {
            if (executionPlatform === ENGINE_EXECUTION_PLATFORM[engine]) {
                return engine;
            }
        }
    }

    const version = attributes.find(
        (attribute) => attribute.name === `${modelerPrefix}:executionPlatformVersion`,
    )?.value;
    const versionMatch = version?.match(/^([78])\./);
    if (versionMatch) {
        return versionMatch[1] === "7" ? "c7" : "c8";
    }

    return undefined;
}

interface XmlAttribute {
    name: string;
    value: string;
}

/**
 * Returns the attributes of the `definitions` root element (any prefix), or
 * `undefined` when the input has no such root or is malformed. Pure string
 * scanning — no DOM or XML parser, so it stays usable in the design entry
 * consumed by the Node host and the Bun bridge.
 */
function readRootDefinitionsAttributes(xml: string): XmlAttribute[] | undefined {
    const tagStart = findRootTagStart(xml);
    if (tagStart === undefined) {
        return undefined;
    }

    let cursor = tagStart + 1;
    const nameMatch = /^[^\s/>]+/.exec(xml.slice(cursor));
    if (!nameMatch) {
        return undefined;
    }
    const tagName = nameMatch[0];
    if (localName(tagName) !== "definitions") {
        return undefined;
    }
    cursor += tagName.length;

    const attributes: XmlAttribute[] = [];
    while (cursor < xml.length) {
        while (cursor < xml.length && isWhitespace(xml[cursor])) {
            cursor++;
        }
        if (cursor >= xml.length) {
            return undefined;
        }

        const char = xml[cursor];
        if (char === ">") {
            return attributes;
        }
        if (char === "/") {
            return xml[cursor + 1] === ">" ? attributes : undefined;
        }

        const attributeNameMatch = /^[^\s=/>]+/.exec(xml.slice(cursor));
        if (!attributeNameMatch) {
            return undefined;
        }
        const attributeName = attributeNameMatch[0];
        cursor += attributeName.length;

        while (cursor < xml.length && isWhitespace(xml[cursor])) {
            cursor++;
        }
        if (xml[cursor] !== "=") {
            return undefined;
        }
        cursor++;
        while (cursor < xml.length && isWhitespace(xml[cursor])) {
            cursor++;
        }

        const quote = xml[cursor];
        if (quote !== '"' && quote !== "'") {
            return undefined;
        }
        const valueEnd = xml.indexOf(quote, cursor + 1);
        if (valueEnd === -1) {
            return undefined;
        }
        attributes.push({ name: attributeName, value: xml.slice(cursor + 1, valueEnd) });
        cursor = valueEnd + 1;
    }

    return undefined;
}

/**
 * Returns the index of the `<` that opens the first real element start tag,
 * skipping the XML declaration, processing instructions, comments, DOCTYPE
 * (tolerating an internal `[…]` subset) and CDATA. `undefined` on malformed or
 * unterminated markup, or when no element start tag exists.
 */
function findRootTagStart(xml: string): number | undefined {
    let cursor = 0;
    while (cursor < xml.length) {
        while (cursor < xml.length && isWhitespace(xml[cursor])) {
            cursor++;
        }
        if (cursor >= xml.length || xml[cursor] !== "<") {
            return undefined;
        }

        if (xml.startsWith("<!--", cursor)) {
            const end = xml.indexOf("-->", cursor + 4);
            if (end === -1) {
                return undefined;
            }
            cursor = end + 3;
        } else if (xml.startsWith("<![CDATA[", cursor)) {
            const end = xml.indexOf("]]>", cursor + 9);
            if (end === -1) {
                return undefined;
            }
            cursor = end + 3;
        } else if (xml.startsWith("<?", cursor)) {
            const end = xml.indexOf("?>", cursor + 2);
            if (end === -1) {
                return undefined;
            }
            cursor = end + 2;
        } else if (xml.startsWith("<!", cursor)) {
            const end = skipDoctype(xml, cursor);
            if (end === undefined) {
                return undefined;
            }
            cursor = end;
        } else {
            return cursor;
        }
    }
    return undefined;
}

/** Returns the index past a DOCTYPE `<!…>`, honouring an internal `[…]` subset. */
function skipDoctype(xml: string, start: number): number | undefined {
    let cursor = start + 2;
    while (cursor < xml.length) {
        const char = xml[cursor];
        if (char === "[") {
            const subsetEnd = xml.indexOf("]", cursor + 1);
            if (subsetEnd === -1) {
                return undefined;
            }
            cursor = subsetEnd + 1;
        } else if (char === ">") {
            return cursor + 1;
        } else {
            cursor++;
        }
    }
    return undefined;
}

function localName(qualifiedName: string): string {
    const colon = qualifiedName.indexOf(":");
    return colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
}

function isWhitespace(char: string): boolean {
    return char === " " || char === "\t" || char === "\n" || char === "\r";
}
