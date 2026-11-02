import { ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../kernel/domain/hostPorts";
import { MessageHandler, WebviewMessageRouter } from "../service/WebviewMessageRouter";

/**
 * Handles the webview's {@link ShowInfoCommand}, surfacing it as a user-facing
 * notification via the host's {@link NotifierPort}. Counterpart to
 * {@link webviewLogHandler}: log commands stay in the output channel, this one
 * reaches the user directly.
 */
export function showInfoHandler(notifier: NotifierPort): MessageHandler<ShowInfoCommand> {
    return (message) => {
        notifier.showInfo(message.message);
    };
}

/** Registers {@link showInfoHandler} on `router`. */
export function registerWebviewNotificationHandlers(
    router: WebviewMessageRouter,
    notifier: NotifierPort,
): void {
    router.on("ShowInfoCommand", showInfoHandler(notifier));
}
