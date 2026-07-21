import { SessionMeta } from "../adapters";
import { SettingsSnapshot } from "../nodeAdapters";

/**
 * The payload the host sends on `session/register`: the editor identity/meta plus
 * the initial document content and an optional settings snapshot that must seed
 * the host-global config before any template discovery runs.
 */
export interface RegisterParams extends SessionMeta {
    content: string;
    /** Full `miragon.bpmnModeler.*` snapshot; seeds settings before template discovery. */
    settings?: Partial<SettingsSnapshot>;
    /**
     * Which modeler drives this session. Absent means `bpmn` so an older host that
     * predates DMN support keeps registering BPMN sessions unchanged. Only `dmn`
     * routes document sync/render to {@link DmnModelerService} and skips the
     * BPMN-only session hooks (template watcher, script tabs, code-link).
     */
    kind?: "bpmn" | "dmn";
}

/**
 * The bridge counterpart of the VS Code host's `EditorSessionParticipant`: the
 * seam that lets a feature keep its own per-session state (template watchers,
 * script tabs, code-link maps) without the editor-session feature importing it.
 * Hooks flow backward into {@link editorSessionFeature}'s register/dispose loop
 * while handles flow forward, so no feature has to know its siblings.
 */
export interface SessionHooks {
    onSessionRegistered?(params: RegisterParams): void | Promise<void>;
    onSessionDisposed?(editorId: string): void;
}
