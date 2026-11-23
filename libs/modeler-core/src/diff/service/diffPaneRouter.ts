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
import { NO_ELEMENT_XML_MERGE_EDITOR } from "../domain/elementXmlMerge";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { BpmnDiffService } from "./BpmnDiffService";
import { DmnDiffService } from "./DmnDiffService";
import type { MergePaneCommandService } from "./MergePaneCommandService";

/** A host's keyboard commands of the merge panes: takes what each pane says they can do. */
export type MergePaneCommands = Pick<MergePaneCommandService, "report">;

/**
 * What a host adds to the diff panes' routes. An absent entry makes the router
 * ignore its command with one reason.
 */
export interface DiffPaneHostExtensions {
    /** Reopens the pane's compare-files diff with the two sides swapped. */
    readonly swapSides?: (pane: DiffPaneHandle) => Promise<void>;
    /** Receives the errors a pane reports, tagged with the pane's file name. */
    readonly paneLog?: LoggerPort;
    /** Takes what a merge pane says its keyboard commands can do; BPMN panes only. */
    readonly mergePaneCommands?: MergePaneCommands;
}

/**
 * Routes every command a BPMN diff pane posts, so each host serves its panes
 * from one table and a coverage spec can read the routes.
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
        DiffSelectionChangedCommand: [
            (command, pane) => diffService.forwardSelection(pane, command.elementId),
            (command, pane) => diffService.followSelectionWithElementXml(pane, command.elementId),
        ],
        ShowElementXmlChangesCommand: diffService.showsElementXmlChanges
            ? [(command, pane) => diffService.showElementXmlChanges(pane, command.elementId)]
            : { ignored: "the host shows no element XML diff" },
        ...mergeRoutes(diffService),
        OpenElementXmlMergeCommand: diffService.offersElementXmlMerge
            ? [
                  (command, pane) =>
                      diffService.openElementXmlMerge(pane, command.elementId, command.resume),
              ]
            : { ignored: NO_ELEMENT_XML_MERGE_EDITOR },
        ...mergeResultRoutes(diffService),
        ...mergePaneCommandRoutes(extensions),
        ...hostRoutes(extensions),
    });
}

function mergeRoutes(
    diffService: BpmnDiffService,
): CommandTable<
    "MergeStepListChangedCommand" | "PickMergeSideCommand" | "UnpickMergeCommand",
    DiffPaneHandle
> {
    if (!diffService.opensMergeViews) {
        const ignored = { ignored: "the host opens no merge view" };
        return {
            MergeStepListChangedCommand: ignored,
            PickMergeSideCommand: ignored,
            UnpickMergeCommand: ignored,
        };
    }
    return {
        MergeStepListChangedCommand: [
            (command, pane) => diffService.chooseMergeStepList(pane, command.list),
        ],
        PickMergeSideCommand: [
            (command, pane) =>
                command.mergesXml
                    ? diffService.pickMergeSideThenMergeXml(pane, command)
                    : diffService.pickMergeSide(
                          pane,
                          command.elementId,
                          command.scope,
                          command.side,
                          command.dropsHandMerges,
                      ),
        ],
        UnpickMergeCommand: [
            (command, pane) =>
                diffService.unpickMerge(
                    pane,
                    command.elementId,
                    command.scope,
                    command.dropsHandMerges,
                ),
        ],
    };
}

function mergePaneCommandRoutes({
    mergePaneCommands,
}: DiffPaneHostExtensions): CommandTable<"MergePaneCommandsChangedCommand", DiffPaneHandle> {
    return {
        MergePaneCommandsChangedCommand: mergePaneCommands
            ? [(command, pane) => mergePaneCommands.report(pane, command.available)]
            : { ignored: "the host offers no keyboard commands for merge panes" },
    };
}

function mergeResultRoutes(
    diffService: BpmnDiffService,
): CommandTable<
    "BuildMergeResultCommand" | "CompareMergeResultCommand" | "SwitchMergeComparisonCommand",
    DiffPaneHandle
> {
    if (!diffService.buildsMergeResults) {
        const ignored = { ignored: "the host builds no merge result" };
        return {
            BuildMergeResultCommand: ignored,
            CompareMergeResultCommand: ignored,
            SwitchMergeComparisonCommand: ignored,
        };
    }
    return {
        BuildMergeResultCommand: [(_command, pane) => diffService.buildMergeResult(pane)],
        CompareMergeResultCommand: [
            (command, pane) => diffService.compareMergeResult(pane, command.against),
        ],
        SwitchMergeComparisonCommand: [(_command, pane) => diffService.switchMergeComparison(pane)],
    };
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
