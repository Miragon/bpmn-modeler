import { EditorSessionParticipant } from "../editorSession/domain/EditorSessionParticipant";
import { EditorSessionDocuments } from "../editorSession/service/EditorSessionDocuments";
import { EditorSessionLifecycle } from "../editorSession/service/EditorSessionLifecycle";
import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import { WebviewMessageRouter } from "../editorSession/service/WebviewMessageRouter";
import { ModelerSettingsSnapshot } from "../kernel/domain/modelerSettings";
import { ContentRowMigration } from "../kernel/service/ContentRowMigration";
import { MarketplaceAddAnswer } from "../template-marketplace/domain/marketplacePrompts";
import { DocumentChangeStream, FakeEditorHandle } from "./FakeEditorHandle";
import { folderOriginAllowances } from "./folderOriginAllowances";
import {
    InMemorySecretStore,
    InMemoryTokenStore,
    ScriptedTokenPrompt,
} from "./InMemoryCredentials";
import { InMemoryDeploymentState } from "./InMemoryDeploymentState";
import {
    InMemoryMarketplaceRegistrations,
    ScriptedMarketplacePrompt,
} from "./InMemoryMarketplaceRegistrations";
import {
    InMemoryClipboard,
    InMemoryLintingPreference,
    InMemoryPropertiesPanelState,
    RecordingDiagnostics,
} from "./inMemoryHostSurfaces";
import { InMemorySettings } from "./InMemorySettings";
import { InMemoryPluginApprovals } from "./InMemoryPluginApprovals";
import { InMemoryTemplatePreferences } from "./InMemoryTemplatePreferences";
import { InMemoryWorkspace } from "./InMemoryWorkspace";
import { RecordingNotifier } from "./RecordingNotifier";
import { RecordingStatusBar } from "./RecordingStatusBar";
import { PromptAnswers, ScriptedPicker } from "./ScriptedPicker";
import { NoticeAnswers, ScriptedActionNotifier } from "./ScriptedActionNotifier";

export interface TestHostOptions {
    folders?: string[];
    files?: Record<string, string>;
    settings?: Partial<ModelerSettingsSnapshot>;
    promptAnswers?: PromptAnswers;
    noticeAnswers?: NoticeAnswers;
    tokenAnswers?: Record<string, string>;
    /** Answered in order, one per add prompt. */
    marketplaceAnswers?: MarketplaceAddAnswer[];
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
 * Every add-on is its own folder origin, and `contentRows` never runs, so its
 * waits resolve at once.
 */
export function createTestHost(options: TestHostOptions = {}) {
    const store = new EditorSessionStore(() => undefined);
    const notifier = new RecordingNotifier();
    const lifecycles = new Map<string, EditorSessionLifecycle>();
    const documentChanges = new DocumentChangeStream();
    const settings = new InMemorySettings(options.settings);
    const pluginApprovals = new InMemoryPluginApprovals();
    const allowances = folderOriginAllowances();
    const openHandles = new Set<FakeEditorHandle>();
    const registerHandle = (handle: FakeEditorHandle, focused: boolean): void => {
        handle.active = focused;
        store.register(handle);
        // Only one editor has focus at a time: the hosts blur the one focused before.
        if (focused) {
            openHandles.forEach((other) => {
                if (other.active) other.loseFocus();
            });
        }
        openHandles.add(handle);
        handle.onDidDispose(() => openHandles.delete(handle));
    };
    return {
        store,
        documents: new EditorSessionDocuments(store),
        notifier,
        picker: new ScriptedPicker(options.promptAnswers),
        actionNotifier: new ScriptedActionNotifier(options.noticeAnswers),
        settings,
        workspace: new InMemoryWorkspace(options.folders, options.files),
        statusBar: new RecordingStatusBar(),
        clipboard: new InMemoryClipboard(),
        secrets: new InMemorySecretStore(),
        tokens: new InMemoryTokenStore(),
        tokenPrompt: new ScriptedTokenPrompt(options.tokenAnswers),
        marketplaceRegistrations: new InMemoryMarketplaceRegistrations(settings),
        marketplacePrompt: new ScriptedMarketplacePrompt(options.marketplaceAnswers),
        pluginApprovals,
        allowances,
        contentRows: new ContentRowMigration(pluginApprovals, allowances, notifier),
        templatePreferences: new InMemoryTemplatePreferences(),
        deploymentState: new InMemoryDeploymentState(),
        propertiesPanelState: new InMemoryPropertiesPanelState(),
        lintingPreference: new InMemoryLintingPreference(settings),
        diagnostics: new RecordingDiagnostics(),
        openEditor(
            path: string,
            content = "",
            { focused = false }: { focused?: boolean } = {},
        ): FakeEditorHandle {
            const handle = new FakeEditorHandle(path, { content, documentChanges });
            registerHandle(handle, focused);
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
            const handle = new FakeEditorHandle(path, { content, documentChanges });
            registerHandle(handle, focused);
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
