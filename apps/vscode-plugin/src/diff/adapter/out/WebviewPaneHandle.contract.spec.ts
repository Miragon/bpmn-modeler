import { vi } from "vitest";
import type { TextDocument, WebviewPanel } from "vscode";

import { describeDiffPaneContract } from "@miragon/bpmn-modeler-core/testing";

import { WebviewPaneHandle } from "./WebviewPaneHandle";

// The suite never loads a page; the bootstrap reads the extension context.
vi.mock("../../../shared/adapter/out/bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(),
}));

/** VS Code's `Uri` as a diff pane's document carries it: only `toString()` spells the whole URI. */
function documentUri(uri: string) {
    const { protocol, pathname } = new URL(uri);
    return { scheme: protocol.slice(0, -1), path: pathname, fsPath: pathname, toString: () => uri };
}

/** The panel VS Code hands a custom editor; its webview takes every post while the panel is open. */
class FakeWebviewPanel {
    readonly posted: unknown[] = [];
    disposed = false;
    readonly webview = {
        postMessage: async (message: unknown) => {
            this.posted.push(message);
            return true;
        },
    };

    dispose(): void {
        this.disposed = true;
    }
}

describeDiffPaneContract("WebviewPaneHandle", (sides) => {
    const panels = { before: new FakeWebviewPanel(), after: new FakeWebviewPanel() };
    const paneFor = (side: "before" | "after") =>
        new WebviewPaneHandle(
            panels[side] as unknown as WebviewPanel,
            {
                uri: documentUri(sides[side].uri),
                getText: () => sides[side].text,
            } as unknown as TextDocument,
        );
    return {
        before: paneFor("before"),
        after: paneFor("after"),
        receivedBy: (side) => panels[side].posted,
    };
});
