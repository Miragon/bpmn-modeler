import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import {
    displayDocumentHandler,
    DocumentRenderParticipant,
    EditorSessionDocuments,
    EditorSessionStore,
    ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
    ElementTemplatePreviewService,
    PreviewLanguageParticipant,
    registerWebviewLogHandlers,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { ElementTemplatePreviewController } from "../modeler/elementTemplate/controller/ElementTemplatePreviewController";
import { openTemplatePreviewAutomatically } from "../shared/infrastructure/modelerConfiguration";
import { SharedDeps } from "./sharedDeps";

/**
 * The read-only element-template preview, opened beside a template's JSON
 * editor. Its sessions live in their own store, so they never become the target
 * of modeler commands or count towards `bpmn-modeler.openCustomEditors`.
 */
export function register(context: ExtensionContext, deps: SharedDeps): void {
    const previewStore = new EditorSessionStore(() => undefined);
    context.subscriptions.push(previewStore);
    const previewDocuments = new EditorSessionDocuments(previewStore);
    const previewService = new ElementTemplatePreviewService(
        previewStore,
        previewDocuments,
        deps.vsSettings,
        deps.notifier,
    );

    const messageRouter = new WebviewMessageRouter().on(
        "GetElementTemplateFileCommand",
        displayDocumentHandler(previewService, deps.notifier, "Element template preview is ready"),
    );
    registerWebviewLogHandlers(messageRouter, deps.notifier, (editorId) => {
        try {
            return basename(previewDocuments.getFilePath(editorId));
        } catch {
            return undefined;
        }
    });

    new ModelerEditorController(previewStore, deps.notifier, {
        viewType: ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
        messageRouter,
        participants: [
            new DocumentRenderParticipant(previewService, ".json", deps.notifier),
            new PreviewLanguageParticipant(previewStore, deps.vsSettings, deps.notifier),
        ],
    }).register(context);
    new ElementTemplatePreviewController(deps.notifier, openTemplatePreviewAutomatically).register(
        context,
    );
}
