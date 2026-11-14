// Bundler (webpack + ts-loader) and consumer tsc programs (modeler-types,
// modeler-core, the package) do not pick up this lib's ambient shims from
// tsconfig `include` — only its own standalone build does — so they are pulled
// in explicitly via triple-slash references, which every program honours.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-js-differ.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/execution-moddle.d.ts" />

import { buildFlowOrder, buildRemovedAnchors, sortIdsByOrder } from "./bpmnFlowOrder";
import {
    BpmnModdleFactory,
    ModdleElement,
    ModdleParseResult,
    loadBpmnModdle,
    skippedContentWarning,
} from "./bpmnModdleFactory";
import { containmentProperties, isModdleElement, walkContainment } from "./moddleContainment";
import { NamespaceDeclaration, namespaceDeclarations } from "./namespaceDeclarations";
import { trackedElementOf } from "./trackedElements";
import { categoryIds, runDiff } from "./upstreamInternals/differResult";
import { collectDrawnEdgeIds, layoutOnlyEdgeIds } from "./drawnEdges";
import { DiffCounts, DiffResult } from "./diffResult";

/** A Camunda 7 or 8 moddle descriptor with the namespace it describes. */
interface ExecutionPackage {
    prefix: string;
    uri: string;
    descriptor: unknown;
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
 * Node- and browser-safe: it touches no DOM. The parser, the descriptors and
 * the differ load lazily, so consumers that never call this function do not
 * pay their cost.
 *
 * Throws on parse or diff failure — callers that need a soft failure path
 * (e.g. the extension host) wrap this in their own try/catch.
 */
export async function computeDiff(beforeXml: string, afterXml: string): Promise<DiffResult> {
    const [createBpmnModdle, camundaMod, zeebeMod, beforeDeclarations, afterDeclarations] =
        await Promise.all([
            loadBpmnModdle(),
            import("camunda-bpmn-moddle/resources/camunda.json"),
            import("zeebe-bpmn-moddle/resources/zeebe.json"),
            namespaceDeclarations(beforeXml),
            namespaceDeclarations(afterXml),
        ]);

    const camundaPackage = executionPackage(camundaMod);
    const zeebePackage = executionPackage(zeebeMod);
    const beforeCamundaPrefixes = namespacePrefixes(beforeDeclarations, camundaPackage);
    const afterCamundaPrefixes = namespacePrefixes(afterDeclarations, camundaPackage);
    const beforeZeebePrefixes = namespacePrefixes(beforeDeclarations, zeebePackage);
    const afterZeebePrefixes = namespacePrefixes(afterDeclarations, zeebePackage);

    const [camunda, zeebe] = await Promise.all([
        parseForEngine(
            createBpmnModdle,
            camundaPackage,
            beforeXml,
            afterXml,
            zeebePackage.uri,
            beforeZeebePrefixes,
            afterZeebePrefixes,
        ),
        parseForEngine(
            createBpmnModdle,
            zeebePackage,
            beforeXml,
            afterXml,
            camundaPackage.uri,
            beforeCamundaPrefixes,
            afterCamundaPrefixes,
        ),
    ]);

    const compared = await Promise.all([compare(camunda), compare(zeebe)]);
    const added = categoryIds(compared, "added");
    const removed = categoryIds(compared, "removed");
    const changed = categoryIds(compared, "changed");
    const layoutChanged = categoryIds(compared, "layoutChanged");

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

    const drawnEdgeIds = collectDrawnEdgeIds([beforeDefs, afterDefs]);
    const skipped = layoutOnlyEdgeIds(
        {
            added: addedIds,
            removed: removedIds,
            changed: changedIds,
            layoutChanged: layoutChangedIds,
        },
        (id) => drawnEdgeIds.has(id),
    );

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of [...sortedAdded, ...sortedRemoved, ...sortedChanged, ...sortedLayoutChanged]) {
        if (!seen.has(id) && !skipped.has(id)) {
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

function executionPackage(module: unknown): ExecutionPackage {
    const descriptor = (module as { default?: unknown }).default ?? module;
    const { prefix, uri } = descriptor as { prefix?: unknown; uri?: unknown };
    if (typeof prefix !== "string" || typeof uri !== "string") {
        throw new Error("A Camunda moddle descriptor names no `prefix` and `uri`.");
    }
    return { prefix, uri, descriptor };
}

async function parseForEngine(
    createBpmnModdle: BpmnModdleFactory,
    engine: ExecutionPackage,
    beforeXml: string,
    afterXml: string,
    excludedNamespace: string,
    beforeExcludedPrefixes: ReadonlySet<string>,
    afterExcludedPrefixes: ReadonlySet<string>,
): Promise<EngineParse> {
    const moddle = createBpmnModdle({ [engine.prefix]: engine.descriptor });
    const [beforeResult, afterResult] = await Promise.all([
        moddle.fromXML(beforeXml),
        moddle.fromXML(afterXml),
    ]);
    assertNoSkippedContent(beforeResult, engine.prefix, "before");
    assertNoSkippedContent(afterResult, engine.prefix, "after");
    stripEngineData(beforeResult.rootElement, excludedNamespace, beforeExcludedPrefixes);
    stripEngineData(afterResult.rootElement, excludedNamespace, afterExcludedPrefixes);
    return { before: beforeResult.rootElement, after: afterResult.rootElement };
}

function assertNoSkippedContent(
    result: ModdleParseResult,
    descriptorName: string,
    revision: string,
): void {
    const skipped = skippedContentWarning(result);
    if (skipped) {
        throw new Error(
            `Failed to parse ${revision} BPMN with the ${descriptorName} descriptor: ${skipped}`,
        );
    }
}

function compare(parsed: EngineParse): ReturnType<typeof runDiff> {
    return runDiff(parsed.before, parsed.after);
}

function namespacePrefixes(
    declarations: readonly NamespaceDeclaration[],
    engine: ExecutionPackage,
): Set<string> {
    const prefixes = new Set([engine.prefix]);
    for (const { prefix, uri } of declarations) {
        if (prefix && uri === engine.uri) prefixes.add(prefix);
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

function collectNamespacedAttributes(
    root: ModdleElement,
    camundaPrefixes: ReadonlySet<string>,
    zeebePrefixes: ReadonlySet<string>,
): AttributeSnapshot {
    const snapshot: AttributeSnapshot = { owners: new Set(), attributes: new Map() };
    const seen = new Set<ModdleElement>();

    const walk = (element: ModdleElement, inheritedOwner?: string, path = element.$type): void => {
        if (seen.has(element)) return;
        seen.add(element);
        const owner = trackedElementOf(element)?.id ?? inheritedOwner;
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
