import { vi } from "vitest";

import type { EditorSessionContext } from "@miragon/bpmn-modeler-core";

export function createSessionContext(editorId: string) {
    const captured: { dispose?: () => void } = {};
    const context: EditorSessionContext = {
        editorId,
        isCurrent: () => true,
        isFocused: () => true,
        onFocusChange: vi.fn(),
        onDocumentChange: vi.fn(),
        onSettingChange: vi.fn(),
        onReseed: vi.fn(),
        onDispose: (callback) => void (captured.dispose = callback),
        addDisposable: vi.fn(),
    };
    return { context, captured };
}
