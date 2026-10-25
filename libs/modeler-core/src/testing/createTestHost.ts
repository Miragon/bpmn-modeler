import { EditorSessionParticipant } from "../shared/domain/EditorSessionParticipant";
import { EditorSessionDocuments } from "../shared/infrastructure/EditorSessionDocuments";
import { EditorSessionLifecycle } from "../shared/infrastructure/EditorSessionLifecycle";
import { EditorSessionStore } from "../shared/infrastructure/EditorSessionStore";
import { WebviewMessageRouter } from "../shared/infrastructure/WebviewMessageRouter";
import { FakeEditorHandle } from "./FakeEditorHandle";
import {
    InMemorySecretStore,
    InMemoryTokenStore,
    ScriptedTokenPrompt,
} from "./InMemoryCredentials";
import { InMemoryDeploymentState } from "./InMemoryDeploymentState";
import {
    InMemoryClipboard,
    InMemoryPropertiesPanelState,
    RecordingDiagnostics,
} from "./inMemoryHostSurfaces";
import { InMemorySettings, SettingsValues } from "./InMemorySettings";
import { InMemoryWorkspace } from "./InMemoryWorkspace";
import { RecordingNotifier } from "./RecordingNotifier";
import { RecordingStatusBar } from "./RecordingStatusBar";
import { PickerAnswers, ScriptedPicker } from "./ScriptedPicker";

export interface TestHostOptions {
    folders?: string[];
    files?: Record<string, string>;
    settings?: Partial<SettingsValues>;
    answers?: PickerAnswers;
    tokenAnswers?: Record<string, string>;
}

export interface TestSessionOptions {
    content?: string;
    focused?: boolean;
    router?: WebviewMessageRouter;
}

/**
 * Every host port backed by memory, around a real {@link EditorSessionStore}.
 * `documents` reads and writes through the editors `openEditor` registers, as
 * the hosts' document adapters do. `openSession` runs participants through the
 * real {@link EditorSessionLifecycle}; the returned editor plays the host events.
 */
export function createTestHost(options: TestHostOptions = {}) {
    const store = new EditorSessionStore(() => undefined);
    const notifier = new RecordingNotifier();
    const lifecycles = new Map<string, EditorSessionLifecycle>();
    return {
        store,
        documents: new EditorSessionDocuments(store),
        notifier,
        picker: new ScriptedPicker(options.answers),
        settings: new InMemorySettings(options.settings),
        workspace: new InMemoryWorkspace(options.folders, options.files),
        statusBar: new RecordingStatusBar(),
        clipboard: new InMemoryClipboard(),
        secrets: new InMemorySecretStore(),
        tokens: new InMemoryTokenStore(),
        tokenPrompt: new ScriptedTokenPrompt(options.tokenAnswers),
        deploymentState: new InMemoryDeploymentState(),
        propertiesPanelState: new InMemoryPropertiesPanelState(),
        diagnostics: new RecordingDiagnostics(),
        openEditor(path: string, content = ""): FakeEditorHandle {
            const handle = new FakeEditorHandle(path, { content });
            store.register(handle);
            return handle;
        },
        async openSession(
            path: string,
            participants: EditorSessionParticipant[],
            {
                content = "",
                focused = true,
                router = new WebviewMessageRouter(),
            }: TestSessionOptions = {},
        ): Promise<FakeEditorHandle> {
            const handle = new FakeEditorHandle(path, { content });
            handle.active = focused;
            store.register(handle);
            const lifecycle = new EditorSessionLifecycle(store, notifier, router, participants);
            lifecycles.set(handle.id, lifecycle);
            await lifecycle.open(handle.id);
            return handle;
        },
        async reseedSession(editorId: string): Promise<void> {
            await lifecycles.get(editorId)?.reseed(editorId);
        },
    };
}

export type TestHost = ReturnType<typeof createTestHost>;
