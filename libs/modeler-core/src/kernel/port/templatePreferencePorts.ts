import {
    TemplatePreferenceChange,
    TemplatePreferencesByScope,
} from "../domain/templatePreferences";

/**
 * The user's template switches, kept by the host outside every repository:
 * per project (VS Code's workspace state) and for all projects (VS Code's
 * global state), on this machine only. A preference, not a trust decision.
 */
export interface TemplatePreferenceStorePort {
    /** Synchronous; a mirror may lag the host by one push. */
    read(): TemplatePreferencesByScope;
    /**
     * The host merges the change into the list it stores for `change.scope`,
     * with `templatePreferencesAfter`, in one step, so a switch another writer
     * stored stays. Rejects a change that names a switch twice and stores
     * nothing then. Resolves once `read()` includes the change.
     */
    change(change: TemplatePreferenceChange): Promise<void>;
    /**
     * Both scopes as the host stores them now, or newer ones the store heard
     * of meanwhile; `read()` returns them from then on.
     */
    readStored(): Promise<TemplatePreferencesByScope>;
    /**
     * Once the store learns of new switches in either scope: its own change,
     * a host push or `readStored`. Never for the same switches.
     */
    onDidChange(listener: () => void): { dispose(): void };
}
