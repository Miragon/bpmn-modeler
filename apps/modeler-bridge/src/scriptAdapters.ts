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
    beansFor,
    COMPLEX_TYPES,
    EditorSessionStore,
    globalFunctionsFor,
    methodsForBean,
    NotifierPort,
    PickerPort,
    ScriptLanguage,
    ScriptUri,
    ScriptVariableManifestService,
} from "@miragon/bpmn-modeler-core";
import {
    dedupeVariables,
    OpenScriptEditorCommand,
    ScriptKind,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    VariableDef,
} from "@miragon/bpmn-modeler-shared";

import { BridgeSettings } from "./nodeAdapters";
import { Rpc } from "./rpc";
import { METHODS } from "./protocol/descriptor";

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

    // Two process-variable sources per editor, kept apart and merged on read
    // (mirrors the VS Code `ScriptVariableStore`): the webview-extracted model
    // (seeded on open, replaced on every `UpdateScriptVariablesCommand`) and the
    // `*.bpmn.vars.json` manifest model (loaded on session register, refreshed by
    // the file watcher). `mergedFor` deduplicates them so the manifest's
    // `authored` tier wins clashes; the merge feeds both the `script/open`
    // payload and the `script/updateVariables` push.
    private readonly extractedByEditor = new Map<string, VariableDef[]>();
    private readonly manifestByEditor = new Map<string, VariableDef[]>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly picker: PickerPort,
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
        private readonly settings: BridgeSettings,
        private readonly manifestSvc: ScriptVariableManifestService,
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

        // Seed the editor's extracted model from the open command so the host has
        // variable completion before the first live update arrives.
        this.extractedByEditor.set(editorId, cmd.variables ?? []);

        // The SPIN globals (`S`/`JSON`) and the type→methods table are gated here
        // in the bridge (single source): off → empty, so the Kotlin contributor
        // renders nothing and needs no gate of its own. Shipping the full
        // `COMPLEX_TYPES` map when on is harmless — the host only consults `types`
        // on a variable's `typeHint` lookup, and `SpinJsonNode` is the only hint
        // the producer heuristic currently stamps.
        const spinOn = this.settings.getScriptingSpin();

        // `fileName` carries the extension so the host infers the FileType for
        // highlighting; `content` is honoured only on first open (see above).
        // `completion` ships the kind-scoped bean/method catalog resolved *here*
        // so the thin Kotlin host never needs to know which beans belong to which
        // kind — it just renders what it is handed (VS Code's
        // `registerCompletionItemProvider` has no PSI-based analogue, so the host
        // drives a `CompletionContributor` off this payload instead). `variables`
        // rides alongside so the host can complete process-variable names too.
        this.rpc.notify(METHODS.scriptOpen, {
            scriptId,
            fileName: uri.filename,
            languageId: lang.languageId,
            content: cmd.content,
            completion: {
                beans: beansFor(cmd.kind).map((bean) => ({
                    name: bean.name,
                    type: bean.type,
                    description: bean.description,
                    // Empty for value beans (e.g. `eventName: String`) — correct,
                    // they have no member completion.
                    methods: methodsForBean(bean),
                })),
                variables: this.mergedFor(editorId),
                globals: spinOn ? globalFunctionsFor(cmd.kind) : [],
                types: spinOn
                    ? Object.fromEntries(COMPLEX_TYPES.map((type) => [type.name, type.methods]))
                    : {},
            },
        });
    }

    /**
     * Replaces an editor's webview-extracted model and re-pushes the merged
     * model to every open script tab of that editor via `script/updateVariables`,
     * so completion goes live without reopening. Scoped to the originating
     * editor's scripts only.
     */
    updateVariables(editorId: string, variables: VariableDef[]): void {
        this.extractedByEditor.set(editorId, variables);
        this.pushVariables(editorId);
    }

    /**
     * Loads the `*.bpmn.vars.json` manifest for an editor and re-pushes the merged
     * model. Called on session register (no tabs open yet, so the push is a no-op
     * that just seeds the manifest source) and on every manifest file change.
     * A read error is logged and leaves the previous manifest model in place.
     */
    async loadManifest(editorId: string, documentPath: string): Promise<void> {
        try {
            this.manifestByEditor.set(editorId, await this.manifestSvc.load(documentPath));
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }
        this.pushVariables(editorId);
    }

    /**
     * Watches the manifest file and reloads + re-pushes on any change. The
     * returned handle is owned by the session feature, which disposes it when the
     * editor closes.
     */
    watchManifest(editorId: string, documentPath: string): { dispose(): void } {
        return this.manifestSvc.createWatcher(documentPath, () => {
            void this.loadManifest(editorId, documentPath);
        });
    }

    /** Deduplicated manifest-over-extracted model; manifest's `authored` tier wins. */
    private mergedFor(editorId: string): VariableDef[] {
        const manifest = this.manifestByEditor.get(editorId) ?? [];
        const extracted = this.extractedByEditor.get(editorId) ?? [];
        return dedupeVariables([...manifest, ...extracted]);
    }

    /** Pushes the merged model to every open script tab of `editorId`. */
    private pushVariables(editorId: string): void {
        const variables = this.mergedFor(editorId);
        for (const [scriptId, entry] of this.scripts) {
            if (entry.editorId === editorId) {
                this.rpc.notify(METHODS.scriptUpdateVariables, { scriptId, variables });
            }
        }
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
                this.rpc.notify(METHODS.scriptClose, { scriptId });
                this.scripts.delete(scriptId);
            }
        }
        this.extractedByEditor.delete(editorId);
        this.manifestByEditor.delete(editorId);
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
