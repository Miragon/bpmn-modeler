/**
 * DEV-ONLY harvest harness. Injected as a didi module in development so a
 * browser driver can record every template the running modeler passes to
 * `translate()` — the authoritative "needed key" set used to prune the local
 * i18n overlay (see libs/bpmn-i18n-extras/tools/build-overlay). Not shipped:
 * the dev entry only wires it when `import.meta.env.DEV` is true.
 *
 * Shared by both webviews. A single-view modeler (bpmn-js) injects one recorder;
 * a multi-view modeler (dmn-js) injects one per view, and every instance appends
 * to the *same* `window.__harvested` set so a drain across views (DRD, decision
 * table, …) accumulates into one result. `window.__injector` holds the
 * last-initialised view's DI injector; the DMN drain reaches the other views
 * through `injector.get("_parent")`, the dmn-js Manager.
 */
export function createHarvestRecorder(): unknown {
    const harvestWindow = window as unknown as {
        __harvested?: Set<string>;
        __injector?: unknown;
    };
    // Reuse an existing set so a second recorder (a second dmn-js view) keeps
    // appending to it instead of replacing the accumulated keys.
    const harvested = (harvestWindow.__harvested ??= new Set<string>());

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
                harvestWindow.__injector = injector;
            },
        ],
    };
    (recorder.__harvestHook[1] as unknown as { $inject: string[] }).$inject = ["injector"];
    return recorder;
}
