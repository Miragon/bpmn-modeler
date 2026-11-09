import { ProjectScope } from "../kernel/domain/projectScopes";
import {
    NO_TEMPLATE_PREFERENCES,
    TemplatePreferenceChange,
    TemplatePreferences,
    TemplatePreferencesByScope,
    templatePreferencesAfter,
    templatePreferencesByScopeKey,
} from "../kernel/domain/templatePreferences";
import { TemplatePreferenceStorePort } from "../kernel/port/templatePreferencePorts";

/**
 * A mirror of the host's lists, as a host adapter keeps one: `read()` sees what
 * another writer stored only once the store is told or asks with `readStored`.
 */
export class InMemoryTemplatePreferences implements TemplatePreferenceStorePort {
    private mirror: TemplatePreferencesByScope = NO_TEMPLATE_PREFERENCES;
    private stored: TemplatePreferencesByScope = NO_TEMPLATE_PREFERENCES;

    private readonly listeners = new Set<() => void>();
    private reportedKey = templatePreferencesByScopeKey(NO_TEMPLATE_PREFERENCES);

    read(): TemplatePreferencesByScope {
        return this.mirror;
    }

    async change(change: TemplatePreferenceChange): Promise<void> {
        this.stored = {
            ...this.stored,
            [change.scope]: templatePreferencesAfter(this.stored[change.scope], change),
        };
        this.pull();
    }

    async readStored(): Promise<TemplatePreferencesByScope> {
        this.pull();
        return this.mirror;
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    /** Another writer stores this list, as another window does; `notify` tells this store. */
    storeElsewhere(
        scope: ProjectScope,
        preferences: TemplatePreferences,
        { notify = false }: { readonly notify?: boolean } = {},
    ): void {
        this.stored = { ...this.stored, [scope]: preferences };
        if (notify) this.pull();
    }

    private pull(): void {
        this.mirror = this.stored;
        const key = templatePreferencesByScopeKey(this.mirror);
        if (key === this.reportedKey) return;
        this.reportedKey = key;
        this.listeners.forEach((listener) => listener());
    }
}
