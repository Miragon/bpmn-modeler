import { Command, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

/**
 * Registers the webview's {@link ShowInfoCommand} on `router`, surfacing it as
 * a user-facing notification via the host's {@link NotifierPort}. Counterpart
 * to {@link registerWebviewLogHandlers}: log commands stay in the output
 * channel, this one reaches the user directly.
 */
export function registerWebviewNotificationHandlers(
    router: WebviewMessageRouter,
    notifier: NotifierPort,
): void {
    router.on("ShowInfoCommand", (message: Command) => {
        notifier.showInfo((message as ShowInfoCommand).message);
    });
}
