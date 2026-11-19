import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

/** No host clipboard behind the preview: both read empty. */
export function emptyClipboard(): ClipboardQuery {
    return new ClipboardQuery("");
}

export function emptyTextClipboard(): TextClipboardQuery {
    return new TextClipboardQuery("");
}
