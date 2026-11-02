import { SettingChange } from "@miragon/bpmn-modeler-core";

/** The personal modeler preferences the commands toggle, and the stream of setting changes. */
export interface ModelerPreferences {
    lintingEnabled(): boolean;
    setLintingEnabled(enabled: boolean): PromiseLike<void>;
    setLanguage(locale: string): PromiseLike<void>;
    onDidChangeSetting(listener: (change: SettingChange) => void): { dispose(): unknown };
}
