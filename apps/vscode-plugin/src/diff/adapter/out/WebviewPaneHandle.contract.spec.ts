import { vi } from "vitest";
import type { TextDocument, WebviewPanel } from "vscode";

import { describeDiffPaneContract } from "@miragon/bpmn-modeler-core/testing";

import { WebviewPaneHandle } from "./WebviewPaneHandle";

// bootstrapWebview imports `vscode`, which Vitest cannot resolve; the suite never calls bootstrap().
vi.mock("../../../shared/adapter/out/bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(),
}));

/** VS Code's `Uri` as a diff pane's document carries it: only `toString()` spells the whole URI. */
function documentUri(uri: string) {
    const { protocol, pathname } = new URL(uri);
    return { scheme: protocol.slice(0, -1), path: pathname, fsPath: pathname, toString: () => uri };
}

/**
 * The panel VS Code hands a custom editor. Once disposed, reading its webview
 * throws, as VS Code's panel does.
 */
class FakeWebviewPanel {
    readonly posted: unknown[] = [];
    private disposed = false;
    private readonly liveWebview = {
        postMessage: async (message: unknown) => {
            this.posted.push(message);
            return true;
        },
    };

    get webview() {
        if (this.disposed) throw new Error("Webview is disposed");
        return this.liveWebview;
    }

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
