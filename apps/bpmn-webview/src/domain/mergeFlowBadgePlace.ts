export interface FlowWaypoint {
    readonly x: number;
    readonly y: number;
}

/** The radius of a flow's round check, centred on its place, in diagram units at zoom 1. */
export const FLOW_BADGE_RADIUS = 9;

/**
 * The shortest segment that holds a flow's check: half of it leaves the
 * check's radius and the arrowhead's length (11) between the check and
 * either end, in diagram units, at every zoom the check scales with.
 */
const SHORTEST_BADGE_SEGMENT = 48;

/**
 * Where a picked flow's check goes: the middle of its longest segment,
 * relative to the top left corner of its waypoints' box, where diagram-js
 * anchors a flow's overlay. `undefined` where no segment is long enough to
 * keep the check off the arrowhead and the shapes the flow joins.
 */
export function flowBadgePlace(
    waypoints: readonly FlowWaypoint[],
): { readonly left: number; readonly top: number } | undefined {
    let longest: { from: FlowWaypoint; to: FlowWaypoint; length: number } | undefined;
    for (let index = 1; index < waypoints.length; index += 1) {
        const from = waypoints[index - 1];
        const to = waypoints[index];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (longest === undefined || length > longest.length) longest = { from, to, length };
    }
    if (longest === undefined || longest.length < SHORTEST_BADGE_SEGMENT) return undefined;
    const boxLeft = Math.min(...waypoints.map(({ x }) => x));
    const boxTop = Math.min(...waypoints.map(({ y }) => y));
    return {
        left: (longest.from.x + longest.to.x) / 2 - boxLeft,
        top: (longest.from.y + longest.to.y) / 2 - boxTop,
    };
}
