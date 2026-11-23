/**
 * Builds a navigation order for diff highlights based on BPMN sequence-flow
 * direction.
 *
 * Produces a deterministic "Start Event → End Event" ordering so the stepper
 * walks ids in flow direction rather than the arbitrary order `bpmn-js-differ`
 * reports them. The order comes from a BFS over the parsed `bpmn-moddle`
 * definitions, starting at the StartEvents of the top-level processes and
 * following outgoing SequenceFlows, each flow indexed right after its source.
 * Every sub-process is walked as one contiguous block: an embedded one's
 * content comes right after its shape and before its outgoing flows (entered
 * at its own StartEvents, or at every node without an incoming flow when it
 * has none, e.g. an ad-hoc sub-process), and each event sub-process follows
 * its parent container's flow, shape first. A boundary event follows its host
 * activity's outgoing flows, with its own outgoing flows right after it, so
 * its exception path is walked like any other branch. BPMNDI bounds (visual
 * `y` then `x`) are the tiebreaker for parallel branches and boundary events
 * on one host, and the key for orphan nodes no walk reaches.
 *
 * Removed elements only exist on the *before* canvas, so the after-pane order
 * has no slot for them.  {@link buildRemovedAnchors} walks the before graph
 * for each removed id, picks a surviving neighbour (incoming source first,
 * then a boundary event's host, outgoing target as fallback), and assigns the
 * removed id a fractional index adjacent to that anchor's position in the
 * after order.  This places removed nodes near where they sit in the flow
 * rather than at the end.
 *
 * The ordering is a heuristic — multi-pool collaborations, complex parallel
 * gateway fan-outs, and disconnected nodes all have known limitations
 * documented inline.  It will not always match a human's mental walk of every
 * diagram, but it is far more recognisable than an insertion-order sequence.
 */

/**
 * Minimal subset of a parsed bpmn-moddle element used by this module. Exported
 * because it appears in the signatures of the exported `buildFlowOrder` /
 * `buildRemovedAnchors` functions — leaving it unexported forced callers to
 * reference an anonymous, unnameable structural type at the boundary.
 */
export interface ModdleElement {
    $type: string;
    id?: string;
    [key: string]: unknown;
}

/**
 * Position assigned to one BPMN element in the canonical traversal.
 *
 * `flowIndex` is the BFS visit index (fractional values are used to wedge
 * removed elements between two surviving siblings).  `y`/`x` come from BPMNDI
 * bounds and are tiebreakers for elements that share an index — most
 * commonly a parallel-gateway fork where two branches start at the same depth.
 * `blockEndIndex` is set on a sub-process: the index of the last element of its
 * block, so an element anchored after the sub-process lands behind its content.
 */
export interface FlowPosition {
    flowIndex: number;
    y: number;
    x: number;
    blockEndIndex?: number;
}

/**
 * Builds the `id → FlowPosition` map for one set of parsed definitions.
 *
 * The returned map covers every FlowElement reachable through `rootElements`
 * (including nested SubProcesses), plus orphan nodes appended at the end in
 * visual top-left → bottom-right order. An orphaned sub-process still brings
 * its content right after its shape.
 */
export function buildFlowOrder(root: ModdleElement): Map<string, FlowPosition> {
    const walk = new FlowWalk(indexFlowGraph(root), collectBounds(root));
    const topLevelProcesses = collectTopLevelProcesses(root);
    walk.walkContainerFlow(topLevelProcesses, topLevelProcesses.flatMap(startEventsOf));
    walk.appendOrphans();
    return walk.order;
}

/**
 * For each removed id, returns the position it should occupy in the *after*
 * order.  The anchor is found by walking the before graph for a neighbour
 * that survived the diff:
 *
 *   - incoming source → place removed just after that node (`+0.5`)
 *   - host of a boundary event → place removed just after the host (`+0.5`)
 *   - outgoing target → place removed just before that node (`-0.5`)
 *   - flow's own source/target if the removed element is itself a sequence flow
 *
 * Just after a sub-process means after its whole block, content included.
 *
 * Removed ids without any surviving neighbour are omitted from the map; the
 * caller's sort then drops them to the end via the fallback index.
 */
export function buildRemovedAnchors(
    removedIds: readonly string[],
    beforeRoot: ModdleElement,
    afterOrder: ReadonlyMap<string, FlowPosition>,
): Map<string, FlowPosition> {
    const anchors = new Map<string, FlowPosition>();
    if (removedIds.length === 0) return anchors;

    const { flowElementsById, incomingByTarget, outgoingBySource } = indexFlowGraph(beforeRoot);

    const anchorAfter = (baseId: string, offset: number): FlowPosition | undefined => {
        const p = afterOrder.get(baseId);
        return p && { flowIndex: (p.blockEndIndex ?? p.flowIndex) + offset, y: p.y, x: p.x };
    };
    const anchorBefore = (baseId: string, offset: number): FlowPosition | undefined => {
        const p = afterOrder.get(baseId);
        return p && { flowIndex: p.flowIndex - offset, y: p.y, x: p.x };
    };

    for (const removedId of removedIds) {
        const node = flowElementsById.get(removedId);
        if (!node) continue;

        let anchor: FlowPosition | undefined;

        /**
         * 1. Removed shape: prefer the surviving predecessor.
         */
        for (const flow of incomingByTarget.get(removedId) ?? []) {
            const sourceId = refId(flow.sourceRef);
            if (sourceId && afterOrder.has(sourceId)) {
                anchor = anchorAfter(sourceId, 0.5);
                break;
            }
            if (flow.id && afterOrder.has(flow.id)) {
                anchor = anchorAfter(flow.id, 0.25);
                break;
            }
        }
        /**
         * 2. Removed boundary event: its surviving host.
         */
        if (!anchor) {
            const hostId = refId(node.attachedToRef);
            if (hostId && afterOrder.has(hostId)) anchor = anchorAfter(hostId, 0.5);
        }
        /**
         * 3. Otherwise the surviving successor.
         */
        if (!anchor) {
            for (const flow of outgoingBySource.get(removedId) ?? []) {
                const targetId = refId(flow.targetRef);
                if (targetId && afterOrder.has(targetId)) {
                    anchor = anchorBefore(targetId, 0.5);
                    break;
                }
                if (flow.id && afterOrder.has(flow.id)) {
                    anchor = anchorBefore(flow.id, 0.25);
                    break;
                }
            }
        }
        /**
         * 4. Removed sequence flow: anchor on its own endpoints.
         */
        if (!anchor && node.$type === "bpmn:SequenceFlow") {
            const sourceId = refId(node.sourceRef);
            const targetId = refId(node.targetRef);
            if (sourceId && afterOrder.has(sourceId)) {
                anchor = anchorAfter(sourceId, 0.5);
            } else if (targetId && afterOrder.has(targetId)) {
                anchor = anchorBefore(targetId, 0.5);
            }
        }

        if (anchor) anchors.set(removedId, anchor);
    }

    return anchors;
}

/**
 * Returns `ids` sorted by their position in `primary`, falling back to
 * `secondary` (typically the removed-anchor map) for ids missing from
 * `primary`.  Ids not in either map are appended at the end in their input
 * order.
 */
export function sortIdsByOrder(
    ids: readonly string[],
    primary: ReadonlyMap<string, FlowPosition>,
    secondary?: ReadonlyMap<string, FlowPosition>,
): string[] {
    const positionOf = (id: string): FlowPosition | undefined =>
        primary.get(id) ?? secondary?.get(id);

    return [...ids].sort((a, b) => {
        const pa = positionOf(a);
        const pb = positionOf(b);
        if (pa && pb) {
            return pa.flowIndex - pb.flowIndex || pa.y - pb.y || pa.x - pb.x;
        }
        /**
         * Unknown ids sink to the end while keeping their relative order.
         */
        if (pa) return -1;
        if (pb) return 1;
        return 0;
    });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

type Point = { x: number; y: number };

const ORIGIN: Point = { x: 0, y: 0 };

interface FlowGraph {
    flowElementsById: ReadonlyMap<string, ModdleElement>;
    incomingByTarget: ReadonlyMap<string, readonly ModdleElement[]>;
    outgoingBySource: ReadonlyMap<string, readonly ModdleElement[]>;
    boundaryEventsByHost: ReadonlyMap<string, readonly ModdleElement[]>;
}

/**
 * Hands out flow indices in walk order. Each element is placed at most once,
 * so an element reachable along several paths keeps its first position.
 */
class FlowWalk {
    readonly order = new Map<string, FlowPosition>();
    private readonly claimedIds = new Set<string>();
    private nextFlowIndex = 0;

    constructor(
        private readonly graph: FlowGraph,
        private readonly bounds: ReadonlyMap<string, Point>,
    ) {}

    /**
     * Walks the flow of `containers` from `entryNodes`, then each of their
     * event sub-processes as one block.
     */
    walkContainerFlow(
        containers: readonly ModdleElement[],
        entryNodes: readonly ModdleElement[],
    ): void {
        this.walkFlow(entryNodes);
        const eventSubProcesses = containers.flatMap((container) =>
            readArray<ModdleElement>(container.flowElements).filter(isEventSubProcess),
        );
        for (const eventSubProcess of this.inReadingOrder(eventSubProcesses)) {
            if (this.isUnclaimed(eventSubProcess)) this.placeNode(eventSubProcess);
        }
    }

    /**
     * Orphans: elements no walk reaches (e.g. compensation handlers, linked by
     * an association rather than a sequence flow, or disconnected nodes).
     * Appended in visual reading order so they at least step predictably even
     * though the flow position is unknown.
     */
    appendOrphans(): void {
        const orphans = [...this.graph.flowElementsById.values()].filter((flowElement) =>
            this.isUnclaimed(flowElement),
        );
        for (const orphan of this.inReadingOrder(orphans)) {
            // An orphaned sub-process has already placed its content with it.
            if (this.isUnclaimed(orphan)) this.placeNode(orphan);
        }
    }

    private walkFlow(entryNodes: readonly ModdleElement[]): void {
        const queue: ModdleElement[] = [];
        const enqueue = (node: ModdleElement | undefined): void => {
            if (!node || !this.isUnclaimed(node)) return;
            this.claimedIds.add(node.id!);
            queue.push(node);
        };

        for (const node of this.inReadingOrder(entryNodes)) enqueue(node);

        while (queue.length > 0) {
            const node = queue.shift()!;
            this.placeNode(node);
            this.followOutgoingFlows(node, enqueue);
            const boundaryEvents = this.graph.boundaryEventsByHost.get(node.id!) ?? [];
            for (const boundaryEvent of this.inReadingOrder(boundaryEvents)) {
                if (!this.isUnclaimed(boundaryEvent)) continue;
                this.place(boundaryEvent);
                this.followOutgoingFlows(boundaryEvent, enqueue);
            }
        }
    }

    private followOutgoingFlows(
        source: ModdleElement,
        enqueue: (target: ModdleElement | undefined) => void,
    ): void {
        for (const flow of this.outgoingInReadingOrder(source)) {
            if (this.isUnclaimed(flow)) this.place(flow, this.positionOf(source.id));
            const targetId = refId(flow.targetRef);
            if (targetId) enqueue(this.graph.flowElementsById.get(targetId));
        }
    }

    private placeNode(node: ModdleElement): void {
        const position = this.place(node);
        if (!isSubProcess(node)) return;
        this.walkContainerFlow([node], entryNodesOf(node, this.graph));
        position.blockEndIndex = this.nextFlowIndex - 1;
    }

    private place(element: ModdleElement, fallback: Point = ORIGIN): FlowPosition {
        const id = element.id!;
        const { x, y } = this.bounds.get(id) ?? fallback;
        const position: FlowPosition = { flowIndex: this.nextFlowIndex++, y, x };
        this.claimedIds.add(id);
        this.order.set(id, position);
        return position;
    }

    private isUnclaimed(element: ModdleElement): boolean {
        return element.id !== undefined && !this.claimedIds.has(element.id);
    }

    private positionOf(id: string | undefined): Point {
        return (id ? this.bounds.get(id) : undefined) ?? ORIGIN;
    }

    /** Parallel branches are visited top-to-bottom, left-to-right by target. */
    private outgoingInReadingOrder(node: ModdleElement): ModdleElement[] {
        const outgoing = this.graph.outgoingBySource.get(node.id!) ?? [];
        return [...outgoing].sort((a, b) =>
            compareReadingOrder(
                this.positionOf(refId(a.targetRef)),
                this.positionOf(refId(b.targetRef)),
            ),
        );
    }

    private inReadingOrder(elements: readonly ModdleElement[]): ModdleElement[] {
        return [...elements].sort((a, b) =>
            compareReadingOrder(this.positionOf(a.id), this.positionOf(b.id)),
        );
    }
}

function compareReadingOrder(a: Point, b: Point): number {
    return a.y - b.y || a.x - b.x;
}

/**
 * `bpmn-moddle` does not auto-populate `incoming`/`outgoing` on FlowNodes
 * when references resolve via the `references` companion array — different
 * call paths return different shapes.  The flow indexes are built from
 * SequenceFlow.sourceRef/targetRef instead, so the walk works regardless.
 */
function indexFlowGraph(root: ModdleElement): FlowGraph {
    const flowElementsById = new Map<string, ModdleElement>();
    for (const container of collectContainers(root)) {
        for (const flowElement of readArray<ModdleElement>(container.flowElements)) {
            if (flowElement.id) flowElementsById.set(flowElement.id, flowElement);
        }
    }

    const incomingByTarget = new Map<string, ModdleElement[]>();
    const outgoingBySource = new Map<string, ModdleElement[]>();
    const boundaryEventsByHost = new Map<string, ModdleElement[]>();
    for (const flowElement of flowElementsById.values()) {
        if (flowElement.$type === "bpmn:SequenceFlow") {
            appendTo(outgoingBySource, refId(flowElement.sourceRef), flowElement);
            appendTo(incomingByTarget, refId(flowElement.targetRef), flowElement);
        } else if (isBoundaryEvent(flowElement)) {
            appendTo(boundaryEventsByHost, refId(flowElement.attachedToRef), flowElement);
        }
    }
    return { flowElementsById, incomingByTarget, outgoingBySource, boundaryEventsByHost };
}

function appendTo(
    index: Map<string, ModdleElement[]>,
    key: string | undefined,
    element: ModdleElement,
): void {
    if (!key) return;
    const list = index.get(key);
    if (list) list.push(element);
    else index.set(key, [element]);
}

function collectContainers(root: ModdleElement): ModdleElement[] {
    const containers: ModdleElement[] = [];
    const visit = (el: ModdleElement): void => {
        const fes = readArray<ModdleElement>(el.flowElements);
        if (fes.length > 0 || isContainer(el)) {
            containers.push(el);
            for (const child of fes) visit(child);
        }
        /**
         * Collaboration → walk participants → processRef.
         */
        for (const p of readArray<ModdleElement>(el.participants)) {
            const proc = p.processRef as ModdleElement | undefined;
            if (proc) visit(proc);
        }
    };

    for (const re of readArray<ModdleElement>(root.rootElements)) {
        visit(re);
    }
    return containers;
}

/** Root processes and the processes behind collaboration participants, once each. */
function collectTopLevelProcesses(root: ModdleElement): ModdleElement[] {
    const processes = new Set<ModdleElement>();
    for (const rootElement of readArray<ModdleElement>(root.rootElements)) {
        if (rootElement.$type === "bpmn:Process") processes.add(rootElement);
        for (const participant of readArray<ModdleElement>(rootElement.participants)) {
            const process = participant.processRef as ModdleElement | undefined;
            if (process) processes.add(process);
        }
    }
    return [...processes];
}

function startEventsOf(container: ModdleElement): ModdleElement[] {
    return readArray<ModdleElement>(container.flowElements).filter(
        (flowElement) => flowElement.$type === "bpmn:StartEvent",
    );
}

function entryNodesOf(subProcess: ModdleElement, graph: FlowGraph): ModdleElement[] {
    const startEvents = startEventsOf(subProcess);
    if (startEvents.length > 0) return startEvents;
    return readArray<ModdleElement>(subProcess.flowElements).filter(
        (flowElement) =>
            flowElement.$type !== "bpmn:SequenceFlow" &&
            !isEventSubProcess(flowElement) &&
            !isBoundaryEvent(flowElement) &&
            !graph.incomingByTarget.has(flowElement.id ?? ""),
    );
}

function isContainer(el: ModdleElement): boolean {
    return el.$type === "bpmn:Process" || isSubProcess(el);
}

function isBoundaryEvent(el: ModdleElement): boolean {
    return el.$type === "bpmn:BoundaryEvent";
}

function isSubProcess(el: ModdleElement): boolean {
    return (
        el.$type === "bpmn:SubProcess" ||
        el.$type === "bpmn:AdHocSubProcess" ||
        el.$type === "bpmn:Transaction"
    );
}

function isEventSubProcess(el: ModdleElement): boolean {
    return isSubProcess(el) && el.triggeredByEvent === true;
}

/**
 * Reads BPMNDI bounds keyed by `bpmnElement.id`, using waypoint midpoints as
 * a fallback for edges (which carry `waypoint` instead of `bounds`).
 */
function collectBounds(root: ModdleElement): Map<string, Point> {
    const result = new Map<string, Point>();
    for (const diagram of readArray<ModdleElement>(root.diagrams)) {
        const plane = diagram.plane as ModdleElement | undefined;
        if (!plane) continue;
        for (const pe of readArray<ModdleElement>(plane.planeElement)) {
            const target = pe.bpmnElement as ModdleElement | undefined;
            const id = target?.id;
            if (!id) continue;

            const b = pe.bounds as { x?: number; y?: number } | undefined;
            if (b && typeof b.x === "number" && typeof b.y === "number") {
                result.set(id, { x: b.x, y: b.y });
                continue;
            }

            const wps = readArray<Point>(pe.waypoint);
            if (wps.length > 0) {
                let sumX = 0;
                let sumY = 0;
                for (const w of wps) {
                    sumX += w.x;
                    sumY += w.y;
                }
                result.set(id, {
                    x: sumX / wps.length,
                    y: sumY / wps.length,
                });
            }
        }
    }
    return result;
}

/**
 * Returns the id of a moddle reference, accepting either a resolved object
 * reference (`{$type, id, ...}`) or a raw string id — `bpmn-moddle` returns
 * different shapes depending on how the file was parsed.
 */
function refId(ref: unknown): string | undefined {
    if (typeof ref === "string") return ref;
    if (ref && typeof ref === "object" && "id" in ref) {
        const id = (ref as { id?: unknown }).id;
        if (typeof id === "string") return id;
    }
    return undefined;
}

function readArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}
