import { Memento } from "vscode";

import {
    ProjectScope,
    storedTemplatePreferencesOf,
    TemplatePreferenceChange,
    TemplatePreferencesByScope,
    templatePreferencesAfter,
    templatePreferencesByScopeKey,
    templatePreferencesKey,
    TemplatePreferenceStorePort,
} from "@miragon/bpmn-modeler-core";

export const TEMPLATE_PREFERENCES_KEY = "bpmnTemplatePreferences";

/**
 * This project's switches in VS Code's workspace state and every project's in
 * its global state: per user, outside the repository and on this machine only,
 * as no key is synced.
 *
 * Another window's write reaches this one only through `readStored`, which the
 * composition calls when the window gains focus.
 */
export class VsCodeTemplatePreferenceStore implements TemplatePreferenceStorePort {
    // Each change reads a list only after the one before it stored, whether or
    // not the memento's update sets its value before it resolves.
    private changes: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<() => void>();
    private reportedKey: string;

    constructor(private readonly mementos: Readonly<Record<ProjectScope, Memento>>) {
        this.reportedKey = templatePreferencesByScopeKey(this.read());
    }

    read(): TemplatePreferencesByScope {
        return {
            project: storedTemplatePreferencesOf(
                this.mementos.project.get(TEMPLATE_PREFERENCES_KEY),
            ),
            allProjects: storedTemplatePreferencesOf(
                this.mementos.allProjects.get(TEMPLATE_PREFERENCES_KEY),
            ),
        };
    }

    change(change: TemplatePreferenceChange): Promise<void> {
        const changed = this.changes.then(async () => {
            const stored = this.read()[change.scope];
            const merged = templatePreferencesAfter(stored, change);
            if (templatePreferencesKey(merged) === templatePreferencesKey(stored)) return;
            try {
                await this.mementos[change.scope].update(TEMPLATE_PREFERENCES_KEY, merged);
            } finally {
                // VS Code's memento keeps the value in memory when the persist rejects.
                this.report();
            }
        });
        this.changes = changed.catch(() => undefined);
        return changed;
    }

    async readStored(): Promise<TemplatePreferencesByScope> {
        this.report();
        return this.read();
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    private report(): void {
        const key = templatePreferencesByScopeKey(this.read());
        if (key === this.reportedKey) return;
        this.reportedKey = key;
        this.listeners.forEach((listener) => listener());
    }
}
