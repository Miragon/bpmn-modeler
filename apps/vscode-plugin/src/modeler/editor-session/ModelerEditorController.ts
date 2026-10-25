import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
} from "vscode";

import {
    basenameOfUriString,
    EditorSessionLifecycle,
    EditorSessionParticipant,
    EditorSessionStore,
    NotifierPort,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";
import { VsCodeEditorHandle } from "../../shared/infrastructure/VsCodeEditorHandle";

/**
 * Per-`viewType` configuration for {@link ModelerEditorController}. Everything
 * that differs between the modeler editors is data here, so one controller
 * class serves all of them.
 */
export interface ModelerEditorOptions {
    viewType: string;
    messageRouter: WebviewMessageRouter;
    participants: readonly EditorSessionParticipant[];

    /**
     * Optional diff routing. Returning `true` means this resolve was handled
     * elsewhere (a diff pane), so the editor session must not be created.
     */
    delegateResolve?: (document: TextDocument, panel: WebviewPanel) => boolean;

    /** Persisted properties-panel visibility, pre-applied where supported. */
    initialPanelVisible?: () => boolean;
}

/**
 * Generic `CustomTextEditorProvider` for the modeler editors.
 *
 * Constant-size as features grow: `resolveCustomTextEditor` reduces to URI
 * routing → create the handle → hand the session to the host-agnostic
 * {@link EditorSessionLifecycle}, which dispatches messages and runs every
 * {@link EditorSessionParticipant} — the same lifecycle the IntelliJ bridge runs.
 */
export class ModelerEditorController implements CustomTextEditorProvider {
    private readonly lifecycle: EditorSessionLifecycle;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
        private readonly options: ModelerEditorOptions,
    ) {
        this.lifecycle = new EditorSessionLifecycle(
            editorStore,
            notifier,
            options.messageRouter,
            options.participants,
        );
    }

    /**
     * Registers this provider as the custom editor for its `viewType` and adds
     * the resulting disposable to the extension context.
     *
     * Webview context is intentionally not retained on hide; the webview
     * re-fetches the document on reload and `WebviewStateManager` round-trips
     * viewport / selection / panel state through `vscode.setState`.
     */
    register(context: ExtensionContext): void {
        const provider = window.registerCustomEditorProvider(this.options.viewType, this);
        context.subscriptions.push(provider);
    }

    /**
     * Called by VS Code whenever a matching file is opened. The diff branch
     * short-circuits before any session is created.
     */
    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        try {
            // Diff branch (BPMN only): the diff controller owns this pane, so no
            // editor session is created. One provider per viewType makes the
            // entry point the only place that can decide diff-pane vs. editor.
            if (this.options.delegateResolve?.(document, webviewPanel)) {
                return;
            }

            const editorId = document.uri.toString();
            const editorHandle = VsCodeEditorHandle.create(
                this.options.viewType,
                editorId,
                webviewPanel,
                document,
                this.options.initialPanelVisible?.(),
            );
            this.editorStore.register(editorHandle);
            // Reproduction breadcrumb: the open/close pair frames a session in the
            // channel so a bug report reads as a sequence of user steps.
            this.notifier.logInfo(
                `Editor opened: ${basenameOfUriString(editorId)} (${this.options.viewType})`,
            );

            // Participant order still matters for behaviour: the render
            // participant must run first so the diagram is mounted before later
            // participants broadcast settings/engine state against it.
            await this.lifecycle.open(editorId, () =>
                this.notifier.logInfo(
                    `Editor closed: ${basenameOfUriString(editorId)} (${this.options.viewType})`,
                ),
            );
        } catch (error) {
            this.notifier.showError((error as Error).message);
            this.notifier.logError(error as Error);
        }
    }
}
