import type { PluginCreator } from "postcss";

/** Strips the `[data-bpmn-theme="dark"]` scope so the legacy split sheet stays un-scoped. */
declare const stripThemeScope: PluginCreator<void>;
export default stripThemeScope;
