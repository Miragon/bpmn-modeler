/** Below this the builder needs the room, e.g. beside the JSON editor. */
const NARROW_EDITOR_WIDTH = 640;

export interface PreviewFit {
    readonly narrow: boolean;
    /** The preview is closed because the editor is narrow, not because the user closed it. */
    readonly closedForRoom: boolean;
}

export const INITIAL_PREVIEW_FIT: PreviewFit = { narrow: false, closedForRoom: false };

/**
 * What a change of the editor's width does to the preview: it closes when the
 * editor turns narrow and comes back when it widens again. Staying narrow or wide
 * changes nothing, so the toggle's choice holds until the next crossing.
 */
export function fitPreview(
    fit: PreviewFit,
    width: number,
    previewVisible: boolean,
): { fit: PreviewFit; show?: boolean } {
    const narrow = width < NARROW_EDITOR_WIDTH;
    if (narrow === fit.narrow) {
        return { fit: { narrow, closedForRoom: fit.closedForRoom && !previewVisible } };
    }
    if (narrow && previewVisible) {
        return { fit: { narrow, closedForRoom: true }, show: false };
    }
    return {
        fit: { narrow, closedForRoom: false },
        ...(!narrow && fit.closedForRoom ? { show: true } : {}),
    };
}
