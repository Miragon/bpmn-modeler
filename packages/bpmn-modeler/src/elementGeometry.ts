export interface PositionedElement {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: ReadonlyArray<{ x: number; y: number }>;
}

/**
 * Geometric centre of a bpmn-js element, or `undefined` when it has neither
 * shape bounds nor waypoints. Connections carry only `waypoints`; without the
 * bbox-midpoint branch they would centre at (0, 0).
 */
export function centreOf(element: PositionedElement): { x: number; y: number } | undefined {
    if (typeof element.x === "number" && typeof element.y === "number") {
        return {
            x: element.x + (element.width ?? 0) / 2,
            y: element.y + (element.height ?? 0) / 2,
        };
    }
    const wps = element.waypoints;
    if (wps && wps.length > 0) {
        let minX = wps[0].x;
        let maxX = wps[0].x;
        let minY = wps[0].y;
        let maxY = wps[0].y;
        for (let i = 1; i < wps.length; i++) {
            const p = wps[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    return undefined;
}

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

/** A viewbox of `size` with `centre` in its middle. */
export function viewboxCentredOn(
    centre: { x: number; y: number },
    size: { width: number; height: number },
): DiagramBox {
    const { width, height } = size;
    return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}
