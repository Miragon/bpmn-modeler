import type { DiagramBounds } from "./layoutGeometry";

const CELL_SIZE = 200;

/**
 * A uniform grid over shapes' bounds, so a search near one spot reads only
 * the shapes whose cells it meets instead of every shape of a large diagram.
 */
export class ShapeGrid {
    private readonly cells = new Map<string, number[]>();

    constructor(bounds: readonly DiagramBounds[]) {
        bounds.forEach((box, index) => {
            for (const key of cellKeysOf(box)) {
                const cell = this.cells.get(key);
                if (cell === undefined) this.cells.set(key, [index]);
                else cell.push(index);
            }
        });
    }

    /** The indices of the bounds whose cells `box` meets, ascending: candidates, not hits. */
    indicesNear(box: DiagramBounds): number[] {
        const found = new Set<number>();
        for (const key of cellKeysOf(box)) {
            for (const index of this.cells.get(key) ?? []) found.add(index);
        }
        return [...found].sort((first, second) => first - second);
    }
}

function cellKeysOf(box: DiagramBounds): string[] {
    const keys: string[] = [];
    const [firstColumn, lastColumn] = [cellOf(box.x), cellOf(box.x + box.width)];
    const [firstRow, lastRow] = [cellOf(box.y), cellOf(box.y + box.height)];
    for (let column = firstColumn; column <= lastColumn; column++) {
        for (let row = firstRow; row <= lastRow; row++) keys.push(`${column} ${row}`);
    }
    return keys;
}

function cellOf(coordinate: number): number {
    return Math.floor(coordinate / CELL_SIZE);
}
