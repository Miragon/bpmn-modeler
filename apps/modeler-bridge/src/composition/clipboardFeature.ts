import {
    Command,
    SetClipboardCommand,
    SetTextClipboardCommand,
} from "@miragon/bpmn-modeler-shared";
import { BpmnClipboardMediator } from "@miragon/bpmn-modeler-core";

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
        .on("GetClipboardCommand", (_m: Command, editorId: string) => {
            void clipboardMediator.readClipboard(editorId);
        })
        .on("SetClipboardCommand", (message: Command) => {
            void clipboardMediator.writeClipboard((message as SetClipboardCommand).text);
        })
        .on("GetTextClipboardCommand", (_m: Command, editorId: string) => {
            void clipboardMediator.readTextClipboard(editorId);
        })
        .on("SetTextClipboardCommand", (message: Command) => {
            void clipboardMediator.writeClipboard((message as SetTextClipboardCommand).text);
        });
}
