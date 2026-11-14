/** A box in diagram coordinates, as diagram-js measures elements and the viewbox. */
export interface DiagramBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Whether `box` lies fully inside `viewbox`; touching an edge still counts. */
export function liesWithin(box: DiagramBox, viewbox: DiagramBox): boolean {
    return (
        box.x >= viewbox.x &&
        box.y >= viewbox.y &&
        box.x + box.width <= viewbox.x + viewbox.width &&
        box.y + box.height <= viewbox.y + viewbox.height
    );
}
