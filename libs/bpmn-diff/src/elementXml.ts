import {
    BpmnModdle,
    ModdleElement,
    isType,
    loadBpmnModdle,
    skippedContentWarning,
} from "./bpmnModdleFactory";
import { containmentProperties, isModdleElement, walkContainment } from "./moddleContainment";
import { documentPrefixes, namespaceDeclarations } from "./namespaceDeclarations";
import { isTrackedElement, trackedElementOf } from "./trackedElements";

const XMLNS_PREFIX = "xmlns:";
const PARSER_PREFIXES: ReadonlyArray<readonly [string, string]> = [
    ["xsi", "http://www.w3.org/2001/XMLSchema-instance"],
    ["xml", "http://www.w3.org/XML/1998/namespace"],
];

/**
 * Returns the XML of one BPMN element without its diagram interchange and
 * without the children the diff reports under their own id (flow elements,
 * lanes, participants, message flows, data associations, …), or `undefined`
 * when `elementId` names no semantic element. Other children, such as lane
 * sets, data objects and artifacts, stay, because the diff counts their
 * changes for this element. A participant's snippet is followed by the
 * process whose changes the diff reports under the participant's id.
 *
 * The snippet is re-serialised, not cut from the source: formatting and
 * comments differ from the file, attributes without a descriptor are sorted,
 * and each namespace is written with one prefix taken from the declarations
 * in `prefixSources`, then in `xml`. Two versions given the same
 * `prefixSources` therefore write a namespace with the same prefix. It
 * declares only the namespaces it uses. No engine descriptor is loaded, so
 * Camunda 7 and 8 extensions round-trip as generic elements.
 *
 * Rejects when `xml` cannot be parsed, when the parser skips content, and
 * when the snippet would use a prefix it cannot declare.
 */
export async function elementXml(
    xml: string,
    elementId: string,
    prefixSources: readonly string[] = [xml],
): Promise<string | undefined> {
    const createBpmnModdle = await loadBpmnModdle();
    const writerPrefixes = knownPrefixes(createBpmnModdle());
    const declarationSources = prefixSources.includes(xml)
        ? prefixSources
        : [...prefixSources, xml];
    const declarations = await Promise.all(
        declarationSources.map((source) => namespaceDeclarations(source)),
    );
    const prefixByUri = documentPrefixes(declarations.flat(), writerPrefixes);
    const moddle = createBpmnModdle({}, { nsMap: Object.fromEntries(prefixByUri) });
    const parsed = await moddle.fromXML(xml);
    const skipped = skippedContentWarning(parsed);
    if (skipped) throw new Error(`Failed to parse BPMN for the XML of ${elementId}: ${skipped}`);
    const element = parsed.elementsById[elementId];
    if (!element || !isSemanticElement(element)) return undefined;

    const snippetRoots = [element];
    const pooledProcess = element.processRef;
    if (isModdleElement(pooledProcess) && trackedElementOf(pooledProcess) === element) {
        snippetRoots.push(pooledProcess);
    }

    const uriByPrefix = new Map([...prefixByUri].map(([uri, prefix]) => [prefix, uri]));
    const snippets: string[] = [];
    for (const snippetRoot of snippetRoots) {
        stripTrackedChildren(snippetRoot);
        sortAttributesWithoutDescriptor(snippetRoot);
        const prefixes = usedPrefixes(snippetRoot);
        const undeclaredPrefix = prefixes.find(
            (prefix) => !uriByPrefix.has(prefix) && !writerPrefixes.has(prefix),
        );
        if (undeclaredPrefix) {
            throw new Error(
                `The XML of ${elementId} uses the namespace prefix ${undeclaredPrefix}, which it does not declare.`,
            );
        }
        declareNamespaces(snippetRoot, prefixes, uriByPrefix);
        const { xml: snippet } = await moddle.toXML(snippetRoot, { format: true, preamble: false });
        snippets.push(snippet.trimEnd());
    }
    return snippets.join("\n\n");
}

/** The serializer declares these itself; pinning them keeps every other namespace's prefix from colliding. */
function knownPrefixes(moddle: BpmnModdle): Map<string, string> {
    return new Map([
        ...PARSER_PREFIXES,
        ...moddle.getPackages().map(({ prefix, uri }) => [prefix, uri] as const),
    ]);
}

function isSemanticElement(element: ModdleElement): boolean {
    return isType(element, "bpmn:BaseElement") && !isType(element, "bpmn:Definitions");
}

function stripTrackedChildren(root: ModdleElement): void {
    // BPMN contains tracked elements only in collections.
    walkContainment(root, (element) => {
        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (!Array.isArray(value)) continue;
            const untracked = value.filter(
                (child) => !isModdleElement(child) || !isTrackedElement(child),
            );
            if (untracked.length === 0) delete element[property];
            else if (untracked.length !== value.length) element[property] = untracked;
        }
    });
}

/**
 * The serializer writes attributes without a descriptor in source order, so
 * two files that order them differently would give different text.
 * Declarations inside the snippet are dropped, since the parser has already
 * renamed their prefixes to the document's.
 */
function sortAttributesWithoutDescriptor(root: ModdleElement): void {
    walkContainment(root, (element) => {
        const attributes = attributesWithoutDescriptor(element);
        const sortedEntries = Object.entries(attributes)
            .filter(([name]) => !name.startsWith("$") && !name.startsWith(XMLNS_PREFIX))
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
        for (const name of Object.keys(attributes)) {
            if (!name.startsWith("$")) delete attributes[name];
        }
        for (const [name, value] of sortedEntries) attributes[name] = value;
    });
}

/** Every prefix the snippet's element names and attributes use. */
function usedPrefixes(root: ModdleElement): string[] {
    const prefixes = new Set<string>();
    walkContainment(root, (element) => {
        const qualifiedNames = element.$descriptor.isGeneric
            ? [element.$type, ...Object.keys(element)]
            : Object.keys(element.$attrs ?? {});
        for (const name of qualifiedNames) {
            const prefix = namePrefix(name);
            if (prefix) prefixes.add(prefix);
        }
    });
    return [...prefixes];
}

/** Without a descriptor the serializer drops prefixed names whose namespace the snippet does not declare. */
function declareNamespaces(
    root: ModdleElement,
    prefixes: readonly string[],
    uriByPrefix: ReadonlyMap<string, string>,
): void {
    const attributes = (root.$attrs ??= {});
    for (const prefix of prefixes) {
        const uri = uriByPrefix.get(prefix);
        if (uri) attributes[XMLNS_PREFIX + prefix] = uri;
    }
}

function attributesWithoutDescriptor(element: ModdleElement): Record<string, unknown> {
    return element.$descriptor.isGeneric ? element : (element.$attrs ?? {});
}

function namePrefix(qualifiedName: string): string | undefined {
    const separator = qualifiedName.indexOf(":");
    return separator > 0 ? qualifiedName.slice(0, separator) : undefined;
}
