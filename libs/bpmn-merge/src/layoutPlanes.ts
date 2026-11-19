import { ShapeGrid } from "./layoutGrid";
import type { NodeShape } from "./layoutModel";

/** The nodes drawn on one plane, in document order, with a grid over their bounds. */
export interface PlaneNodes {
    readonly nodes: readonly NodeShape[];
    readonly grid: ShapeGrid;
}

export function planeNodesOf(nodes: readonly NodeShape[]): Map<string, PlaneNodes> {
    const byPlane = new Map<string, NodeShape[]>();
    for (const node of nodes) {
        const onPlane = byPlane.get(node.plane);
        if (onPlane === undefined) byPlane.set(node.plane, [node]);
        else onPlane.push(node);
    }
    return new Map(
        [...byPlane].map(([plane, onPlane]) => [
            plane,
            { nodes: onPlane, grid: new ShapeGrid(onPlane.map(({ bounds }) => bounds)) },
        ]),
    );
}
