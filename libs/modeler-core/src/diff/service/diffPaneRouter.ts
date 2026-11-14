import {
    BpmnDiffPaneCommandType,
    DiffPaneHandshakeCommandType,
    DmnDiffPaneCommandType,
} from "@miragon/bpmn-modeler-shared";

import { routeWebviewLogCommand } from "../../editorSession/service/webviewLog";
import {
    CommandTable,
    WebviewMessageRouter,
} from "../../editorSession/service/WebviewMessageRouter";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { BpmnDiffService } from "./BpmnDiffService";
import { DmnDiffService } from "./DmnDiffService";

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
    extensions: DiffPaneHostExtensions,
): WebviewMessageRouter<DiffPaneHandle> {
    return WebviewMessageRouter.fromTable<
        DiffPaneHandshakeCommandType | BpmnDiffPaneCommandType,
        DiffPaneHandle
    >({
        GetBpmnFileCommand: [(_command, pane) => diffService.sendViewerFile(pane)],
        GetBpmnModelerSettingCommand: {
            ignored: "a read-only diff pane applies no modeler settings",
        },
        GetPropertiesPanelStateCommand: { ignored: "a diff pane shows no properties panel" },
        DiffReadyCommand: [(_command, pane) => diffService.markReady(pane)],
        ViewportChangedCommand: [
            (command, pane) => diffService.forwardViewport(pane, command.viewport),
        ],
        CursorChangedCommand: [(command, pane) => diffService.forwardCursor(pane, command.index)],
        DiffPlaneChangedCommand: [
            (command, pane) => diffService.forwardPlane(pane, command.planeId),
        ],
        ...hostRoutes(extensions),
    });
}

/** Routes every command a DMN diff pane posts. */
export function createDmnDiffPaneRouter(
    diffService: DmnDiffService,
    extensions: DiffPaneHostExtensions,
): WebviewMessageRouter<DiffPaneHandle> {
    return WebviewMessageRouter.fromTable<DmnDiffPaneCommandType, DiffPaneHandle>({
        GetDmnFileCommand: [(_command, pane) => diffService.sendViewerFile(pane)],
        DiffReadyCommand: [(_command, pane) => diffService.markReady(pane)],
        ViewportChangedCommand: [
            (command, pane) => diffService.forwardViewport(pane, command.viewport),
        ],
        CursorChangedCommand: [(command, pane) => diffService.forwardCursor(pane, command.index)],
        DmnDiffViewChangedCommand: [
            (command, pane) => diffService.forwardView(pane, command.elementId),
        ],
        DmnDiffScrollChangedCommand: [
            (command, pane) => diffService.forwardScroll(pane, command.scroll),
        ],
        ...hostRoutes(extensions),
    });
}

function hostRoutes({
    swapSides,
    paneLog,
}: DiffPaneHostExtensions): CommandTable<
    "SwapCompareSidesCommand" | "LogErrorCommand",
    DiffPaneHandle
> {
    return {
        SwapCompareSidesCommand: swapSides
            ? [(_command, pane) => swapSides(pane)]
            : { ignored: "the host does not swap diff sides through the core" },
        LogErrorCommand: paneLog
            ? [
                  (command, pane) => {
                      routeWebviewLogCommand(paneLog, command, uriDisplayName(pane.uri));
                  },
              ]
            : { ignored: "the host keeps no log of its diff panes" },
    };
}
