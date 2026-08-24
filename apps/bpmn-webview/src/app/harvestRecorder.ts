/**
 * DEV-ONLY harvest harness. Injected as a didi module in development so a
 * browser driver can record every template the running modeler passes to
 * `translate()` — the authoritative "needed key" set used to prune the local
 * i18n overlay (see libs/bpmn-i18n-extras/tools/build-overlay). Not shipped:
 * the dev entry only wires it when `import.meta.env.DEV` is true.
 */
export function createHarvestRecorder(): unknown {
    const harvested = new Set<string>();
    (window as unknown as { __harvested: Set<string> }).__harvested = harvested;

    const recorder = {
        __init__: ["__harvestHook"],
        // Overrides the shared translate service: records the template, then
        // renders it (English) so the editor still functions during a harvest.
        translate: [
            "value",
            (template: string, replacements?: Record<string, string>) => {
                harvested.add(template);
                return String(template).replace(
                    /{([^}]+)}/g,
                    (_: string, key: string) => (replacements ?? {})[key] ?? `{${key}}`,
                );
            },
        ],
        // Captures the DI injector so the browser driver can reach palette,
        // contextPad, popupMenu, linting and the properties-panel providers.
        __harvestHook: [
            "type",
            function harvestHook(injector: unknown) {
                (window as unknown as { __injector: unknown }).__injector = injector;
            },
        ],
    };
    (recorder.__harvestHook[1] as unknown as { $inject: string[] }).$inject = ["injector"];
    return recorder;
}
