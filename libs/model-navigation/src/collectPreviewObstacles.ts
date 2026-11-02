import type { PreviewRect } from "./ModelNavigationPort";
import type { BusinessObjectLike } from "./extractReference";
import { is } from "bpmn-js/lib/util/ModelUtil";

export interface PreviewElement {
    businessObject?: BusinessObjectLike;
    parent?: PreviewElement;
    hidden?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: Array<{ x: number; y: number }>;
}

export function collectPreviewObstacles(
    elements: PreviewElement[],
    target: PreviewElement,
    toViewport: (rect: PreviewRect) => PreviewRect,
    bounds: PreviewRect,
): PreviewRect[] {
    const ancestors = new Set<PreviewElement>();
    let root = target;
    while (root.parent) {
        ancestors.add(root.parent);
        root = root.parent;
    }
    const visibility = new Map<PreviewElement, boolean>();
    const visible = (element: PreviewElement): boolean => {
        const known = visibility.get(element);
        if (known !== undefined) return known;
        const result =
            !element.hidden && (element.parent ? visible(element.parent) : element === root);
        visibility.set(element, result);
        return result;
    };
    const intersects = (rect: PreviewRect) =>
        rect.x < bounds.x + bounds.width &&
        rect.x + rect.width > bounds.x &&
        rect.y < bounds.y + bounds.height &&
        rect.y + rect.height > bounds.y;
    const task = toViewport(target as PreviewRect);
    const obstacles: PreviewRect[] = [];
    for (const element of elements) {
        if (element === target || ancestors.has(element)) continue;
        const boxes = element.waypoints
            ? element.waypoints.slice(1).map((point, index) => {
                  const previous = element.waypoints![index];
                  return {
                      x: Math.min(point.x, previous.x) - 2,
                      y: Math.min(point.y, previous.y) - 2,
                      width: Math.abs(point.x - previous.x) + 4,
                      height: Math.abs(point.y - previous.y) + 4,
                  };
              })
            : [element as PreviewRect];
        for (const box of boxes) {
            // Data-space shapes and segment rectangles need no SVG getBBox/layout read.
            const rect = toViewport(box);
            if (!intersects(rect) || !visible(element)) continue;
            if (
                is(element, "bpmn:Lane") &&
                rect.x <= task.x &&
                rect.y <= task.y &&
                rect.x + rect.width >= task.x + task.width &&
                rect.y + rect.height >= task.y + task.height
            )
                continue;
            obstacles.push(rect);
        }
    }
    return obstacles;
}

export function previewNeighborhood(canvas: PreviewRect, task: PreviewRect): PreviewRect {
    const x = Math.max(canvas.x, Math.min(task.x, canvas.x + canvas.width));
    const y = Math.max(canvas.y, Math.min(task.y, canvas.y + canvas.height));
    const left = Math.max(canvas.x, x - 700);
    const top = Math.max(canvas.y, y - 700);
    return {
        x: left,
        y: top,
        width: Math.min(canvas.x + canvas.width, x + task.width + 700) - left,
        height: Math.min(canvas.y + canvas.height, y + task.height + 700) - top,
    };
}
