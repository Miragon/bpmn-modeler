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

export class InMemoryTemplatePreferences implements TemplatePreferenceStorePort {
    preferences: TemplatePreferencesByScope = NO_TEMPLATE_PREFERENCES;

    private readonly listeners = new Set<() => void>();
    private reportedKey = templatePreferencesByScopeKey(NO_TEMPLATE_PREFERENCES);

    read(): TemplatePreferencesByScope {
        return this.preferences;
    }

    async change(change: TemplatePreferenceChange): Promise<void> {
        this.preferences = {
            ...this.preferences,
            [change.scope]: templatePreferencesAfter(this.preferences[change.scope], change),
        };
        this.report();
    }

    async readStored(): Promise<TemplatePreferencesByScope> {
        this.report();
        return this.preferences;
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
        this.preferences = { ...this.preferences, [scope]: preferences };
        if (notify) this.report();
    }

    private report(): void {
        const key = templatePreferencesByScopeKey(this.preferences);
        if (key === this.reportedKey) return;
        this.reportedKey = key;
        this.listeners.forEach((listener) => listener());
    }
}
