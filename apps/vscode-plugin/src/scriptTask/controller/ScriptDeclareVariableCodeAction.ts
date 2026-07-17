import {
    CodeAction,
    CodeActionKind,
    CodeActionProvider,
    commands,
    ExtensionContext,
    languages,
    Range,
    TextDocument,
    Uri,
    window,
} from "vscode";

import {
    beansFor,
    parseEditorHashFromUri,
    parseKindFromUri,
    ScriptVariableManifestService,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { ScriptCompletionProvider } from "./ScriptCompletionProvider";
import { ScriptTaskService } from "./ScriptTaskService";

/**
 * 💡 quick-fix that scaffolds a `*.bpmn.vars.json` entry for an unknown variable
 * referenced in an inline script, then opens the manifest so the author can fill
 * in `type`/`description`. It closes the "dead-metadata trap": a hand-authored
 * sidecar nobody discovers. The affordance appears exactly where the gap is felt
 * — editing a script and naming a variable the model doesn't know.
 *
 * VS Code has no Groovy parser for these script documents, so
 * "unknown" is a lexical heuristic: the word under the caret looks like an
 * identifier and is absent from the merged completion set (process variables +
 * the kind's Camunda beans). Gating to unknown-only — and only as a user-invoked
 * action — keeps the rare false positive (a script-local variable) acceptable;
 * the IntelliJ counterpart uses real PSI resolution for precision instead.
 */
export class ScriptDeclareVariableCodeAction implements CodeActionProvider {
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    // Programmatic command backing the quick-fix. The action can't carry a
    // WorkspaceEdit because the work is async file IO plus opening the manifest,
    // which an edit can't express — so it dispatches this command instead.
    private static readonly COMMAND = "miragon.bpmnModeler.declareScriptVariable";

    // A bare identifier word, so the action never offers on an operator, number,
    // or string fragment the word-range happens to capture.
    private static readonly IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

    constructor(
        private readonly scriptTaskSvc: ScriptTaskService,
        private readonly store: ScriptVariableStore,
        private readonly manifestSvc: ScriptVariableManifestService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Registers the provider for every supported script language scoped to the
     * script directory (mirroring {@link ScriptCompletionProvider}) plus the
     * single command the quick-fix dispatches.
     */
    register(context: ExtensionContext): void {
        for (const language of ScriptCompletionProvider.LANGUAGES) {
            context.subscriptions.push(
                languages.registerCodeActionsProvider(
                    { scheme: "file", language, pattern: ScriptCompletionProvider.PATH_GLOB },
                    this,
                    {
                        providedCodeActionKinds:
                            ScriptDeclareVariableCodeAction.providedCodeActionKinds,
                    },
                ),
            );
        }
        context.subscriptions.push(
            commands.registerCommand(
                ScriptDeclareVariableCodeAction.COMMAND,
                (scriptUri: Uri, name: string) => this.declare(scriptUri, name),
            ),
        );
    }

    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        // The path glob is only a heuristic — any user directory named
        // `tmp/scripting` matches it. Only documents the service actually
        // tracks as open scripts get the action.
        if (!this.scriptTaskSvc.getEditorIdForScriptUri(document.uri.path)) {
            return [];
        }
        const wordRange = document.getWordRangeAtPosition(range.start);
        if (!wordRange) {
            return [];
        }
        const word = document.getText(wordRange);
        if (
            !ScriptDeclareVariableCodeAction.IDENTIFIER.test(word) ||
            this.isKnown(document, word)
        ) {
            return [];
        }

        const action = new CodeAction(
            `Declare '${word}' in variable manifest`,
            CodeActionKind.QuickFix,
        );
        action.command = {
            command: ScriptDeclareVariableCodeAction.COMMAND,
            title: action.title,
            arguments: [document.uri, word],
        };
        return [action];
    }

    /**
     * Whether `word` is already a known symbol for this script's editor — a merged
     * process variable or one of the kind's Camunda beans (`execution`, `task`,
     * …). Beans are folded in so referencing an in-scope bean never offers a
     * spurious "declare" action, matching what the author sees in completion.
     */
    private isKnown(document: TextDocument, word: string): boolean {
        const editorHash = parseEditorHashFromUri(document.uri.path) ?? "";
        if (this.store.getByEditorHash(editorHash).some((variable) => variable.name === word)) {
            return true;
        }
        const kind = parseKindFromUri(document.uri.path);
        return kind ? beansFor(kind).some((bean) => bean.name === word) : false;
    }

    /**
     * Appends `{ name }` to the diagram's manifest and opens it. The editorId is
     * recovered from the script URI, then converted to an fs path at this host
     * boundary (the manifest service speaks fs paths); a non-`file:` editor (a
     * diff pane) has no manifest on disk, so the action is silently skipped. The
     * session's manifest watcher re-pushes completion on the write — no manual
     * refresh here.
     */
    private async declare(scriptUri: Uri, name: string): Promise<void> {
        const editorId = this.scriptTaskSvc.getEditorIdForScriptUri(scriptUri.path);
        if (!editorId) {
            return;
        }
        const editorUri = Uri.parse(editorId);
        if (editorUri.scheme !== "file") {
            return;
        }
        try {
            const manifestPath = await this.manifestSvc.upsert(editorUri.fsPath, { name });
            await window.showTextDocument(Uri.file(manifestPath));
        } catch (error) {
            this.notifier.notifyError("Failed to update process-variable manifest", error as Error);
        }
    }
}
