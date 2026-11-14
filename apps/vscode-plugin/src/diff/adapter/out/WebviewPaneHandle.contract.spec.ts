import { describe, expect, it, vi } from "vitest";
import type { TextDocument, WebviewPanel } from "vscode";

import { describeDiffPaneContract } from "@miragon/bpmn-modeler-core/testing";

import { bootstrapWebview } from "../../../shared/adapter/out/bootstrapWebview";
import { WebviewPaneHandle } from "./WebviewPaneHandle";

// bootstrapWebview imports `vscode`, which Vitest cannot resolve; the contract never calls bootstrap().
vi.mock("../../../shared/adapter/out/bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(),
}));

/** VS Code's `Uri` as a diff pane's document carries it: only `toString()` spells the whole URI. */
function documentUri(uri: string) {
    const { protocol, pathname, search } = new URL(uri);
    return {
        scheme: protocol.slice(0, -1),
        path: pathname,
        fsPath: pathname,
        query: decodeURIComponent(search.slice(1)),
        toString: () => uri,
    };
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
            "bpmnDiffPane",
        );
    return {
        before: paneFor("before"),
        after: paneFor("after"),
        receivedBy: (side) => panels[side].posted,
    };
});

describe("WebviewPaneHandle.bootstrap", () => {
    it.each(["bpmnDiffPane", "dmnDiffPane"] as const)(
        "loads the page of the %s it was made for",
        (surface) => {
            const panel = new FakeWebviewPanel() as unknown as WebviewPanel;

            new WebviewPaneHandle(panel, {} as TextDocument, surface).bootstrap();

            expect(bootstrapWebview).toHaveBeenLastCalledWith(panel, { diffPane: surface });
        },
    );
});
