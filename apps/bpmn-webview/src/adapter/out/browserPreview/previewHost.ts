import { asProtocolMessage, MockHostApi, type Query } from "@miragon/bpmn-modeler-shared";

import type { BpmnWebviewCommand } from "../../../port/hostChannel";
import type { WebviewState } from "../../../port/webviewState";
import { emptyClipboard, emptyTextClipboard } from "./clipboardPreview";
import { DiffPreview } from "./diffPreview";
import { previewDocument } from "./documentPreview";
import {
    previewElementTemplates,
    previewFocus,
    previewModelerSettings,
    previewPanelState,
    previewPlugins,
} from "./editorPreview";
import { noLintConfig } from "./lintPreview";
import { mergeStatesFor } from "./mergePreview";
import { finishedMergeXml } from "./mergeXmlPreview";
import { paneOf, PREVIEW_MODES, readPreviewMode } from "./previewMode";
import { definitionsMatching, unavailableFormPreview } from "./propertiesPanelPreview";

/**
 * The browser preview's host: answers the webview's commands with synthetic
 * `MessageEvent`s, in the {@link PreviewMode} the URL's `?mode=` selects. Each
 * answer lives in its feature's module beside this one.
 */
export class PreviewHost extends MockHostApi<WebviewState, BpmnWebviewCommand> {
    private readonly mode = readPreviewMode(window.location.search);

    private readonly diffPreview = new DiffPreview();

    constructor() {
        super();
        console.info(
            "[dev] bpmn-webview mock ready.  Mode:",
            this.mode,
            `\nURL variants: ${PREVIEW_MODES.map((mode) => `/?mode=${mode}`).join(", ")}`,
        );
    }

    override postMessage(message: BpmnWebviewCommand): void {
        const command = asProtocolMessage(message);
        const search = window.location.search;
        switch (command.type) {
            case "GetBpmnFileCommand": {
                console.debug("[DEBUG] GetBpmnFileCommand", message);
                reply(previewDocument(this.mode));
                break;
            }
            case "GetBpmnPluginsCommand": {
                reply(previewPlugins(search));
                break;
            }
            case "GetElementTemplatesCommand": {
                console.debug("[DEBUG] GetElementTemplatesCommand", message);
                reply(previewElementTemplates());
                break;
            }
            case "GetBpmnModelerSettingCommand": {
                console.debug("[DEBUG] GetBpmnModelerSettingCommand", message);
                reply(previewModelerSettings());
                break;
            }
            case "GetPropertiesPanelStateCommand": {
                console.debug("[DEBUG] GetPropertiesPanelStateCommand", message);
                reply(previewPanelState());
                break;
            }
            case "SetPropertiesPanelStateCommand": {
                console.debug("[DEBUG] SetPropertiesPanelStateCommand", message);
                break;
            }
            case "RequestFocusCommand": {
                reply(previewFocus());
                break;
            }
            case "GetClipboardCommand": {
                console.debug("[DEBUG] GetClipboardCommand", message);
                reply(emptyClipboard());
                break;
            }
            case "SetClipboardCommand": {
                console.debug("[DEBUG] SetClipboardCommand", message);
                break;
            }
            case "GetTextClipboardCommand": {
                console.debug("[DEBUG] GetTextClipboardCommand", message);
                reply(emptyTextClipboard());
                break;
            }
            case "SetTextClipboardCommand": {
                console.debug("[DEBUG] SetTextClipboardCommand", message);
                break;
            }
            case "SyncDocumentCommand": {
                console.debug("[DEBUG] SyncDocumentCommand", command.content);
                break;
            }
            case "DocumentFlushedCommand": {
                console.debug("[DEBUG] DocumentFlushedCommand", message);
                break;
            }
            case "LogDebugCommand": {
                console.debug(command.message);
                break;
            }
            case "LogInfoCommand": {
                console.info(command.message);
                break;
            }
            case "LogWarningCommand": {
                console.warn(command.message);
                break;
            }
            case "LogErrorCommand": {
                console.error(command.message);
                break;
            }
            case "ShowInfoCommand": {
                console.info("[INFO] ShowInfoCommand", command.message);
                break;
            }
            case "DiffReadyCommand": {
                console.debug("[DEBUG] DiffReadyCommand");
                void this.answerReadyPane(search);
                break;
            }
            case "ViewportChangedCommand": {
                // Single-pane preview: there's no partner to sync with.
                console.debug(
                    "[DEBUG] ViewportChangedCommand (no partner in dev)",
                    command.viewport,
                );
                break;
            }
            case "CursorChangedCommand": {
                // Single-pane preview: stepper advances locally only.
                console.debug("[DEBUG] CursorChangedCommand (no partner in dev)", command.index);
                break;
            }
            case "DiffPlaneChangedCommand": {
                console.debug(
                    "[DEBUG] DiffPlaneChangedCommand (no partner in dev)",
                    command.planeId,
                );
                break;
            }
            case "DiffSelectionChangedCommand": {
                console.debug(
                    "[DEBUG] DiffSelectionChangedCommand (no partner in dev)",
                    command.elementId,
                );
                break;
            }
            case "MergeStepListChangedCommand": {
                // Single-pane preview: the list is switched locally only.
                console.debug("[DEBUG] MergeStepListChangedCommand (no partner in dev)", command.list);
                break;
            }
            case "PickMergeSideCommand":
            case "UnpickMergeCommand": {
                // No merge to decide in: the recorded states stay as they are.
                console.debug(`[DEBUG] ${command.type}`, command.elementId, command.scope);
                break;
            }
            case "MergePaneCommandsChangedCommand": {
                // No keyboard commands to offer in a browser preview.
                console.debug("[DEBUG] MergePaneCommandsChangedCommand", command.available);
                break;
            }
            case "BuildMergeResultCommand":
            case "CompareMergeResultCommand":
            case "SwitchMergeComparisonCommand": {
                // No working file to build into, nor a second editor to compare in.
                console.debug(`[DEBUG] ${command.type}`);
                break;
            }
            case "ShowElementXmlChangesCommand": {
                // No editor group to open a text diff in.
                console.debug("[DEBUG] ShowElementXmlChangesCommand", command.elementId);
                break;
            }
            case "OpenElementXmlMergeCommand": {
                console.debug("[DEBUG] OpenElementXmlMergeCommand", command.elementId);
                reply(finishedMergeXml(paneOf(this.mode), search));
                break;
            }
            case "GetBpmnlintConfigCommand": {
                reply(noLintConfig());
                break;
            }
            case "SetLintingEnabledCommand": {
                console.debug("[DEBUG] SetLintingEnabledCommand", message);
                break;
            }
            case "UpdateLintResultsCommand": {
                console.debug("[DEBUG] UpdateLintResultsCommand", message);
                break;
            }
            // Capability-port commands. Dev keeps all capabilities so every
            // feature's UI stays testable; there is no real host to act on them,
            // so log-only cases replace the default throw that used to crash the
            // first SyncActivitiesCommand on load.
            case "NavigateToReferencedModelCommand": {
                console.debug("[DEBUG] NavigateToReferencedModelCommand", message);
                break;
            }
            case "NavigateToImplementationCommand": {
                console.debug("[DEBUG] NavigateToImplementationCommand", message);
                break;
            }
            case "SyncActivitiesCommand": {
                console.debug("[DEBUG] SyncActivitiesCommand", message);
                break;
            }
            case "OpenScriptEditorCommand": {
                console.debug("[DEBUG] OpenScriptEditorCommand", message);
                break;
            }
            case "OpenScriptEditorsCommand": {
                console.debug("[DEBUG] OpenScriptEditorsCommand", message);
                break;
            }
            case "UpdateScriptSourceCommand": {
                console.debug("[DEBUG] UpdateScriptSourceCommand", message);
                break;
            }
            case "UpdateScriptVariablesCommand": {
                console.debug("[DEBUG] UpdateScriptVariablesCommand", message);
                break;
            }
            case "DiagramFormattedCommand": {
                console.debug("[DEBUG] DiagramFormattedCommand", message);
                break;
            }
            case "CleanupReportCommand": {
                console.debug("[DEBUG] CleanupReportCommand", message);
                break;
            }
            case "ElementIdProposalsCommand":
            case "ElementIdsAppliedCommand":
            case "OpenElementIdReviewCommand": {
                console.debug(`[DEBUG] ${command.type}`, message);
                break;
            }
            case "GetFormPreviewCommand": {
                reply(unavailableFormPreview(command));
                break;
            }
            case "GetFormReferenceStatusCommand": {
                console.debug("[DEBUG] GetFormReferenceStatusCommand", message);
                break;
            }
            case "GetDiagramAsSVGCommand": {
                console.debug("[DEBUG] GetDiagramAsSVGCommand", message);
                break;
            }
            case "SwapCompareSidesCommand": {
                console.debug("[DEBUG] SwapCompareSidesCommand (no partner in dev)", message);
                break;
            }
            case "SearchWorkspaceDefinitionsCommand": {
                reply(definitionsMatching(command));
                break;
            }
            default: {
                throw new Error(`Unknown message type: ${message.type}`);
            }
        }
    }

    private async answerReadyPane(search: string): Promise<void> {
        const pane = paneOf(this.mode);
        if (!pane) {
            // DiffReadyCommand arrived in modeler mode — ignore.
            return;
        }
        if (pane.kind === "merge") {
            reply(mergeStatesFor(pane.side, search));
            return;
        }
        reply(await this.diffPreview.highlightsFor(pane.side));
    }
}

/** A feature without an answer for the current mode sends nothing. */
function reply(query: Query | undefined): void {
    if (query) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}
