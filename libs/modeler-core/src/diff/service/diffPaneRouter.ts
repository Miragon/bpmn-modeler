import { DiffPaneCommandType } from "@miragon/bpmn-modeler-shared";

import { routeWebviewLogCommand } from "../../editorSession/service/webviewLog";
import { WebviewMessageRouter } from "../../editorSession/service/WebviewMessageRouter";
import { LoggerPort } from "../../kernel/domain/hostPorts";
import { DiffPaneHandle, basenameOfUriString } from "../domain/DiffSession";
import { BpmnDiffService } from "./BpmnDiffService";

/**
 * What a host adds to the diff panes' routes. An absent entry makes the router
 * ignore its command with one reason.
 */
export interface DiffPaneHostExtensions {
    /** Reopens the pane's compare-files diff with the two sides swapped. */
    readonly swapSides?: (pane: DiffPaneHandle) => Promise<void>;
    /** Receives the errors a pane reports, tagged with the pane's file name. */
    readonly paneLog?: LoggerPort;
}

/**
 * Routes every command a diff pane posts, so each host serves its panes from
 * one table and a coverage spec can read the routes.
 */
export function createDiffPaneRouter(
    diffService: BpmnDiffService,
    { swapSides, paneLog }: DiffPaneHostExtensions,
): WebviewMessageRouter<DiffPaneHandle> {
    return (
        WebviewMessageRouter.fromTable<DiffPaneCommandType, DiffPaneHandle>({
            DiffReadyCommand: [(_command, pane) => diffService.markReady(pane)],
            ViewportChangedCommand: [
                (command, pane) => diffService.forwardViewport(pane, command.viewport),
            ],
            CursorChangedCommand: [
                (command, pane) => diffService.forwardCursor(pane, command.index),
            ],
            SwapCompareSidesCommand: swapSides
                ? [(_command, pane) => swapSides(pane)]
                : { ignored: "the host swaps the sides itself, before it forwards a message" },
            LogErrorCommand: paneLog
                ? [
                      (command, pane) => {
                          routeWebviewLogCommand(paneLog, command, basenameOfUriString(pane.uri));
                      },
                  ]
                : { ignored: "the host keeps no log of its diff panes" },
        })
            // The page asks for its file before the reply names it a diff pane.
            .on("GetBpmnFileCommand", (_command, pane) => diffService.sendViewerFile(pane))
    );
}
