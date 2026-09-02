import { commands, ExtensionContext, Uri, UriHandler, window } from "vscode";

import { BPMN_VIEW_TYPE, DMN_VIEW_TYPE, EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { FocusElementQuery } from "@miragon/bpmn-modeler-shared";

import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";

/**
 * The only path this handler answers. Anything else is ignored rather than
 * guessed at, so a link shape added later cannot be mis-handled by an older
 * extension version that happens to be installed.
 */
const OPEN_PATH = "/open";

/** File extension → the custom editor that owns it. */
const VIEW_TYPE_BY_EXTENSION: Record<string, string> = {
    ".bpmn": BPMN_VIEW_TYPE,
    ".dmn": DMN_VIEW_TYPE,
};

/**
 * Opens a diagram — and optionally selects one element inside it — from a
 * `vscode://` link.
 *
 * ```
 * vscode://miragon-gmbh.vs-code-bpmn-modeler/open?file=/abs/path/order.bpmn&element=Task_Approve
 * ```
 *
 * Why not the built-in `vscode://file/…`: it opens a path in whatever editor
 * VS Code picks and carries no element, so it cannot point at anything *inside*
 * a diagram. A link that lands on the exact task is what makes a diagram
 * citable — from a review comment, a ticket, a generated report, or a code
 * comment next to the delegate that implements the task.
 *
 * The element half reuses what a Problems-panel lint finding already does: open
 * (or reveal) the document in this extension's custom editor, then post a
 * {@link FocusElementQuery} that the webview answers by selecting and centring
 * the element.
 *
 * Only file types this extension owns are opened. The link comes from outside
 * the editor, so this must not become a way to open arbitrary paths.
 */
export class DeepLinkController implements UriHandler {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: VsCodeNotifier,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(window.registerUriHandler(this));
    }

    async handleUri(uri: Uri): Promise<void> {
        try {
            if (uri.path !== OPEN_PATH) {
                return;
            }

            const params = new URLSearchParams(uri.query);
            const file = params.get("file");
            if (!file) {
                this.notifier.notifyError(
                    "The link is missing its `file` parameter.",
                    new Error(`Unusable deep link: ${uri.toString(true)}`),
                );
                return;
            }

            const target = toFileUri(file);
            const viewType = viewTypeFor(target.path);
            if (!viewType) {
                this.notifier.notifyError(
                    "The link does not point at a BPMN or DMN file.",
                    new Error(`Unsupported deep-link target: ${target.fsPath}`),
                );
                return;
            }

            // Idempotent: reveals the document when it is already open, opens it
            // otherwise. Resolves once the webview exists, so the store has an
            // editor to post to.
            await commands.executeCommand("vscode.openWith", target, viewType);

            const elementId = params.get("element");
            if (elementId) {
                // The webview buffers a focus that arrives before its import
                // finishes, so a cold open lands on the element too.
                await this.editorStore.postMessage(
                    target.toString(),
                    new FocusElementQuery(elementId),
                );
            }
        } catch (error) {
            this.notifier.notifyError(
                "The diagram behind the link could not be opened.",
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }
}

/**
 * Accepts both spellings a link author is likely to produce: a full
 * `file:///…` URI and a bare absolute path. They cannot share one call —
 * `Uri.parse` reads a bare Windows path's drive letter as the scheme.
 */
function toFileUri(file: string): Uri {
    return file.startsWith("file:") ? Uri.parse(file) : Uri.file(file);
}

/** Case-insensitive, so a `.BPMN` written by hand still resolves. */
function viewTypeFor(path: string): string | undefined {
    const dot = path.lastIndexOf(".");
    return dot === -1 ? undefined : VIEW_TYPE_BY_EXTENSION[path.slice(dot).toLowerCase()];
}
