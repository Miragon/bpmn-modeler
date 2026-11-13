import type { Webview } from "vscode";

import type { AddOnsPanel } from "@miragon/bpmn-modeler-core";
import { BrandModeQuery, type Command } from "@miragon/bpmn-modeler-shared";
import type { VsCodeBrandModeSignal } from "./VsCodeBrandModeSignal";

export type BrandModeSource = Pick<VsCodeBrandModeSignal, "current" | "onDidChange">;

/**
 * Hands an add-ons page's commands to its core panel and keeps the page in
 * the IDE's brand mode: the shell carries the mode of its first render, so a
 * theme change arrives by message, and again when the page asks for its
 * catalog, as one posted while it loaded may be lost. Returns what to dispose
 * with the page.
 */
export function connectAddOnsPage(
    webview: Webview,
    panel: AddOnsPanel,
    brandMode: BrandModeSource,
    onCommand: () => void,
): { dispose(): void } {
    const postBrandMode = (mode = brandMode.current()) =>
        void webview.postMessage(new BrandModeQuery(mode));
    webview.onDidReceiveMessage((message: Command) => {
        if (message.type === "GetAddOnCatalogCommand") postBrandMode();
        onCommand();
        return panel.handle(message);
    });
    return brandMode.onDidChange(postBrandMode);
}
