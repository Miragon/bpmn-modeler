import { env } from "vscode";

import { ClipboardPort } from "@miragon/bpmn-modeler-core";

/**
 * Adapter around the VS Code clipboard API.
 *
 * Isolating clipboard access in its own adapter keeps the sandboxed-iframe
 * mediator pattern (host-side read/write on behalf of the webview) confined
 * to infrastructure and lets services depend only on what they actually use.
 */
export class VsCodeClipboard implements ClipboardPort {
    async readClipboard(): Promise<string> {
        return env.clipboard.readText();
    }

    async writeClipboard(text: string): Promise<void> {
        await env.clipboard.writeText(text);
    }
}
