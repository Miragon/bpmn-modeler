import { describe, expect, it, vi } from "vitest";

import { RequestFocusCommand, TakeFocusQuery } from "@miragon/bpmn-modeler-shared";

import type { EditorHandle } from "../service/EditorHandle";
import { EditorSessionStore } from "../service/EditorSessionStore";
import { WebviewMessageRouter } from "../service/WebviewMessageRouter";
import { registerWebviewFocusHandlers } from "./webviewFocusMessageHandlers";

const EDITOR = "file:///w/a.bpmn";

function setup(isActive: boolean) {
    const handle = {
        id: EDITOR,
        isActive: () => isActive,
        postMessage: vi.fn(async () => true),
    };
    const editorStore = new EditorSessionStore(() => {});
    editorStore.register(handle as unknown as EditorHandle);
    const router = new WebviewMessageRouter();
    registerWebviewFocusHandlers(router, editorStore);
    return { handle, router };
}

describe("registerWebviewFocusHandlers", () => {
    it("tells the active editor's webview to take focus", async () => {
        const { handle, router } = setup(true);

        await router.dispatch(new RequestFocusCommand(), EDITOR);

        expect(handle.postMessage).toHaveBeenCalledExactlyOnceWith(new TakeFocusQuery());
    });

    it("leaves focus alone for an editor that is not active", async () => {
        const { handle, router } = setup(false);

        await router.dispatch(new RequestFocusCommand(), EDITOR);

        expect(handle.postMessage).not.toHaveBeenCalled();
    });
});
