// Bundler (webpack + ts-loader) and consumer tsc programs (modeler-types,
// modeler-core, the package) do not pick up this lib's ambient shims from
// tsconfig `include` — only its own standalone build does — so they are pulled
// in explicitly via triple-slash references, which every program honours.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-js-differ.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-moddle.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/execution-moddle.d.ts" />

import { diff } from "bpmn-js-differ";

import { buildFlowOrder, buildRemovedAnchors, sortIdsByOrder } from "./bpmnFlowOrder";
import { DiffCounts, DiffResult } from "./diffResult";

const CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
const ZEEBE_NAMESPACE = "http://camunda.org/schema/zeebe/1.0";

type Engine = "camunda" | "zeebe";

interface PropertyDescriptor {
    name: string;
    isAttr?: boolean;
    isAttribute?: boolean;
    isReference?: boolean;
    isVirtual?: boolean;
}

interface ModdleElement {
    $type: string;
    $attrs?: Record<string, string>;
    $children?: ModdleElement[];
    $descriptor: {
        isGeneric?: boolean;
        ns?: { prefix?: string; uri?: string };
        properties?: PropertyDescriptor[];
    };
    $instanceOf?: (type: string) => boolean;
    id?: string;
    [key: string]: unknown;
}

interface ParseWarning {
    message?: string;
}

interface ParseResult {
    rootElement: ModdleElement;
    warnings?: ParseWarning[];
}

interface ModdleFactory {
    (packages?: Record<string, unknown>): {
        fromXML: (xml: string) => Promise<ParseResult>;
    };
}

interface EngineParse {
    before: ModdleElement;
    after: ModdleElement;
}

interface AttributeSnapshot {
    owners: Set<string>;
    attributes: Map<string, Map<string, string>>;
}

/**
 * Compares two BPMN XML documents and returns a serializable {@link DiffResult}.
 *
 * The documents are compared once with the Camunda 7 moddle descriptor and
 * once with the Camunda 8 descriptor. Keeping the descriptors in separate
 * moddle instances avoids their incompatible `modelerTemplate` definitions;
 * the opposite engine's data is removed from each tree before comparison so
 * every execution property is considered exactly once with its typed defaults.
 * Unknown namespaced attributes are compared textually in a supplemental pass.
 *
 * Node- and browser-safe: it touches no DOM. The parser and descriptors load
 * lazily, so consumers that never call this function do not pay their cost.
 *
 * Throws on parse or diff failure — callers that need a soft failure path
 * (e.g. the extension host) wrap this in their own try/catch.
 */
export async function computeDiff(beforeXml: string, afterXml: string): Promise<DiffResult> {
    const [moddleMod, camundaMod, zeebeMod] = await Promise.all([
        import("bpmn-moddle"),
        import("camunda-bpmn-moddle/resources/camunda.json"),
        import("zeebe-bpmn-moddle/resources/zeebe.json"),
    ]);

    const moddleModule = moddleMod as unknown as {
        default?: ModdleFactory;
        BpmnModdle?: ModdleFactory;
    };
    const createBpmnModdle = moddleModule.default ?? moddleModule.BpmnModdle;
    if (typeof createBpmnModdle !== "function") {
        throw new Error("bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.");
    }

    const camundaDescriptor = descriptorValue(camundaMod);
    const zeebeDescriptor = descriptorValue(zeebeMod);
    const beforeCamundaPrefixes = namespacePrefixes(beforeXml, CAMUNDA_NAMESPACE, "camunda");
    const afterCamundaPrefixes = namespacePrefixes(afterXml, CAMUNDA_NAMESPACE, "camunda");
    const beforeZeebePrefixes = namespacePrefixes(beforeXml, ZEEBE_NAMESPACE, "zeebe");
    const afterZeebePrefixes = namespacePrefixes(afterXml, ZEEBE_NAMESPACE, "zeebe");

    const [camunda, zeebe] = await Promise.all([
        parseForEngine(
            createBpmnModdle,
            "camunda",
            camundaDescriptor,
            beforeXml,
            afterXml,
            ZEEBE_NAMESPACE,
            beforeZeebePrefixes,
            afterZeebePrefixes,
        ),
        parseForEngine(
            createBpmnModdle,
            "zeebe",
            zeebeDescriptor,
            beforeXml,
            afterXml,
            CAMUNDA_NAMESPACE,
            beforeCamundaPrefixes,
            afterCamundaPrefixes,
        ),
    ]);

    const compared = [compare(camunda), compare(zeebe)];
    const added = categoryIds(compared, "_added");
    const removed = categoryIds(compared, "_removed");
    const changed = categoryIds(compared, "_changed");
    const layoutChanged = categoryIds(compared, "_layoutChanged");

    const beforeAttributes = mergeAttributeSnapshots([
        collectNamespacedAttributes(camunda.before, beforeCamundaPrefixes, beforeZeebePrefixes),
        collectNamespacedAttributes(zeebe.before, beforeCamundaPrefixes, beforeZeebePrefixes),
    ]);
    const afterAttributes = mergeAttributeSnapshots([
        collectNamespacedAttributes(camunda.after, afterCamundaPrefixes, afterZeebePrefixes),
        collectNamespacedAttributes(zeebe.after, afterCamundaPrefixes, afterZeebePrefixes),
    ]);
    for (const id of changedAttributeOwners(beforeAttributes, afterAttributes)) {
        if (!added.has(id) && !removed.has(id)) changed.add(id);
    }

    const addedIds = [...added];
    const removedIds = [...removed];
    const changedIds = [...changed];
    const layoutChangedIds = [...layoutChanged];
    const counts: DiffCounts = {
        added: addedIds.length,
        removed: removedIds.length,
        changed: changedIds.length,
        layoutChanged: layoutChangedIds.length,
    };

    const beforeDefs = camunda.before;
    const afterDefs = camunda.after;
    const afterOrder = buildFlowOrder(afterDefs as never);
    const removedAnchors = buildRemovedAnchors(removedIds, beforeDefs as never, afterOrder);
    const sortedAdded = sortIdsByOrder(addedIds, afterOrder);
    const sortedRemoved = sortIdsByOrder(removedIds, removedAnchors);
    const sortedChanged = sortIdsByOrder(changedIds, afterOrder);
    const sortedLayoutChanged = sortIdsByOrder(layoutChangedIds, afterOrder);

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...sortedAdded, ...sortedRemoved, ...sortedChanged, ...sortedLayoutChanged]) {
        if (!seen.has(id)) {
            seen.add(id);
            merged.push(id);
        }
    }
    const navigationOrder = sortIdsByOrder(merged, afterOrder, removedAnchors);

    return {
        added: sortedAdded,
        removed: sortedRemoved,
        changed: sortedChanged,
        layoutChanged: sortedLayoutChanged,
        counts,
        navigationOrder,
    };
}

function descriptorValue(module: unknown): unknown {
    const descriptorModule = module as { default?: unknown };
    return descriptorModule.default ?? module;
}

async function parseForEngine(
    createBpmnModdle: ModdleFactory,
    engine: Engine,
    descriptor: unknown,
    beforeXml: string,
    afterXml: string,
    excludedNamespace: string,
    beforeExcludedPrefixes: ReadonlySet<string>,
    afterExcludedPrefixes: ReadonlySet<string>,
): Promise<EngineParse> {
    const moddle = createBpmnModdle({ [engine]: descriptor });
    const [beforeResult, afterResult] = await Promise.all([
        moddle.fromXML(beforeXml),
        moddle.fromXML(afterXml),
    ]);
    assertNoSkippedContent(beforeResult, engine, "before");
    assertNoSkippedContent(afterResult, engine, "after");
    stripEngineData(beforeResult.rootElement, excludedNamespace, beforeExcludedPrefixes);
    stripEngineData(afterResult.rootElement, excludedNamespace, afterExcludedPrefixes);
    return { before: beforeResult.rootElement, after: afterResult.rootElement };
}

function assertNoSkippedContent(result: ParseResult, engine: Engine, revision: string): void {
    const skipped = result.warnings?.find((warning) =>
        warning.message?.toLowerCase().includes("unparsable content"),
    );
    if (skipped) {
        throw new Error(
            `Failed to parse ${revision} BPMN with the ${engine} descriptor: ${skipped.message}`,
        );
    }
}

function compare(parsed: EngineParse): ReturnType<typeof diff> {
    return diff(
        parsed.before as Parameters<typeof diff>[0],
        parsed.after as Parameters<typeof diff>[1],
    );
}

function categoryIds(
    results: readonly ReturnType<typeof diff>[],
    category: "_added" | "_removed" | "_changed" | "_layoutChanged",
): Set<string> {
    return new Set(results.flatMap((result) => Object.keys(result[category])));
}

function namespacePrefixes(xml: string, namespace: string, canonicalPrefix: string): Set<string> {
    const prefixes = new Set([canonicalPrefix]);
    const declaration = /\bxmlns:([\w.-]+)\s*=\s*(["'])(.*?)\2/g;
    for (const match of xml.matchAll(declaration)) {
        if (match[3] === namespace) prefixes.add(match[1]);
    }
    return prefixes;
}

function stripEngineData(
    root: ModdleElement,
    excludedNamespace: string,
    excludedPrefixes: ReadonlySet<string>,
): void {
    walkContainment(root, (element) => {
        stripAttributes(element, excludedPrefixes);
        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (Array.isArray(value)) {
                const retained = value.filter(
                    (child): child is ModdleElement =>
                        !isModdleElement(child) ||
                        !belongsToNamespace(child, excludedNamespace, excludedPrefixes),
                );
                if (retained.length !== value.length) element[property] = retained;
            } else if (
                isModdleElement(value) &&
                belongsToNamespace(value, excludedNamespace, excludedPrefixes)
            ) {
                delete element[property];
            }
        }
    });

    walkContainment(root, (element) => {
        const extensionElements = element.extensionElements;
        if (
            isModdleElement(extensionElements) &&
            Array.isArray(extensionElements.values) &&
            extensionElements.values.length === 0 &&
            Object.keys(extensionElements.$attrs ?? {}).length === 0
        ) {
            delete element.extensionElements;
        }
    });
}

function stripAttributes(element: ModdleElement, excludedPrefixes: ReadonlySet<string>): void {
    if (element.$attrs) {
        for (const name of Object.keys(element.$attrs)) {
            if (hasPrefix(name, excludedPrefixes)) delete element.$attrs[name];
        }
    }
    if (element.$descriptor.isGeneric) {
        for (const name of Object.keys(element)) {
            if (hasPrefix(name, excludedPrefixes)) delete element[name];
        }
    }
}

function belongsToNamespace(
    element: ModdleElement,
    namespace: string,
    prefixes: ReadonlySet<string>,
): boolean {
    return element.$descriptor.ns?.uri === namespace || hasPrefix(element.$type, prefixes);
}

function hasPrefix(name: string, prefixes: ReadonlySet<string>): boolean {
    const separator = name.indexOf(":");
    return separator > 0 && prefixes.has(name.slice(0, separator));
}

function walkContainment(root: ModdleElement, visit: (element: ModdleElement) => void): void {
    const seen = new Set<ModdleElement>();
    const walk = (element: ModdleElement): void => {
        if (seen.has(element)) return;
        seen.add(element);
        visit(element);
        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (Array.isArray(value)) {
                for (const child of value) if (isModdleElement(child)) walk(child);
            } else if (isModdleElement(value)) {
                walk(value);
            }
        }
    };
    walk(root);
}

function containmentProperties(element: ModdleElement): string[] {
    if (element.$descriptor.isGeneric) return element.$children ? ["$children"] : [];
    return (element.$descriptor.properties ?? [])
        .filter(
            (property) =>
                !property.isVirtual &&
                !property.isReference &&
                !property.isAttr &&
                !property.isAttribute,
        )
        .map((property) => property.name);
}

function isModdleElement(value: unknown): value is ModdleElement {
    return Boolean(
        value && typeof value === "object" && "$type" in value && "$descriptor" in value,
    );
}

function collectNamespacedAttributes(
    root: ModdleElement,
    camundaPrefixes: ReadonlySet<string>,
    zeebePrefixes: ReadonlySet<string>,
): AttributeSnapshot {
    const snapshot: AttributeSnapshot = { owners: new Set(), attributes: new Map() };
    const processVisuals = trackedProcessVisuals(root);
    const seen = new Set<ModdleElement>();

    const walk = (element: ModdleElement, inheritedOwner?: string, path = element.$type): void => {
        if (seen.has(element)) return;
        seen.add(element);
        const owner = trackedId(element, processVisuals) ?? inheritedOwner;
        if (owner) snapshot.owners.add(owner);

        if (owner) {
            const attributes = customAttributes(element, camundaPrefixes, zeebePrefixes);
            if (attributes.length > 0) {
                const owned = snapshot.attributes.get(owner) ?? new Map<string, string>();
                for (const [name, value] of attributes) owned.set(`${path}@${name}`, value);
                snapshot.attributes.set(owner, owned);
            }
        }

        for (const property of containmentProperties(element)) {
            const value = element[property];
            if (Array.isArray(value)) {
                const typeOccurrences = new Map<string, number>();
                for (const child of value) {
                    if (!isModdleElement(child)) continue;
                    const occurrence = typeOccurrences.get(child.$type) ?? 0;
                    typeOccurrences.set(child.$type, occurrence + 1);
                    walk(child, owner, `${path}.${property}[${child.$type}:${occurrence}]`);
                }
            } else if (isModdleElement(value)) {
                walk(value, owner, `${path}.${property}`);
            }
        }
    };

    walk(root);
    return snapshot;
}

function customAttributes(
    element: ModdleElement,
    camundaPrefixes: ReadonlySet<string>,
    zeebePrefixes: ReadonlySet<string>,
): [string, string][] {
    const attributes: Record<string, unknown> = element.$descriptor.isGeneric
        ? element
        : (element.$attrs ?? {});
    return Object.entries(attributes).filter(
        (entry): entry is [string, string] =>
            typeof entry[1] === "string" &&
            isQualifiedAttribute(entry[0]) &&
            !hasPrefix(entry[0], camundaPrefixes) &&
            !hasPrefix(entry[0], zeebePrefixes),
    );
}

function isQualifiedAttribute(name: string): boolean {
    return name.includes(":") && name !== "xmlns" && !name.startsWith("xmlns:");
}

function trackedProcessVisuals(root: ModdleElement): Map<ModdleElement, string> {
    const visuals = new Map<ModdleElement, string>();
    walkContainment(root, (element) => {
        if (!isType(element, "bpmn:Participant") || !element.id) return;
        const processRef = element.processRef;
        if (isModdleElement(processRef)) visuals.set(processRef, element.id);
    });
    return visuals;
}

function trackedId(
    element: ModdleElement,
    processVisuals: Map<ModdleElement, string>,
): string | undefined {
    if (isType(element, "bpmn:DataObject")) return undefined;
    if (isType(element, "bpmn:Process")) return processVisuals.get(element) ?? element.id;
    const tracked = [
        "bpmn:Participant",
        "bpmn:Collaboration",
        "bpmn:FlowElement",
        "bpmn:SequenceFlow",
        "bpmn:MessageFlow",
        "bpmn:Lane",
        "bpmn:DataAssociation",
    ].some((type) => isType(element, type));
    return tracked ? element.id : undefined;
}

function isType(element: ModdleElement, type: string): boolean {
    return element.$type === type || element.$instanceOf?.(type) === true;
}

function mergeAttributeSnapshots(snapshots: readonly AttributeSnapshot[]): AttributeSnapshot {
    const merged: AttributeSnapshot = { owners: new Set(), attributes: new Map() };
    for (const snapshot of snapshots) {
        for (const owner of snapshot.owners) merged.owners.add(owner);
        for (const [owner, attributes] of snapshot.attributes) {
            const owned = merged.attributes.get(owner) ?? new Map<string, string>();
            for (const [name, value] of attributes) owned.set(name, value);
            merged.attributes.set(owner, owned);
        }
    }
    return merged;
}

function changedAttributeOwners(before: AttributeSnapshot, after: AttributeSnapshot): Set<string> {
    const changed = new Set<string>();
    for (const owner of before.owners) {
        if (!after.owners.has(owner)) continue;
        if (!mapsEqual(before.attributes.get(owner), after.attributes.get(owner)))
            changed.add(owner);
    }
    return changed;
}

function mapsEqual(left?: Map<string, string>, right?: Map<string, string>): boolean {
    if ((left?.size ?? 0) !== (right?.size ?? 0)) return false;
    if (!left) return true;
    for (const [key, value] of left) if (right?.get(key) !== value) return false;
    return true;
}
