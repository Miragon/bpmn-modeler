/**
 * Builds a navigation order for diff highlights based on BPMN sequence-flow
 * direction.
 *
 * The diff stepper used to walk ids in the order `bpmn-js-differ` happened to
 * report them — effectively undefined.  This module produces a deterministic
 * "Start Event → End Event" ordering by traversing the parsed `bpmn-moddle`
 * definitions:
 *
 *   1. Collect every FlowElementsContainer (Process, SubProcess) recursively
 *      and index its FlowElements by id.
 *   2. BFS from each StartEvent following outgoing SequenceFlows.  Sequence
 *      flows themselves get an index immediately after their source so they
 *      slot between the two shapes they connect.
 *   3. Use BPMNDI bounds (visual `y` then `x`) as the tiebreaker for parallel
 *      branches and as the key for orphan nodes that the BFS never reaches.
 *
 * Removed elements only exist on the *before* canvas, so the after-pane order
 * has no slot for them.  {@link buildRemovedAnchors} walks the before graph
 * for each removed id, picks a surviving neighbour (incoming source first,
 * outgoing target as fallback), and assigns the removed id a fractional index
 * adjacent to that anchor's position in the after order.  This places removed
 * nodes near where they used to live in the flow rather than at the end.
 *
 * The ordering is a heuristic — multi-pool collaborations, complex parallel
 * gateway fan-outs, and disconnected nodes all have known limitations
 * documented inline.  It will not always match a human's mental walk of every
 * diagram, but it is far more recognisable than the previous insertion-order
 * cycle.
 */

/**
 * Minimal subset of a parsed bpmn-moddle element used by this module.
 */
interface ModdleElement {
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
 */
export interface FlowPosition {
    flowIndex: number;
    y: number;
    x: number;
}

/**
 * Builds the `id → FlowPosition` map for one set of parsed definitions.
 *
 * The returned map covers every FlowElement reachable through `rootElements`
 * (including nested SubProcesses), plus orphan nodes appended at the end in
 * visual top-left → bottom-right order.
 */
export function buildFlowOrder(
    root: ModdleElement,
): Map<string, FlowPosition> {
    const containers = collectContainers(root);
    const bounds = collectBounds(root);

    const flowElementsById = new Map<string, ModdleElement>();
    const startEvents: ModdleElement[] = [];
    for (const container of containers) {
        const fes = readArray<ModdleElement>(container.flowElements);
        for (const fe of fes) {
            if (!fe.id) continue;
            flowElementsById.set(fe.id, fe);
            if (fe.$type === "bpmn:StartEvent") {
                startEvents.push(fe);
            }
        }
    }

    // `bpmn-moddle` does not auto-populate `incoming`/`outgoing` on FlowNodes
    // when references resolve via the `references` companion array — different
    // call paths return different shapes.  Build an outgoing index from
    // SequenceFlow.sourceRef/targetRef ourselves so the BFS works regardless.
    const outgoingBySource = new Map<string, ModdleElement[]>();
    for (const fe of flowElementsById.values()) {
        if (fe.$type !== "bpmn:SequenceFlow") continue;
        const sourceId = refId(fe.sourceRef);
        if (!sourceId) continue;
        const list = outgoingBySource.get(sourceId);
        if (list) {
            list.push(fe);
        } else {
            outgoingBySource.set(sourceId, [fe]);
        }
    }

    const order = new Map<string, FlowPosition>();
    let counter = 0;
    const visited = new Set<string>();
    const queue: ModdleElement[] = [];

    const enqueue = (node: ModdleElement | undefined): void => {
        if (!node?.id || visited.has(node.id)) return;
        visited.add(node.id);
        queue.push(node);
    };

    sortByPosition(startEvents, bounds);
    for (const se of startEvents) enqueue(se);

    while (queue.length > 0) {
        const node = queue.shift()!;
        const id = node.id!;
        const b = bounds.get(id) ?? { x: 0, y: 0 };
        order.set(id, { flowIndex: counter++, y: b.y, x: b.x });

        const outgoing = outgoingBySource.get(id) ?? [];
        // Visit parallel branches top-to-bottom, left-to-right.
        const sorted = [...outgoing].sort((a, b) => {
            const ta = refId(a.targetRef);
            const tb = refId(b.targetRef);
            const pa = (ta ? bounds.get(ta) : undefined) ?? { x: 0, y: 0 };
            const pb = (tb ? bounds.get(tb) : undefined) ?? { x: 0, y: 0 };
            return pa.y - pb.y || pa.x - pb.x;
        });

        for (const flow of sorted) {
            if (flow.id && !order.has(flow.id)) {
                const fb = bounds.get(flow.id) ?? { x: b.x, y: b.y };
                order.set(flow.id, {
                    flowIndex: counter++,
                    y: fb.y,
                    x: fb.x,
                });
            }
            const targetId = refId(flow.targetRef);
            if (targetId) enqueue(flowElementsById.get(targetId));
        }
    }

    // Orphans: sub-graphs without a reachable start event (e.g. event
    // sub-processes triggered by error/escalation, or genuinely disconnected
    // nodes).  Append in visual reading order so they at least step
    // predictably even though the flow position is unknown.
    const orphans: ModdleElement[] = [];
    for (const [id, fe] of flowElementsById) {
        if (!order.has(id)) orphans.push(fe);
    }
    sortByPosition(orphans, bounds);
    for (const fe of orphans) {
        const b = bounds.get(fe.id!) ?? { x: 0, y: 0 };
        order.set(fe.id!, { flowIndex: counter++, y: b.y, x: b.x });
    }

    return order;
}

/**
 * For each removed id, returns the position it should occupy in the *after*
 * order.  The anchor is found by walking the before graph for a neighbour
 * that survived the diff:
 *
 *   - incoming source → place removed just after that node (`+0.5`)
 *   - outgoing target → place removed just before that node (`-0.5`)
 *   - flow's own source/target if the removed element is itself a sequence flow
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

    const containers = collectContainers(beforeRoot);
    const flowElementsById = new Map<string, ModdleElement>();
    for (const c of containers) {
        for (const fe of readArray<ModdleElement>(c.flowElements)) {
            if (fe.id) flowElementsById.set(fe.id, fe);
        }
    }

    const incomingByTarget = new Map<string, ModdleElement[]>();
    const outgoingBySource = new Map<string, ModdleElement[]>();
    for (const fe of flowElementsById.values()) {
        if (fe.$type !== "bpmn:SequenceFlow") continue;
        const sourceId = refId(fe.sourceRef);
        const targetId = refId(fe.targetRef);
        if (sourceId) {
            const list = outgoingBySource.get(sourceId);
            if (list) list.push(fe);
            else outgoingBySource.set(sourceId, [fe]);
        }
        if (targetId) {
            const list = incomingByTarget.get(targetId);
            if (list) list.push(fe);
            else incomingByTarget.set(targetId, [fe]);
        }
    }

    const anchorAfter = (
        baseId: string,
        offset: number,
    ): FlowPosition | undefined => {
        const p = afterOrder.get(baseId);
        return p && { flowIndex: p.flowIndex + offset, y: p.y, x: p.x };
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
         * 2. Otherwise the surviving successor.
         */
        if (!anchor) {
            for (const flow of outgoingBySource.get(removedId) ?? []) {
                const targetId = refId(flow.targetRef);
                if (targetId && afterOrder.has(targetId)) {
                    anchor = anchorAfter(targetId, -0.5);
                    break;
                }
                if (flow.id && afterOrder.has(flow.id)) {
                    anchor = anchorAfter(flow.id, -0.25);
                    break;
                }
            }
        }
        /**
         * 3. Removed sequence flow: anchor on its own endpoints.
         */
        if (!anchor && node.$type === "bpmn:SequenceFlow") {
            const sourceId = refId(node.sourceRef);
            const targetId = refId(node.targetRef);
            if (sourceId && afterOrder.has(sourceId)) {
                anchor = anchorAfter(sourceId, 0.5);
            } else if (targetId && afterOrder.has(targetId)) {
                anchor = anchorAfter(targetId, -0.5);
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
            return (
                pa.flowIndex - pb.flowIndex ||
                pa.y - pb.y ||
                pa.x - pb.x
            );
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

function isContainer(el: ModdleElement): boolean {
    return (
        el.$type === "bpmn:Process" ||
        el.$type === "bpmn:SubProcess" ||
        el.$type === "bpmn:AdHocSubProcess" ||
        el.$type === "bpmn:Transaction"
    );
}

/**
 * Reads BPMNDI bounds keyed by `bpmnElement.id`, using waypoint midpoints as
 * a fallback for edges (which carry `waypoint` instead of `bounds`).
 */
function collectBounds(
    root: ModdleElement,
): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    for (const diagram of readArray<ModdleElement>(root.diagrams)) {
        const plane = diagram.plane as ModdleElement | undefined;
        if (!plane) continue;
        for (const pe of readArray<ModdleElement>(plane.planeElement)) {
            const target = pe.bpmnElement as ModdleElement | undefined;
            const id = target?.id;
            if (!id) continue;

            const b = pe.bounds as
                | { x?: number; y?: number }
                | undefined;
            if (
                b &&
                typeof b.x === "number" &&
                typeof b.y === "number"
            ) {
                result.set(id, { x: b.x, y: b.y });
                continue;
            }

            const wps = readArray<{ x: number; y: number }>(pe.waypoint);
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

function sortByPosition(
    nodes: ModdleElement[],
    bounds: ReadonlyMap<string, { x: number; y: number }>,
): void {
    nodes.sort((a, b) => {
        const ba = (a.id ? bounds.get(a.id) : undefined) ?? { x: 0, y: 0 };
        const bb = (b.id ? bounds.get(b.id) : undefined) ?? { x: 0, y: 0 };
        return ba.y - bb.y || ba.x - bb.x;
    });
}
