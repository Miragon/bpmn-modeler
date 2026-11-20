import { logPreviewError, type PreviewCommandTable, type Query } from "@miragon/bpmn-modeler-shared";

import type { BpmnWebviewCommandType } from "../../../port/hostChannel";
import { emptyClipboard, emptyTextClipboard } from "./clipboardPreview";
import type { DiffPreview } from "./diffPreview";
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
import { paneOf, type PreviewMode } from "./previewMode";
import { definitionsMatching, unavailableFormPreview } from "./propertiesPanelPreview";

/** The preview a command arrives in, and the way back to the webview. */
export interface PreviewSession {
    readonly mode: PreviewMode;
    /** The URL's query when the command arrived. */
    readonly search: string;
    readonly diffPreview: DiffPreview;
    /** A feature without an answer for the current mode passes undefined and sends nothing. */
    reply(query: Query | undefined): void;
}

const NO_PARTNER_PANE = "a single pane has no partner pane to follow it";
const NO_WORKSPACE = "the preview has no workspace to act in";
const NO_SCRIPT_EDITOR = "the preview has no editor to open a script in";
const NO_MERGE = "the preview has no merge to decide in";
const NO_SECOND_EDITOR = "the preview has no second editor to compare in";
const NO_ELEMENT_ID_REVIEW = "the preview has no host to review element ids in";

export const PREVIEW_COMMANDS: PreviewCommandTable<BpmnWebviewCommandType, PreviewSession> = {
    GetBpmnFileCommand: (_, preview) => preview.reply(previewDocument(preview.mode)),
    GetBpmnPluginsCommand: (_, preview) => preview.reply(previewPlugins(preview.search)),
    GetElementTemplatesCommand: (_, preview) => preview.reply(previewElementTemplates()),
    GetBpmnModelerSettingCommand: (_, preview) => preview.reply(previewModelerSettings()),
    GetPropertiesPanelStateCommand: (_, preview) => preview.reply(previewPanelState()),
    SetPropertiesPanelStateCommand: { ignored: "the preview always opens the panel the same way" },
    RequestFocusCommand: (_, preview) => preview.reply(previewFocus()),
    GetClipboardCommand: (_, preview) => preview.reply(emptyClipboard()),
    SetClipboardCommand: { ignored: "the preview's clipboard stays empty" },
    GetTextClipboardCommand: (_, preview) => preview.reply(emptyTextClipboard()),
    SetTextClipboardCommand: { ignored: "the preview's text clipboard stays empty" },
    SyncDocumentCommand: { ignored: "the preview has no file to write an edit to" },
    DocumentFlushedCommand: { ignored: "the preview has no file to save" },
    LogDebugCommand: ({ message }) => console.debug(message),
    LogInfoCommand: ({ message }) => console.info(message),
    LogWarningCommand: ({ message }) => console.warn(message),
    LogErrorCommand: logPreviewError,
    ShowInfoCommand: ({ message }) => console.info("[INFO] ShowInfoCommand", message),
    DiffReadyCommand: (_, preview) => void answerReadyPane(preview),
    ViewportChangedCommand: { ignored: NO_PARTNER_PANE },
    CursorChangedCommand: {
        ignored: "a single pane has no partner pane to follow it; the stepper advances locally",
    },
    DiffPlaneChangedCommand: { ignored: NO_PARTNER_PANE },
    DiffSelectionChangedCommand: { ignored: NO_PARTNER_PANE },
    SwapCompareSidesCommand: { ignored: NO_PARTNER_PANE },
    MergeStepListChangedCommand: {
        ignored: "a single pane has no partner pane to follow it; the list switches locally",
    },
    PickMergeSideCommand: { ignored: NO_MERGE },
    UnpickMergeCommand: { ignored: NO_MERGE },
    MergePaneCommandsChangedCommand: { ignored: "a browser has no keyboard commands to offer" },
    BuildMergeResultCommand: { ignored: "the preview has no working file to build into" },
    CompareMergeResultCommand: { ignored: NO_SECOND_EDITOR },
    SwitchMergeComparisonCommand: { ignored: NO_SECOND_EDITOR },
    ShowElementXmlChangesCommand: { ignored: "the preview has no editor group for a text diff" },
    OpenElementXmlMergeCommand: (_, preview) =>
        preview.reply(finishedMergeXml(paneOf(preview.mode), preview.search)),
    GetBpmnlintConfigCommand: (_, preview) => preview.reply(noLintConfig()),
    SetLintingEnabledCommand: { ignored: "the preview has no setting to store it in" },
    UpdateLintResultsCommand: { ignored: "the preview has no problems view to list them in" },
    NavigateToReferencedModelCommand: { ignored: NO_WORKSPACE },
    NavigateToImplementationCommand: { ignored: NO_WORKSPACE },
    SyncActivitiesCommand: { ignored: NO_WORKSPACE },
    OpenScriptEditorCommand: { ignored: NO_SCRIPT_EDITOR },
    OpenScriptEditorsCommand: { ignored: NO_SCRIPT_EDITOR },
    UpdateScriptSourceCommand: { ignored: NO_SCRIPT_EDITOR },
    UpdateScriptVariablesCommand: { ignored: NO_SCRIPT_EDITOR },
    DiagramFormattedCommand: { ignored: "the preview has no host to report the layout to" },
    CleanupReportCommand: { ignored: "the preview has no host to report the cleanup to" },
    ElementIdProposalsCommand: { ignored: NO_ELEMENT_ID_REVIEW },
    ElementIdsAppliedCommand: { ignored: NO_ELEMENT_ID_REVIEW },
    OpenElementIdReviewCommand: { ignored: NO_ELEMENT_ID_REVIEW },
    GetFormPreviewCommand: (command, preview) => preview.reply(unavailableFormPreview(command)),
    GetFormReferenceStatusCommand: { ignored: NO_WORKSPACE },
    GetDiagramAsSVGCommand: { ignored: "the preview has no file to export to" },
    SearchWorkspaceDefinitionsCommand: (command, preview) =>
        preview.reply(definitionsMatching(command)),
};

export const PREVIEW_LOG_PREFIX = "[DEBUG]";

async function answerReadyPane(preview: PreviewSession): Promise<void> {
    const pane = paneOf(preview.mode);
    if (!pane) {
        return;
    }
    if (pane.kind === "merge") {
        preview.reply(mergeStatesFor(pane.side, preview.search));
        return;
    }
    preview.reply(await preview.diffPreview.highlightsFor(pane.side));
}
