import type { DiagramBounds } from "./layoutGeometry";
import { ShapeGrid } from "./layoutGrid";
import type { NodeShape } from "./layoutModel";

/** What one plane draws, in document order, with a grid over the drawings' bounds. */
export interface PlaneIndex<Item> {
    readonly items: readonly Item[];
    readonly grid: ShapeGrid;
}

export type PlaneNodes = PlaneIndex<NodeShape>;

export function byPlaneWithGrid<Item extends { readonly plane: string }>(
    items: readonly Item[],
    boundsOf: (item: Item) => DiagramBounds,
): Map<string, PlaneIndex<Item>> {
    const byPlane = new Map<string, Item[]>();
    for (const item of items) {
        const onPlane = byPlane.get(item.plane);
        if (onPlane === undefined) byPlane.set(item.plane, [item]);
        else onPlane.push(item);
    }
    return new Map(
        [...byPlane].map(([plane, onPlane]) => [
            plane,
            { items: onPlane, grid: new ShapeGrid(onPlane.map(boundsOf)) },
        ]),
    );
}

export function planeNodesOf(nodes: readonly NodeShape[]): Map<string, PlaneNodes> {
    return byPlaneWithGrid(nodes, ({ bounds }) => bounds);
}
