import { ClipboardPort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { ClipboardReadResult } from "../../../protocol/domain/types";

/**
 * Routes {@link ClipboardPort} calls to the host's system clipboard so the
 * sandboxed-iframe mediator pattern works out-of-process: the webview can't
 * reach the clipboard, the core can't either (it's a subprocess), so the host
 * does the real read/write on their behalf.
 *
 * Read is a request — the core needs the value back to satisfy a paste — while
 * write is fire-and-forget, matching the notifier/status-bar split (a copy needs
 * no confirmation, and the mediator already swallows/logs failures).
 */
export class RpcClipboard implements ClipboardPort {
    constructor(private readonly rpc: Rpc) {}

    async readClipboard(): Promise<string> {
        const result = (await this.rpc.request(
            METHODS.clipboardRead,
            {},
        )) as ClipboardReadResult | null;
        return result?.text ?? "";
    }

    async writeClipboard(text: string): Promise<void> {
        this.rpc.notify(METHODS.clipboardWrite, { text });
    }
}
