import type { FormPreviewAnchor } from "@miragon/bpmn-modeler";

export function positionFormPreview(
    { task, canvas, contextPad }: FormPreviewAnchor,
    desiredWidth: number,
    desiredHeight: number,
) {
    const edge = Math.min(8, canvas.width / 4, canvas.height / 4);
    const left = canvas.x + edge;
    const top = canvas.y + edge;
    const width = Math.min(desiredWidth, Math.max(0, canvas.width - 2 * edge));
    const maxHeight = Math.min(desiredHeight, Math.max(0, canvas.height - 2 * edge));
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
    return {
        left: clamp(
            Math.max(
                task.x + task.width,
                contextPad ? contextPad.x + contextPad.width : -Infinity,
            ) + 12,
            left,
            canvas.x + canvas.width - edge - width,
        ),
        top: clamp(task.y, top, canvas.y + canvas.height - edge - maxHeight),
        width,
        maxHeight,
    };
}
