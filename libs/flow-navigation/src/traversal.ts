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
    /** Inverse of `host` — diagram-js maintains it on every shape. */
    attachers?: NavElement[];
}

export type Direction = "forward" | "backward";

/**
 * Result of a step/follow resolution.
 *
 * `boundaryCandidate` distinguishes a boundary event being previewed
 * in a mixed fan (true) from one the user has committed to (false).
 * The caller holds this flag as state so the next keypress knows
 * whether to cycle within the host fan or step from the boundary.
 */
export interface StepResult {
    element: NavElement;
    boundaryCandidate: boolean;
}

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

/** Flows sort by their target shape; boundary events represent themselves. */
function representative(candidate: NavElement): NavElement {
    return candidate.target ?? candidate;
}

/**
 * Outgoing sequence flows ∪ attached boundary events, sorted y-then-x
 * by representative shape — the mixed fan a user cycles through.
 */
function fanOutCandidates(shape: NavElement): NavElement[] {
    const flows = sequenceFlows(shape.outgoing);
    const boundaries = shape.attachers ?? [];
    return [...flows, ...boundaries].sort((a, b) => byBounds(representative(a), representative(b)));
}

/** Boundary events produce candidate results; flows do not. */
function toStepResult(candidate: NavElement): StepResult {
    return {
        element: candidate,
        boundaryCandidate: candidate.source == null && candidate.host != null,
    };
}

function sortByEndpoint(flows: NavElement[], endpoint: "source" | "target"): NavElement[] {
    return [...flows].sort((a, b) => byBounds(a[endpoint]!, b[endpoint]!));
}

function cycleBy(
    items: NavElement[],
    keyOf: (item: NavElement) => NavElement,
    current: NavElement,
    direction: Direction,
): NavElement {
    const sorted = [...items].sort((a, b) => byBounds(keyOf(a), keyOf(b)));
    const idx = sorted.findIndex((item) => item.id === current.id);
    const step = direction === "forward" ? 1 : -1;
    const next = (idx + step + sorted.length) % sorted.length;
    return sorted[next];
}

// ---------------------------------------------------------------------------
// Shape / flow step (Tab / Shift+Tab)
// ---------------------------------------------------------------------------

function stepFromShape(shape: NavElement, direction: Direction): StepResult | null {
    if (direction === "forward") {
        const candidates = fanOutCandidates(shape);
        if (candidates.length === 0) return null;
        if (candidates.length === 1) {
            const only = candidates[0];
            // Single flow, no boundaries: jump straight to target (unchanged shortcut).
            if (only.target) return { element: only.target, boundaryCandidate: false };
            // Single boundary, no flows: committed jump (single-path semantics).
            return { element: only, boundaryCandidate: false };
        }
        return toStepResult(candidates[0]);
    }

    const inc = sequenceFlows(shape.incoming);
    if (inc.length === 0)
        return shape.host ? { element: shape.host, boundaryCandidate: false } : null;
    return { element: sortByEndpoint(inc, "source")[0].source!, boundaryCandidate: false };
}

function stepFromFlow(flow: NavElement, direction: Direction): StepResult | null {
    const srcCandidates = fanOutCandidates(flow.source!);

    // Source fan (including boundary events) takes priority.
    if (srcCandidates.length > 1) {
        const next = cycleBy(srcCandidates, representative, flow, direction);
        return toStepResult(next);
    }

    // No fan — linear traversal.
    return direction === "forward"
        ? { element: flow.target!, boundaryCandidate: false }
        : { element: flow.source!, boundaryCandidate: false };
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
 * When `currentIsBoundaryCandidate` is true the current element is a
 * boundary event being previewed in its host's mixed fan — Tab cycles
 * within the fan instead of stepping along the boundary's own flows.
 * A stale flag (host fan collapsed to ≤ 1) falls through to normal
 * shape step as self-healing.
 */
export function resolveStep(
    current: NavElement,
    direction: Direction,
    currentIsBoundaryCandidate = false,
): StepResult | null {
    const el = normalize(current);

    if (currentIsBoundaryCandidate && el.host) {
        const hostCandidates = fanOutCandidates(el.host);
        if (hostCandidates.length > 1) {
            const next = cycleBy(hostCandidates, representative, el, direction);
            return toStepResult(next);
        }
    }

    if (el.source != null && el.target != null) {
        return stepFromFlow(el, direction);
    }
    return stepFromShape(el, direction);
}

/**
 * Resolve the element for Enter / Shift+Enter.
 *
 * On a sequence flow Enter jumps to the target, Shift+Enter to the
 * source. On a boundary candidate Enter commits it (element stays
 * selected, candidate state cleared). Returns `null` for non-flow
 * non-candidate elements so the key bubbles to direct editing.
 */
export function resolveFollow(
    current: NavElement,
    direction: Direction,
    currentIsBoundaryCandidate = false,
): StepResult | null {
    const el = normalize(current);

    if (el.type === "bpmn:SequenceFlow" && el.source && el.target) {
        return {
            element: direction === "forward" ? el.target : el.source,
            boundaryCandidate: false,
        };
    }

    if (currentIsBoundaryCandidate) {
        return { element: el, boundaryCandidate: false };
    }

    return null;
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
