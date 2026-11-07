/**
 * Loads bpmn-js plugins at runtime, in the format of Camunda Modeler plugins:
 * a script that pushes `{ type, plugin }` onto `window.plugins`. A separate
 * subpath, so a consumer without plugins never bundles the loader.
 *
 * ```ts
 * const { buildWithPluginsOrWithout, loadPlugins } = await import("@miragon/bpmn-modeler/plugins");
 * const plugins = await loadPlugins([{ name: "resize-tasks", scriptUrl }]);
 * const modeler = await buildWithPluginsOrWithout(
 *     plugins,
 *     engine,
 *     (modules) => createModeler(container, { engine, ...modules }),
 *     (error) => console.warn("opened without plugins", error),
 * );
 * ```
 *
 * Plugin code runs with the page's full authority. Load only what the user
 * or the integrator approved.
 */
export { buildWithPluginsOrWithout } from "./buildWithPlugins";
export { loadPlugins } from "./loadPlugins";
export type { LoadedPlugins, PluginLoadFailure, PluginSource } from "./loadPlugins";
export type {
    IgnoredRegistration,
    LoadedPlugin,
    PluginModules,
    PluginRegistration,
} from "./pluginRegistrations";
