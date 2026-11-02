import { ExtensionContext } from "vscode";

import {
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    ElementTemplateEditorFeature,
} from "@miragon/bpmn-modeler-core";
import { DocumentSaveFlushController } from "../modeler/editor-session/DocumentSaveFlushController";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { ElementTemplateEditorController } from "../modeler/elementTemplate/controller/ElementTemplateEditorController";
import { SharedDeps } from "./sharedDeps";

/** The element template editor, the main editor for template files. */
export function register(context: ExtensionContext, deps: SharedDeps): void {
    const editor = new ElementTemplateEditorFeature({
        settings: deps.vsSettings,
        notifier: deps.notifier,
    });
    context.subscriptions.push(editor.store);

    new ModelerEditorController(editor.store, deps.notifier, {
        viewType: ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
        messageRouter: editor.router,
        participants: editor.participants,
    }).register(context);
    new DocumentSaveFlushController(editor.store, editor.pendingEdits).register(context);
    new ElementTemplateEditorController(deps.notifier, deps.vsSettings).register(context);
}
