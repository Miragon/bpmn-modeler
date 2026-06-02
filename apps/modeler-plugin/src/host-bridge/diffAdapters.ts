/**
 * RPC-backed diff-pane adapter — the diff twin of {@link RpcEditorHandle}.
 *
 * Diff has a fundamentally different shape from the editor proof: it is
 * *host-originated* (the user clicks "Show Diff" in IntelliJ) and coordinates
 * **two** panes as one logical unit. Yet the entire diff brain
 * ({@link BpmnDiffService} + `bpmn-js-differ`) is `vscode`-free and runs here
 * unchanged. The only new code is this thin per-pane handle plus the per-pane
 * message dispatch — the IntelliJ analogue of `BpmnDiffController.onMessage`.
 *
 * Unlike VS Code, where the two custom-editor panes resolve independently and
 * out of order (hence the controller's pane-pairing dance), IntelliJ opens the
 * diff with **both sides known up front**. So there is no pairing logic here:
 * `server.ts` builds the {@link DiffSession} with both URIs and attaches both
 * panes in one shot.
 */

import {
    Command,
    CursorChangedCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { DiffPaneHandle } from "../diff/domain/DiffSession";
import { BpmnDiffService } from "../diff/service/BpmnDiffService";
import { Rpc } from "./rpc";

/**
 * One diff pane as the core sees it. `getText()` reads a content cache seeded by
 * the host at `diff/open` (the diff twin of {@link DocumentMirror}) because
 * {@link BpmnDiffService} reads pane XML **synchronously** — impossible over
 * async RPC. `postMessage` emits a `diff/postMessage` notification the host
 * routes to the matching JCEF browser by `paneUri`.
 *
 * `uri` is both the pane's canonical identity (for {@link DiffSession} lookups)
 * and the routing key the host uses to pick the right browser.
 */
export class RpcDiffPaneHandle implements DiffPaneHandle {
    private ready = false;

    constructor(
        readonly uri: string,
        private content: string,
        private readonly rpc: Rpc,
    ) {}

    isReady(): boolean {
        return this.ready;
    }

    setReady(): void {
        this.ready = true;
    }

    getText(): string {
        return this.content;
    }

    async postMessage(message: unknown): Promise<boolean> {
        this.rpc.notify("diff/postMessage", { paneUri: this.uri, message });
        return true;
    }

    dispose(): void {
        // Content is the only retained resource; drop it so a stray late post
        // can't resurrect a disposed pane's XML.
        this.content = "";
        this.ready = false;
    }
}

/**
 * Per-pane webview-message dispatch — the `onMessage` switch lifted out of
 * `BpmnDiffController`, minus the VS Code-only `SwapCompareSidesCommand` (the
 * swap recreates the diff tab via `vscode.diff`, which has no spike analogue;
 * compare-files chrome only, descoped).
 */
export async function dispatchDiffMessage(
    service: BpmnDiffService,
    handle: DiffPaneHandle,
    message: Command,
): Promise<void> {
    switch (message.type) {
        case "GetBpmnFileCommand":
            await service.sendViewerFile(handle);
            break;
        case "DiffReadyCommand":
            await service.markReady(handle);
            break;
        case "ViewportChangedCommand":
            await service.forwardViewport(handle, (message as ViewportChangedCommand).viewport);
            break;
        case "CursorChangedCommand":
            await service.forwardCursor(handle, (message as CursorChangedCommand).index);
            break;
    }
}
