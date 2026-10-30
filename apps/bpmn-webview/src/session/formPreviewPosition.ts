import type { FormPreviewAnchor } from "@miragon/bpmn-modeler";

export function positionFormPreview(
    { task, canvas, contextPad, obstacles = [] }: FormPreviewAnchor,
    desiredWidth: number,
    desiredHeight: number,
    minimumHeight = Math.min(80, desiredHeight),
) {
    const edge = 8;
    const gap = 12;
    const left = canvas.x + edge;
    const top = canvas.y + edge;
    const right = canvas.x + canvas.width - edge;
    const bottom = canvas.y + canvas.height - edge;
    const width = Math.min(desiredWidth, Math.max(0, right - left));
    const height = Math.min(desiredHeight, Math.max(0, bottom - top));
    if (height < minimumHeight) return undefined;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    const after =
        Math.max(task.x + task.width, contextPad ? contextPad.x + contextPad.width : 0) + gap;
    const before = Math.min(task.x, contextPad?.x ?? task.x) - gap - width;
    const below =
        Math.max(task.y + task.height, contextPad ? contextPad.y + contextPad.height : 0) + gap;
    const above = Math.min(task.y, contextPad?.y ?? task.y) - gap;
    const belowSpace = bottom - Math.max(top, below);
    const aboveSpace = Math.min(bottom, above) - top;
    const blockers = [task, ...(contextPad ? [contextPad] : []), ...obstacles];
    const candidates = [
        { x: after, y: task.y },
        { x: before, y: task.y },
        ...(belowSpace >= aboveSpace
            ? [
                  { x: task.x, y: below },
                  { x: task.x, y: above - height },
              ]
            : [
                  { x: task.x, y: above - height },
                  { x: task.x, y: below },
              ]),
        ...obstacles.flatMap((box) => [
            { x: after, y: box.y + box.height + gap },
            { x: after, y: box.y - height - gap },
            { x: box.x + box.width + gap, y: task.y },
            { x: box.x - width - gap, y: task.y },
        ]),
    ];
    const place = (x: number, y: number, maxHeight: number) => {
        const position = {
            left: clamp(x, left, right - width),
            top: clamp(y, top, bottom - maxHeight),
            width,
            maxHeight,
        };
        return blockers.some(
            (box) =>
                position.left < box.x + box.width &&
                position.left + width > box.x &&
                position.top < box.y + box.height &&
                position.top + maxHeight > box.y,
        )
            ? undefined
            : position;
    };
    for (const candidate of candidates) {
        const position = place(candidate.x, candidate.y, height);
        if (position) return position;
    }
    // Keep the preview usable in dense layouts; content scrolls within the remaining space.
    for (const candidate of candidates) {
        const x = clamp(candidate.x, left, right - width);
        const y = clamp(candidate.y, top, bottom);
        const end = Math.min(
            bottom,
            ...blockers
                .filter((box) => x < box.x + box.width && x + width > box.x && box.y >= y)
                .map((box) => box.y - gap),
        );
        const available = Math.min(height, end - y);
        if (available < minimumHeight) continue;
        const position = place(x, y, available);
        if (position) return position;
    }
    return undefined;
}
