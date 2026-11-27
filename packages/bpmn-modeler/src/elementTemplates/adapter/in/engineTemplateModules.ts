/** One engine's template modules around the shared ones, loaded on demand. */
export interface EngineTemplateModules {
    readonly leading: readonly unknown[];
    readonly trailing: readonly unknown[];
}
