import {
    BpmnClipboardMediator,
    getClipboardHandler,
    getTextClipboardHandler,
    setClipboardHandler,
    setTextClipboardHandler,
} from "@miragon/bpmn-modeler-core";

import { RpcClipboard } from "../adapters";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The clipboard feature owns the {@link RpcClipboard} adapter and the
 * {@link BpmnClipboardMediator}, plus its four webview-message handlers.
 *
 * Webview messages: GetClipboardCommand, SetClipboardCommand,
 * GetTextClipboardCommand, SetTextClipboardCommand.
 */
export function register(deps: BridgeSharedDeps): void {
    // Real clipboard mediator (sandboxed-iframe pattern): the host reads/writes
    // the system clipboard on the webview's behalf over RPC.
    const clipboard = new RpcClipboard(deps.rpc);
    const clipboardMediator = new BpmnClipboardMediator(deps.store, clipboard, deps.notifier);

    deps.router
        .on("GetClipboardCommand", getClipboardHandler(clipboardMediator))
        .on("SetClipboardCommand", setClipboardHandler(clipboardMediator))
        .on("GetTextClipboardCommand", getTextClipboardHandler(clipboardMediator))
        .on("SetTextClipboardCommand", setTextClipboardHandler(clipboardMediator));
}
