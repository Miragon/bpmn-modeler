import type { CleanupItem } from "@miragon/bpmn-modeler-types";

import type { Point } from "../types";

/**
 * Structural stand-in for a parsed bpmn-moddle node, so the rules can be
 * exercised with plain object literals.
 */
export interface ModdleNode {
    $type: string;
    id?: string;
    [key: string]: unknown;
}

/**
 * How one finding is undone.
 *
 * The split is not cosmetic. `remove-element` and `set-waypoints` name things
 * that exist in the element registry, so they go through `modeling` and let
 * `BpmnUpdater`, `LabelSupport` and `UnclaimIdBehavior` do their work.
 * `splice` and `unset` name things that exist *only* in the moddle tree, which
 * no diagram-js command can express — they are applied by a raw handler,
 * correctly so, because there is nothing for `BpmnUpdater` to mirror.
 */
export type CleanupAction =
    | { kind: "remove-element"; id: string }
    | { kind: "set-waypoints"; id: string; waypoints: Point[] }
    | { kind: "splice"; array: unknown[]; index: number; node: unknown }
    | { kind: "unset"; owner: Record<string, unknown>; property: string; value: unknown };

interface Finding {
    item: CleanupItem;
    actions: CleanupAction[];
}

/** Two waypoints closer than this are the same point for cleanup purposes. */
const WAYPOINT_EPSILON = 0.5;

/** Cross product below this counts as collinear. */
const COLLINEAR_EPSILON = 1;

const CONNECTION_TYPES = new Set([
    "bpmn:SequenceFlow",
    "bpmn:MessageFlow",
    "bpmn:Association",
    "bpmn:DataInputAssociation",
    "bpmn:DataOutputAssociation",
]);

/**
 * Flow nodes that are legitimately allowed to stand alone. A lone start or end
 * event is a normal intermediate modelling state, not garbage.
 */
const STANDALONE_ALLOWED = new Set([
    "bpmn:StartEvent",
    "bpmn:EndEvent",
    "bpmn:TextAnnotation",
    "bpmn:Group",
    "bpmn:DataObjectReference",
    "bpmn:DataStoreReference",
    "bpmn:DataObject",
    "bpmn:DataStore",
]);

/**
 * Containment properties for a node that carries no moddle descriptor, i.e.
 * an object literal in a unit test. A real parse never reaches this list.
 */
const LITERAL_CONTAINMENT_PROPERTIES = [
    "rootElements",
    "flowElements",
    "artifacts",
    "laneSets",
    "lanes",
    "childLaneSet",
    "participants",
    "messageFlows",
    "dataInputAssociations",
    "dataOutputAssociations",
    "ioSpecification",
    "dataInputs",
    "dataOutputs",
];

/**
 * Diagram interchange is walked by {@link inspectDi} against the plane it
 * belongs to, so the semantic index stops at these namespaces.
 */
const DI_NAMESPACE_PREFIXES = ["bpmndi:", "dc:", "di:"];

const ENDPOINT_PROPERTIES = ["sourceRef", "targetRef"];

/** The slice of a moddle property descriptor this module reads. */
interface ModdleProperty {
    name: string;
    type?: string;
    isMany?: boolean;
    isAttr?: boolean;
    isReference?: boolean;
}

function descriptorProperties(node: ModdleNode): ModdleProperty[] | undefined {
    const properties = (node.$descriptor as { properties?: unknown } | undefined)?.properties;
    return Array.isArray(properties) ? (properties as ModdleProperty[]) : undefined;
}

/**
 * The properties that hold child elements, read from the moddle schema.
 *
 * Schema-driven rather than hand-listed because this is what decides whether
 * an element is reachable, and an element we fail to reach is one this module
 * offers to delete. A missing `ioSpecification` alone was enough to make a
 * valid `bpmn:DataInputAssociation` look like a dangling flow.
 *
 * A non-primitive type is one naming a namespace; references are excluded so a
 * back-reference never makes an element look reachable once its container is
 * gone.
 */
function containmentProperties(node: ModdleNode): string[] {
    const properties = descriptorProperties(node);
    if (!properties) return LITERAL_CONTAINMENT_PROPERTIES;

    return properties
        .filter(
            (property) =>
                !property.isAttr &&
                !property.isReference &&
                property.type?.includes(":") &&
                !DI_NAMESPACE_PREFIXES.some((prefix) => property.type?.startsWith(prefix)),
        )
        .map((property) => property.name);
}

/** Applies `visit` to every element contained by `node`. */
function forEachChild(node: ModdleNode, visit: (child: ModdleNode) => void): void {
    for (const key of containmentProperties(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach((child) => visit(child as ModdleNode));
        else if (value && typeof value === "object") visit(value as ModdleNode);
    }
}

function asArray(value: unknown): ModdleNode[] {
    return Array.isArray(value) ? (value as ModdleNode[]) : [];
}

function refId(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const id = (value as ModdleNode).id;
        return typeof id === "string" ? id : undefined;
    }
    return undefined;
}

/**
 * Every id a reference property names.
 *
 * Reference properties are not uniformly single-valued: `bpmn:DataAssociation`
 * declares `sourceRef` as a collection, so reading it as one id yields
 * `undefined` and makes a well-formed association look unresolved.
 */
function referencedIds(node: ModdleNode, property: string): string[] {
    const value = node[property];
    if (value === undefined || value === null) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.map(refId).filter((id): id is string => id !== undefined);
}

/** Whether the schema caps this reference property at one value. */
function isSingleValued(node: ModdleNode, property: string): boolean {
    const descriptor = descriptorProperties(node)?.find((entry) => entry.name === property);
    if (!descriptor) return !Array.isArray(node[property]);
    return !descriptor.isMany;
}

function describe(node: ModdleNode): string {
    const name = typeof node.name === "string" && node.name ? ` “${node.name}”` : "";
    return `${node.$type}${name}${node.id ? ` (${node.id})` : ""}`;
}

function spliceAction(array: unknown[], node: unknown): CleanupAction | undefined {
    const index = array.indexOf(node);
    return index < 0 ? undefined : { kind: "splice", array, index, node };
}

/**
 * Every BPMN element reachable from `definitions`, indexed by id.
 *
 * Reachability is what the destructive findings are decided against, so it
 * follows the moddle schema — see {@link containmentProperties}.
 */
export function indexModelElements(definitions: ModdleNode): Map<string, ModdleNode> {
    const index = new Map<string, ModdleNode>();

    const visit = (node: ModdleNode): void => {
        if (node.id && !index.has(node.id)) index.set(node.id, node);
        forEachChild(node, visit);
    };

    visit(definitions);
    return index;
}

/** Ids that any connection in the model names as its source or target. */
function connectedIds(index: Map<string, ModdleNode>): Set<string> {
    const connected = new Set<string>();
    for (const node of index.values()) {
        if (!CONNECTION_TYPES.has(node.$type)) continue;
        for (const property of ENDPOINT_PROPERTIES) {
            for (const id of referencedIds(node, property)) connected.add(id);
        }
    }
    return connected;
}

/** Ids that carry diagram interchange, i.e. that the user can actually see. */
function idsWithDi(definitions: ModdleNode): Set<string> {
    const withDi = new Set<string>();
    for (const diagram of asArray(definitions.diagrams)) {
        const plane = diagram.plane as ModdleNode | undefined;
        if (!plane) continue;
        const planeElementId = refId(plane.bpmnElement);
        if (planeElementId) withDi.add(planeElementId);
        for (const element of asArray(plane.planeElement)) {
            const id = refId(element.bpmnElement);
            if (id) withDi.add(id);
        }
    }
    return withDi;
}

function isDuplicatePoint(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < WAYPOINT_EPSILON && Math.abs(a.y - b.y) < WAYPOINT_EPSILON;
}

/**
 * True when `point` sits on the straight line between its neighbours *and*
 * between them.
 *
 * The betweenness test is what keeps a genuine 180° doubling-back — a
 * connection that runs out and comes straight back — from being mistaken for a
 * redundant bend: those three points are collinear too, but the middle one
 * lies outside its neighbours.
 */
export function isRedundantBend(previous: Point, point: Point, next: Point): boolean {
    const ax = point.x - previous.x;
    const ay = point.y - previous.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;

    if (Math.abs(ax * by - ay * bx) >= COLLINEAR_EPSILON) return false;

    const withinX =
        point.x >= Math.min(previous.x, next.x) - WAYPOINT_EPSILON &&
        point.x <= Math.max(previous.x, next.x) + WAYPOINT_EPSILON;
    const withinY =
        point.y >= Math.min(previous.y, next.y) - WAYPOINT_EPSILON &&
        point.y <= Math.max(previous.y, next.y) + WAYPOINT_EPSILON;
    return withinX && withinY;
}

/**
 * Drops repeated points and bends that lie on the line between their
 * neighbours. Docking points — first and last — are never touched.
 */
export function tidyWaypoints(waypoints: Point[]): Point[] {
    if (waypoints.length < 2) return waypoints;

    const withoutDuplicates: Point[] = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
        const point = waypoints[i];
        const isLast = i === waypoints.length - 1;
        if (!isDuplicatePoint(withoutDuplicates[withoutDuplicates.length - 1], point) || isLast) {
            withoutDuplicates.push(point);
        }
    }

    const tidied: Point[] = [withoutDuplicates[0]];
    for (let i = 1; i < withoutDuplicates.length - 1; i++) {
        const previous = tidied[tidied.length - 1];
        if (isRedundantBend(previous, withoutDuplicates[i], withoutDuplicates[i + 1])) continue;
        tidied.push(withoutDuplicates[i]);
    }
    tidied.push(withoutDuplicates[withoutDuplicates.length - 1]);
    return tidied;
}

function inspectWaypoints(edge: ModdleNode, elementId: string, label: string): Finding[] {
    const waypoints = asArray(edge.waypoint) as unknown as Point[];
    if (waypoints.length < 2) return [];

    const findings: Finding[] = [];
    const tidied = tidyWaypoints(waypoints);
    if (tidied.length === waypoints.length) return findings;

    const hasDuplicate = waypoints.some(
        (point, i) => i > 0 && isDuplicatePoint(waypoints[i - 1], point),
    );
    const action: CleanupAction = { kind: "set-waypoints", id: elementId, waypoints: tidied };

    if (hasDuplicate) {
        findings.push({
            item: {
                kind: "duplicate-waypoints",
                id: elementId,
                label: `Duplicate waypoint on ${label}`,
            },
            actions: [action],
        });
    } else {
        findings.push({
            item: {
                kind: "collinear-waypoints",
                id: elementId,
                label: `Redundant bend on ${label}`,
            },
            actions: [action],
        });
    }

    return findings;
}

function inspectDi(definitions: ModdleNode, index: Map<string, ModdleNode>): Finding[] {
    const findings: Finding[] = [];

    const diagrams = asArray(definitions.diagrams);
    for (const diagram of diagrams) {
        const plane = diagram.plane as ModdleNode | undefined;
        if (!plane) continue;

        const planeElementId = refId(plane.bpmnElement);
        if (!planeElementId || !index.has(planeElementId)) {
            const action = spliceAction(diagrams as unknown[], diagram);
            findings.push({
                item: {
                    kind: "dangling-plane",
                    id: diagram.id,
                    label: planeElementId
                        ? `Diagram plane for missing element ${planeElementId}`
                        : "Diagram plane without an element reference",
                },
                actions: action ? [action] : [],
            });
            continue;
        }

        const planeElements = asArray(plane.planeElement);
        const seen = new Set<string>();
        for (const element of planeElements) {
            const id = refId(element.bpmnElement);

            if (!id || !index.has(id)) {
                const action = spliceAction(planeElements as unknown[], element);
                findings.push({
                    item: {
                        kind: "orphan-di",
                        id: element.id,
                        label: `${element.$type} without a model element`,
                    },
                    actions: action ? [action] : [],
                });
                continue;
            }

            if (seen.has(id)) {
                const action = spliceAction(planeElements as unknown[], element);
                findings.push({
                    item: {
                        kind: "duplicate-di",
                        id: element.id,
                        label: `Second ${element.$type} for ${id}`,
                    },
                    actions: action ? [action] : [],
                });
                continue;
            }
            seen.add(id);

            const label = element.label as ModdleNode | undefined;
            if (label) {
                const bounds = label.bounds as (ModdleNode & Partial<Point>) | undefined;
                const empty =
                    !bounds ||
                    ((bounds.width as number | undefined) === 0 &&
                        (bounds.height as number | undefined) === 0);
                if (empty) {
                    findings.push({
                        item: { kind: "empty-label-di", id, label: `Empty label bounds on ${id}` },
                        actions: [
                            {
                                kind: "unset",
                                owner: element as unknown as Record<string, unknown>,
                                property: "label",
                                value: label,
                            },
                        ],
                    });
                }
            }

            if (element.$type === "bpmndi:BPMNEdge") {
                findings.push(
                    ...inspectWaypoints(element, id, describe(index.get(id) as ModdleNode)),
                );
            }
        }
    }

    return findings;
}

/**
 * Whether a connection names an endpoint the model does not contain.
 *
 * An absent endpoint only counts when the schema says the property holds a
 * single value: `bpmn:DataAssociation.sourceRef` is a collection, and an empty
 * one is a legal model rather than something to delete.
 */
function hasUnresolvedEndpoint(node: ModdleNode, index: Map<string, ModdleNode>): boolean {
    return ENDPOINT_PROPERTIES.some((property) => {
        const ids = referencedIds(node, property);
        if (ids.length === 0) return isSingleValued(node, property);
        return ids.some((id) => !index.has(id));
    });
}

function inspectSemantics(
    definitions: ModdleNode,
    index: Map<string, ModdleNode>,
    connected: Set<string>,
    withDi: Set<string>,
): Finding[] {
    const findings: Finding[] = [];

    for (const node of index.values()) {
        if (CONNECTION_TYPES.has(node.$type)) {
            if (hasUnresolvedEndpoint(node, index)) {
                findings.push({
                    item: {
                        kind: "dangling-flow",
                        id: node.id,
                        label: `${describe(node)} with an unresolved endpoint`,
                    },
                    actions: node.id ? [{ kind: "remove-element", id: node.id }] : [],
                });
            }
            continue;
        }

        if (node.$type === "bpmn:Lane") {
            const refs = asArray(node.flowNodeRef);
            const stale = refs.filter((ref) => {
                const id = refId(ref);
                return !id || !index.has(id);
            });
            if (stale.length > 0) {
                findings.push({
                    item: {
                        kind: "stale-flow-node-ref",
                        id: node.id,
                        label: `${stale.length} stale flow node reference(s) on ${describe(node)}`,
                    },
                    // Highest index first, so each splice keeps the next index valid.
                    actions: stale
                        .map((ref) => spliceAction(refs as unknown[], ref))
                        .filter((action): action is CleanupAction => Boolean(action))
                        .sort(
                            (a, b) =>
                                (b as { index: number }).index - (a as { index: number }).index,
                        ),
                });
            }
            continue;
        }

        if (node.$type === "bpmn:LaneSet" && asArray(node.lanes).length === 0) {
            const owner = node.$parent as ModdleNode | undefined;
            const action = owner
                ? spliceAction(asArray(owner.laneSets) as unknown[], node)
                : undefined;
            findings.push({
                item: {
                    kind: "empty-container",
                    id: node.id,
                    label: `Empty lane set${node.id ? ` (${node.id})` : ""}`,
                },
                actions: action ? [action] : [],
            });
            continue;
        }

        if (!node.id || STANDALONE_ALLOWED.has(node.$type)) continue;
        if (node.$type === "bpmn:BoundaryEvent" && refId(node.attachedToRef)) continue;
        if (connected.has(node.id)) continue;
        // The load-bearing conjunct: an element the user can see is never
        // garbage, however disconnected it is.
        if (withDi.has(node.id)) continue;
        if (!isFlowNode(node)) continue;

        findings.push({
            item: {
                kind: "isolated-node",
                id: node.id,
                label: `${describe(node)} is unconnected and has no diagram shape`,
            },
            actions: [{ kind: "remove-element", id: node.id }],
        });
    }

    findings.push(...inspectEmptyExtensions(definitions));
    return findings;
}

/**
 * `extensionElements` is not a containment property we index, so empty ones
 * are collected in their own pass over the containers that can carry them.
 */
function inspectEmptyExtensions(definitions: ModdleNode): Finding[] {
    const findings: Finding[] = [];

    const visit = (node: ModdleNode): void => {
        const extensions = node.extensionElements as ModdleNode | undefined;
        if (extensions && asArray(extensions.values).length === 0) {
            findings.push({
                item: {
                    kind: "empty-container",
                    id: node.id,
                    label: `Empty extension elements on ${describe(node)}`,
                },
                actions: [
                    {
                        kind: "unset",
                        owner: node as unknown as Record<string, unknown>,
                        property: "extensionElements",
                        value: extensions,
                    },
                ],
            });
        }

        forEachChild(node, visit);
    };

    visit(definitions);
    return findings;
}

/**
 * Whether the node is a flow node rather than a container, a lane, a
 * participant or a definitions-level element. Containers are excluded because
 * an empty subprocess or process is a legitimate modelling state.
 */
function isFlowNode(node: ModdleNode): boolean {
    if (!node.$type.startsWith("bpmn:")) return false;
    return (
        /Task$/.test(node.$type) ||
        /Event$/.test(node.$type) ||
        /Gateway$/.test(node.$type) ||
        node.$type === "bpmn:CallActivity"
    );
}

/**
 * Walks the model once and produces both halves of the cleanup: the report the
 * user confirms, and the actions that carry it out. One walk on purpose — two
 * would drift, and the consequence of drift here is deleting something that
 * was never reported.
 */
function collectFindings(definitions: ModdleNode): Finding[] {
    const index = indexModelElements(definitions);
    return [
        ...inspectDi(definitions, index),
        ...inspectSemantics(definitions, index, connectedIds(index), idsWithDi(definitions)),
    ];
}

/**
 * Finds everything the cleanup command may remove.
 *
 * Detection runs on the moddle tree rather than the element registry on
 * purpose: `BpmnTreeWalker.registerDi()` only logs missing or duplicate
 * `bpmnElement` references, it prunes nothing — so this garbage never reaches
 * the registry, survives a round trip, and is written back out by `saveXML()`.
 */
export function findCleanupCandidates(definitions: ModdleNode): CleanupItem[] {
    return collectFindings(definitions).map((finding) => finding.item);
}

/** The actions that carry out {@link findCleanupCandidates}, in apply order. */
export function planCleanupActions(definitions: ModdleNode): CleanupAction[] {
    return collectFindings(definitions).flatMap((finding) => finding.actions);
}
