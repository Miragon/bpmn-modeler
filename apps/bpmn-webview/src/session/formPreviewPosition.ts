import type { FormPreviewAnchor } from "@miragon/bpmn-modeler";

export function positionFormPreview(
    { task, canvas, contextPad }: FormPreviewAnchor,
    desiredWidth: number,
    desiredHeight: number,
) {
    const edge = 8;
    const gap = 12;
    const left = canvas.x + edge;
    const top = canvas.y + edge;
    const right = canvas.x + canvas.width - edge;
    const bottom = canvas.y + canvas.height - edge;
    const width = Math.min(desiredWidth, Math.max(0, right - left));
    const height = Math.min(desiredHeight, Math.max(0, bottom - top));
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    const after =
        Math.max(task.x + task.width, contextPad ? contextPad.x + contextPad.width : 0) + gap;
    const before = Math.min(task.x, contextPad?.x ?? task.x) - gap - width;
    if (after + width <= right)
        return {
            left: clamp(after, left, right - width),
            top: clamp(task.y, top, bottom - height),
            width,
            maxHeight: height,
        };
    if (before >= left)
        return {
            left: clamp(before, left, right - width),
            top: clamp(task.y, top, bottom - height),
            width,
            maxHeight: height,
        };
    const below =
        Math.max(task.y + task.height, contextPad ? contextPad.y + contextPad.height : 0) + gap;
    const above = Math.min(task.y, contextPad?.y ?? task.y) - gap;
    const belowSpace = bottom - Math.max(top, below);
    const aboveSpace = Math.min(bottom, above) - top;
    if (Math.max(belowSpace, aboveSpace) < 80) return undefined;
    const maxHeight = Math.min(height, Math.max(belowSpace, aboveSpace));
    return {
        left: clamp(task.x, left, right - width),
        top: belowSpace >= aboveSpace ? Math.max(top, below) : Math.min(bottom, above) - maxHeight,
        width,
        maxHeight,
    };
}
