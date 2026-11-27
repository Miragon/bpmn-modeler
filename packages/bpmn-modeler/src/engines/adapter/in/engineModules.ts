/** What one engine adds besides its slots, loaded on demand. */
export interface EngineModules {
    readonly modules: readonly unknown[];
    readonly moddleExtensions: Readonly<Record<string, object>>;
    readonly propertiesPanelDefaults: Readonly<Record<string, unknown>>;
}
