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

const GIT_CANNOT_TELL = () => undefined;

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
            GIT_CANNOT_TELL,
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

            new WebviewPaneHandle(panel, {} as TextDocument, surface, GIT_CANNOT_TELL).bootstrap();

            expect(bootstrapWebview).toHaveBeenLastCalledWith(panel, { diffPane: surface });
        },
    );
});

describe("WebviewPaneHandle.revision", () => {
    it("reads a working tree change's base by what Git has staged, each time it is asked", () => {
        const stagedFiles = new Set<string>();
        const asked: string[] = [];
        const base = new WebviewPaneHandle(
            new FakeWebviewPanel() as unknown as WebviewPanel,
            {
                uri: {
                    scheme: "git",
                    query: JSON.stringify({ path: "/repo/order.bpmn", ref: "~" }),
                },
            } as unknown as TextDocument,
            "bpmnDiffPane",
            (filePath) => {
                asked.push(filePath);
                return stagedFiles.has(filePath);
            },
        );

        const unstaged = base.revision;
        stagedFiles.add("/repo/order.bpmn");

        expect(unstaged).toStrictEqual({ kind: "index-or-head", staged: false });
        expect(base.revision).toStrictEqual({ kind: "index-or-head", staged: true });
        expect(asked).toStrictEqual(["/repo/order.bpmn", "/repo/order.bpmn"]);
    });
});
