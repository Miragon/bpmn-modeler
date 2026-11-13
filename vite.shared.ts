import type { UserConfig } from "vite";

/**
 * JSX transform and module resolution for every bundle that ships the BPMN or DMN modeler.
 * A bundle spreads it into its config; one with resolve entries of its own spreads
 * `modelerBundlePreset.resolve` into them, or its `resolve` would replace the preset's.
 */
export const modelerBundlePreset = {
    oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
    resolve: {
        alias: [
            // A development build emits jsx-dev-runtime for libs/properties-panel TSX, but
            // @bpmn-io/properties-panel has no exports map to redirect it to its vendored
            // preact's jsx-runtime, which exports jsxDEV too.
            {
                find: "@bpmn-io/properties-panel/preact/jsx-dev-runtime",
                replacement: "@bpmn-io/properties-panel/preact/jsx-runtime",
            },
        ],
        // A second copy of any of these splits state that must be shared: preact's hooks,
        // moddle's types, CodeMirror's extensions.
        dedupe: [
            "preact",
            "inferno",
            "bpmn-js",
            "diagram-js",
            "bpmn-moddle",
            "moddle",
            "bpmn-js-create-append-anything",
            "@bpmn-io/properties-panel",
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lint",
            "@codemirror/search",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/lr",
        ],
    },
} satisfies UserConfig;
