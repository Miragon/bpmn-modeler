/**
 * Pure, DOM-free traversal resolution for keyboard flow navigation.
 *
 * All functions operate on structural `NavElement` types so unit tests can
 * pass plain object literals without pulling in the bpmn-js runtime.
 */

/**
 * Structural shape/connection type that both real bpmn-js elements and
 * test object literals satisfy.
 */
export interface NavElement {
    id: string;
    type: string;
    x: number;
    y: number;
    incoming: NavElement[];
    outgoing: NavElement[];
    source?: NavElement;
    target?: NavElement;
    labelTarget?: NavElement;
    host?: NavElement;
    parent?: NavElement;
    children?: NavElement[];
}

export type Direction = "forward" | "backward";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalize(el: NavElement): NavElement {
    if (el.type === "label" && el.labelTarget) return el.labelTarget;
    return el;
}

function isSequenceFlow(el: NavElement): boolean {
    return el.type === "bpmn:SequenceFlow";
}

function sequenceFlows(connections: NavElement[]): NavElement[] {
    return connections.filter(isSequenceFlow);
}

/** y-then-x comparator over element bounds. */
function byBounds(a: NavElement, b: NavElement): number {
    const dy = a.y - b.y;
    return dy !== 0 ? dy : a.x - b.x;
}

function sortByEndpoint(flows: NavElement[], endpoint: "source" | "target"): NavElement[] {
    return [...flows].sort((a, b) => byBounds(a[endpoint]!, b[endpoint]!));
}

function cycleInFan(
    flows: NavElement[],
    sortEndpoint: "source" | "target",
    current: NavElement,
    direction: Direction,
): NavElement {
    const sorted = sortByEndpoint(flows, sortEndpoint);
    const idx = sorted.findIndex((f) => f.id === current.id);
    const step = direction === "forward" ? 1 : -1;
    const next = (idx + step + sorted.length) % sorted.length;
    return sorted[next];
}

// ---------------------------------------------------------------------------
// Shape / flow step (Tab / Shift+Tab)
// ---------------------------------------------------------------------------

function stepFromShape(shape: NavElement, direction: Direction): NavElement | null {
    if (direction === "forward") {
        const out = sequenceFlows(shape.outgoing);
        if (out.length === 0) return null;
        if (out.length === 1) return out[0].target!;
        // Fan-out: select the first outgoing flow so the user can cycle/confirm.
        return sortByEndpoint(out, "target")[0];
    }

    const inc = sequenceFlows(shape.incoming);
    if (inc.length === 0) return shape.host ?? null;
    if (inc.length === 1) return inc[0].source!;
    return sortByEndpoint(inc, "source")[0];
}

function stepFromFlow(flow: NavElement, direction: Direction): NavElement | null {
    const srcOut = sequenceFlows(flow.source!.outgoing);
    const tgtIn = sequenceFlows(flow.target!.incoming);

    // Source fan takes priority (documented v1 limitation when both ends fan).
    if (srcOut.length > 1) {
        return cycleInFan(srcOut, "target", flow, direction);
    }
    if (tgtIn.length > 1) {
        return cycleInFan(tgtIn, "source", flow, direction);
    }

    // No fan — linear traversal.
    return direction === "forward" ? flow.target! : flow.source!;
}

// ---------------------------------------------------------------------------
// Collect flow nodes (handles collaborations with participants)
// ---------------------------------------------------------------------------

function gatherFlowNodes(children: NavElement[]): NavElement[] {
    const nodes: NavElement[] = [];
    for (const el of children) {
        if (el.type === "label" || el.source != null) continue;
        if (el.type === "bpmn:Participant" && el.children) {
            nodes.push(...gatherFlowNodes(el.children));
        } else {
            nodes.push(el);
        }
    }
    return nodes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the next element for Tab / Shift+Tab.
 *
 * Shapes with a single sequence-flow connection jump straight to the
 * opposite shape. Shapes at a fan-out/-in select the first flow so the
 * user can cycle through siblings. Flows in a fan cycle with wrap;
 * 1-to-1 flows step to their target/source directly.
 */
export function resolveStep(current: NavElement, direction: Direction): NavElement | null {
    const el = normalize(current);

    if (el.source != null && el.target != null) {
        return stepFromFlow(el, direction);
    }
    return stepFromShape(el, direction);
}

/**
 * Resolve the element for Enter / Shift+Enter on a sequence flow.
 *
 * Enter jumps to the flow's target, Shift+Enter to its source.
 * Returns `null` for non-sequence-flow elements so the caller can
 * decide not to consume the key.
 */
export function resolveFollow(current: NavElement, direction: Direction): NavElement | null {
    const el = normalize(current);
    if (el.type !== "bpmn:SequenceFlow" || !el.source || !el.target) return null;
    return direction === "forward" ? el.target : el.source;
}

/**
 * Resolve which element to select after a delete operation.
 *
 * Uses the first deleted element as the primary anchor: for shapes,
 * prefers the first surviving incoming source (y-then-x order), then
 * outgoing target, then boundary-event host. For connections, prefers
 * the surviving source, then target.
 */
export function resolveDeleteAnchor(deleted: NavElement[]): NavElement | null {
    if (deleted.length === 0) return null;

    const deletedIds = new Set(deleted.map((el) => el.id));
    const primary = normalize(deleted[0]);

    // Connection: prefer surviving source, then target.
    if (primary.source != null && primary.target != null) {
        if (!deletedIds.has(primary.source.id)) return primary.source;
        if (!deletedIds.has(primary.target.id)) return primary.target;
        return null;
    }

    // Shape: first surviving incoming source (y-then-x order).
    const inc = sortByEndpoint(sequenceFlows(primary.incoming), "source");
    for (const f of inc) {
        if (!deletedIds.has(f.source!.id)) return f.source!;
    }

    // Fallback: first surviving outgoing target.
    const out = sortByEndpoint(sequenceFlows(primary.outgoing), "target");
    for (const f of out) {
        if (!deletedIds.has(f.target!.id)) return f.target!;
    }

    // Boundary event: host.
    if (primary.host && !deletedIds.has(primary.host.id)) return primary.host;

    return null;
}

/**
 * Pick an entry point when no element is selected.
 *
 * Forward prefers start events (sorted y-then-x), then nodes with
 * zero sequence-incoming, then the top-left-most flow node.
 * Backward mirrors with end events / zero outgoing.
 */
export function resolveEntry(rootChildren: NavElement[], direction: Direction): NavElement | null {
    const nodes = gatherFlowNodes(rootChildren);
    if (nodes.length === 0) return null;

    if (direction === "forward") {
        const starts = nodes.filter((n) => n.type === "bpmn:StartEvent").sort(byBounds);
        if (starts.length > 0) return starts[0];

        const noIncoming = nodes
            .filter((n) => sequenceFlows(n.incoming).length === 0)
            .sort(byBounds);
        if (noIncoming.length > 0) return noIncoming[0];

        return [...nodes].sort(byBounds)[0];
    }

    const ends = nodes.filter((n) => n.type === "bpmn:EndEvent").sort(byBounds);
    if (ends.length > 0) return ends[0];

    const noOutgoing = nodes.filter((n) => sequenceFlows(n.outgoing).length === 0).sort(byBounds);
    if (noOutgoing.length > 0) return noOutgoing[0];

    return [...nodes].sort(byBounds)[0];
}
