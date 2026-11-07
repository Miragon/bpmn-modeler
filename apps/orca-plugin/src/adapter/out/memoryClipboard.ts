import type { ClipboardBridge } from "@miragon/bpmn-modeler";

/**
 * Orca's editor frame denies the clipboard permission, so the package's native
 * clipboard would swallow every paste; copied elements stay within the frame.
 */
export function memoryClipboard(): ClipboardBridge {
    let copied = "";
    return {
        requestClipboard: () => Promise.resolve(copied),
        writeClipboard: (text) => {
            copied = text;
        },
    };
}
