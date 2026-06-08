import { commands, ExtensionContext } from "vscode";

import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { VsCodeDocument } from "../shared/infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "../shared/infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "../shared/infrastructure/VsCodeSettings";
import { VsCodeStatusBar } from "../shared/infrastructure/VsCodeStatusBar";
import { VsCodeNotifier } from "../shared/infrastructure/VsCodeNotifier";
import { VsCodePicker } from "../shared/infrastructure/VsCodePicker";
import { VsCodeClipboard } from "../shared/infrastructure/VsCodeClipboard";
import { VsCodeTextEditor } from "../shared/infrastructure/VsCodeTextEditor";
import { ArtifactService } from "@miragon/bpmn-modeler-core";

/**
 * The cross-cutting collaborators every feature draws from: the host-capability
 * adapters, the shared editor-session registry, and the one stateless service
 * (`artifactSvc`) consumed by two unrelated features. Bundling them lets each
 * feature's `register()` take a single `deps` argument instead of a long,
 * order-sensitive parameter list that `main.ts` would have to thread by hand.
 */
export interface SharedDeps {
    editorStore: EditorSessionStore;
    vsDocument: VsCodeDocument;
    vsWorkspace: VsCodeWorkspace;
    vsSettings: VsCodeSettings;
    statusBar: VsCodeStatusBar;
    notifier: VsCodeNotifier;
    picker: VsCodePicker;
    clipboard: VsCodeClipboard;
    textEditor: VsCodeTextEditor;
    artifactSvc: ArtifactService;
}

/**
 * Constructs the collaborators shared across features exactly once, so every
 * feature observes the same session registry and adapter instances. Only
 * genuinely cross-feature objects live here; feature-specific infrastructure is
 * built inside the owning feature's `register()`.
 */
export function buildSharedDeps(context: ExtensionContext): SharedDeps {
    // The open-editor count drives the `when`-clause context key for
    // keybindings/menus. Injected here so the store names no `vscode` API.
    const editorStore = new EditorSessionStore((count) =>
        commands.executeCommand("setContext", "bpmn-modeler.openCustomEditors", count),
    );
    context.subscriptions.push(editorStore);

    const vsWorkspace = new VsCodeWorkspace();
    const vsSettings = new VsCodeSettings();

    return {
        editorStore,
        vsDocument: new VsCodeDocument(editorStore),
        vsWorkspace,
        vsSettings,
        statusBar: new VsCodeStatusBar(),
        notifier: new VsCodeNotifier(),
        picker: new VsCodePicker(vsWorkspace),
        clipboard: new VsCodeClipboard(),
        textEditor: new VsCodeTextEditor(),
        artifactSvc: new ArtifactService(vsWorkspace, vsSettings),
    };
}
