/**
 * Bridge-only orchestrator for the "Edit Script" feature on a remote host.
 *
 * The VS Code `ScriptTaskService` was deliberately *not* extracted to core: its
 * guts (resync-on-hidden-webview, `tabGroups` tracking, `FileSystemProvider`
 * caching quirks) are VS Code accidental complexity that doesn't port. JCEF
 * webviews are never "hidden" the way VS Code editor panels are, so the resync
 * machinery and the echo-prevention `writingGuard` are both moot here — content
 * is set at `LightVirtualFile` construction *before* the host attaches its
 * document listener, and the host never re-writes the script editor after open.
 *
 * What remains is the portable slice: pick a language when the model's
 * `scriptFormat` is unsupported, persist the choice, then address the script by
 * a stable `ScriptUri` and hand the host an opaque `scriptId`. The host is a
 * dumb editor surface keyed by that id; this class owns all BPMN/element
 * knowledge and maps host-reported edits back to the right webview.
 */

import {
    EditorSessionStore,
    NotifierPort,
    PickerPort,
    ScriptLanguage,
    ScriptUri,
} from "@miragon/bpmn-modeler-core";
import {
    OpenScriptEditorCommand,
    ScriptKind,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import { Rpc } from "./rpc";

/** The element-addressing fields needed to route a host edit back to the webview. */
interface TrackedScript {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
}

/**
 * Per-script tracking lives here, never on the host: re-opening the same script
 * resolves to the same `scriptId`, so the host can reveal an existing tab
 * instead of duplicating it, and `didChange` can be mapped back to the element
 * without the host knowing anything about BPMN.
 */
export class BridgeScriptEditor {
    private readonly scripts = new Map<string, TrackedScript>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly picker: PickerPort,
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Opens (or reveals) an inline script in a host text editor.
     *
     * Prompts for a language only when the model's `scriptFormat` is missing or
     * unsupported, persisting the pick back to the model so the next open skips
     * the prompt — mirroring the VS Code flow. `script/open` always carries the
     * content; the host ignores it when the `scriptId` is already tracked and
     * just reveals the existing tab (so a re-open never clobbers in-flight edits).
     */
    async open(cmd: OpenScriptEditorCommand, editorId: string): Promise<void> {
        let effectiveFormat = cmd.scriptFormat;
        if (!ScriptLanguage.isSupported(cmd.scriptFormat)) {
            const picked = await this.picker.pickScriptLanguage(cmd.scriptFormat);
            if (!picked) {
                return;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(editorId, cmd, picked);
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const uri = new ScriptUri(
            editorId,
            cmd.elementId,
            cmd.kind,
            cmd.listenerIndex,
            cmd.eventName,
            lang.extension,
        );
        const scriptId = uri.toString();

        this.scripts.set(scriptId, {
            editorId,
            elementId: cmd.elementId,
            kind: cmd.kind,
            listenerIndex: cmd.listenerIndex,
        });

        // `fileName` carries the extension so the host infers the FileType for
        // highlighting; `content` is honoured only on first open (see above).
        this.rpc.notify("script/open", {
            scriptId,
            fileName: uri.filename,
            languageId: lang.languageId,
            content: cmd.content,
        });
    }

    /** Host reported an edit in the script editor → push it into the owning webview. */
    async didChange(scriptId: string, content: string): Promise<void> {
        const entry = this.scripts.get(scriptId);
        if (!entry) {
            return;
        }
        try {
            await this.store.postMessage(
                entry.editorId,
                new UpdateScriptContentQuery(
                    entry.elementId,
                    entry.kind,
                    entry.listenerIndex,
                    content,
                ),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /** Host reported the user closed the script tab → drop tracking (no close echo). */
    didClose(scriptId: string): void {
        this.scripts.delete(scriptId);
    }

    /**
     * The BPMN editor was disposed: tell the host to close every script tab it
     * opened for that editor and drop their tracking. Iterating while deleting is
     * safe for a `Map` — only already-visited or current entries are removed.
     */
    disposeEditor(editorId: string): void {
        for (const [scriptId, entry] of this.scripts) {
            if (entry.editorId === editorId) {
                this.rpc.notify("script/close", { scriptId });
                this.scripts.delete(scriptId);
            }
        }
    }

    /**
     * Posts the language pick back to the webview so it persists to the model
     * (via the bpmn-js command stack) and subsequent opens skip the prompt.
     */
    private async sendFormatUpdate(
        editorId: string,
        cmd: OpenScriptEditorCommand,
        scriptFormat: string,
    ): Promise<void> {
        try {
            await this.store.postMessage(
                editorId,
                new UpdateScriptFormatQuery(
                    cmd.elementId,
                    cmd.kind,
                    cmd.listenerIndex,
                    scriptFormat,
                ),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
