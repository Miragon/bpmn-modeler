import type { Plugin, UserConfig } from "vite";

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

/** A chunk of a build's output: its file and the chunks it imports. */
export interface BundleChunk {
    readonly fileName: string;
    readonly imports: readonly string[];
    readonly dynamicImports: readonly string[];
}

/** The files a dynamic import fetches at once: its chunk and the imported chunks not loaded yet. */
export interface ImportBurst {
    readonly chunk: string;
    readonly files: readonly string[];
}

/**
 * Every dynamic import reachable from `entry` with the files it fetches at
 * once, given that the entry and the chunks of the dynamic imports that led to
 * it have loaded. An import reached on several paths counts from the shortest
 * chain of dynamic imports.
 */
export function importBursts(chunks: readonly BundleChunk[], entry: string): ImportBurst[] {
    const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const closure = (fileName: string, into = new Set<string>()): Set<string> => {
        if (into.has(fileName)) return into;
        into.add(fileName);
        for (const imported of byFileName.get(fileName)?.imports ?? []) closure(imported, into);
        return into;
    };
    const bursts: ImportBurst[] = [];
    const reached = new Set<string>([entry]);
    const pending: Set<string>[] = [closure(entry)];
    for (let loaded = pending.shift(); loaded; loaded = pending.shift()) {
        for (const loadedChunk of loaded) {
            for (const target of byFileName.get(loadedChunk)?.dynamicImports ?? []) {
                if (reached.has(target)) continue;
                reached.add(target);
                const fetched = closure(target);
                const files = [...fetched].filter((file) => !loaded.has(file)).sort();
                if (files.length > 0) bursts.push({ chunk: target, files });
                pending.push(new Set([...loaded, ...fetched]));
            }
        }
    }
    return bursts;
}

/**
 * Fails the build when a dynamic import reachable from `entry` fetches more
 * than `maxFiles` files at once. VS Code's webview service worker runs at most
 * 32 resource loads at a time for all webviews of one view type, and the loads
 * of a webview closed mid-load keep their slots until its 30 s timeout: two
 * merge panes that fetch 16 files each fill it, and the next webview of the
 * type stays blank for those 30 s.
 */
export function webviewImportBudget(options: { entry: string; maxFiles: number }): Plugin {
    return {
        name: "webview-import-budget",
        apply: "build",
        generateBundle(_outputOptions, bundle) {
            const chunks = Object.values(bundle).flatMap((output) =>
                output.type === "chunk" ? [output] : [],
            );
            const over = importBursts(chunks, options.entry).filter(
                (burst) => burst.files.length > options.maxFiles,
            );
            if (over.length === 0) return;
            const listed = over
                .map(
                    (burst) =>
                        `${burst.chunk} fetches ${burst.files.length} files at once (${burst.files.join(", ")})`,
                )
                .join("; ");
            this.error(
                `${listed}. A webview's dynamic import may fetch at most ${options.maxFiles}: VS Code runs at most ` +
                    `32 resource loads at a time for all webviews of one view type, and a webview closed mid-load ` +
                    `holds its loads' slots for 30 s. Put small chunks into a group of the bundle's output.codeSplitting.`,
            );
        },
    };
}
