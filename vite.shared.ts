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

const VS_CODE_LOADS_PER_VIEW_TYPE = 32;
// A merge view's two panes and an editor.
const WEBVIEWS_LOADING_AT_ONCE = 3;

/** The most files a webview may fetch at once, so that the webviews loading at once fit in VS Code's slots. */
export const WEBVIEW_FILES_AT_ONCE = Math.floor(
    VS_CODE_LOADS_PER_VIEW_TYPE / WEBVIEWS_LOADING_AT_ONCE,
);

/** A chunk of a build's output: its file and the chunks it imports. */
export interface BundleChunk {
    readonly fileName: string;
    readonly imports: readonly string[];
    readonly dynamicImports: readonly string[];
}

/** The files a load fetches at once: its chunk and the imported chunks not loaded yet. */
export interface ImportBurst {
    readonly chunk: string;
    readonly files: readonly string[];
}

/**
 * The page's first load, the entry with the chunks it imports, then every
 * dynamic import reachable from it with the files it fetches at once. An
 * import that several chains of dynamic imports reach counts from the chain
 * that loaded the least of it.
 */
export function importBursts(chunks: readonly BundleChunk[], entry: string): ImportBurst[] {
    const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const closure = (fileName: string, into = new Set<string>()): Set<string> => {
        if (into.has(fileName)) return into;
        into.add(fileName);
        for (const imported of byFileName.get(fileName)?.imports ?? []) closure(imported, into);
        return into;
    };
    const firstLoad = closure(entry);
    const largest = new Map<string, readonly string[]>([[entry, [...firstLoad].sort()]]);
    // A chunk loaded earlier on the chain had its dynamic imports followed with less loaded.
    const follow = (loaded: ReadonlySet<string>, importers: Iterable<string>): void => {
        for (const importer of importers) {
            for (const target of byFileName.get(importer)?.dynamicImports ?? []) {
                if (loaded.has(target)) continue;
                const files = [...closure(target)].filter((file) => !loaded.has(file)).sort();
                if (files.length > (largest.get(target)?.length ?? 0)) largest.set(target, files);
                follow(new Set([...loaded, ...files]), files);
            }
        }
    };
    follow(firstLoad, firstLoad);
    return [...largest].map(([chunk, files]) => ({ chunk, files }));
}

/**
 * Fails the build when the page's first load or a dynamic import reachable
 * from `entry` fetches more than `WEBVIEW_FILES_AT_ONCE` files at once. VS
 * Code's webview service worker runs at most `VS_CODE_LOADS_PER_VIEW_TYPE`
 * resource loads at a time for all webviews of one view type, and the loads of
 * a webview closed mid-load keep their slots until its 30 s timeout: two merge
 * panes that fetch 16 files each fill it, and the next webview of the type
 * stays blank for those 30 s.
 */
export function webviewImportBudget(options: { entry: string }): Plugin {
    return {
        name: "webview-import-budget",
        apply: "build",
        generateBundle(_outputOptions, bundle) {
            const chunks = Object.values(bundle).flatMap((output) =>
                output.type === "chunk" ? [output] : [],
            );
            const over = importBursts(chunks, options.entry).filter(
                (burst) => burst.files.length > WEBVIEW_FILES_AT_ONCE,
            );
            if (over.length === 0) return;
            const listed = over
                .map(
                    (burst) =>
                        `${burst.chunk} fetches ${burst.files.length} files at once (${burst.files.join(", ")})`,
                )
                .join("; ");
            this.error(
                `${listed}. A webview may fetch at most ${WEBVIEW_FILES_AT_ONCE} files at once: VS Code runs at most ` +
                    `${VS_CODE_LOADS_PER_VIEW_TYPE} resource loads at a time for all webviews of one view type, and a ` +
                    `webview closed mid-load holds its loads' slots for 30 s. Put small chunks into a group of the ` +
                    `bundle's output.codeSplitting.`,
            );
        },
    };
}

/** A chunk of a build's output: its file and how much code it renders of each module. */
export interface RenderedChunk {
    readonly fileName: string;
    readonly modules: Readonly<Record<string, { readonly renderedLength: number }>>;
}

/** A fixture module a chunk renders code of. */
export interface BundledFixture {
    readonly chunk: string;
    readonly fixture: string;
}

const UNDER_A_FIXTURES_FOLDER = /[\\/]__fixtures__[\\/]/;

/** The modules under a `__fixtures__` folder whose code the chunks render. */
export function bundledFixtures(chunks: readonly RenderedChunk[]): BundledFixture[] {
    return chunks.flatMap((chunk) =>
        Object.entries(chunk.modules)
            .filter(
                ([id, { renderedLength }]) =>
                    renderedLength > 0 && UNDER_A_FIXTURES_FOLDER.test(id),
            )
            .map(([fixture]) => ({ chunk: chunk.fileName, fixture })),
    );
}

/**
 * Fails a production build that renders code of a `__fixtures__` module. The
 * preview host is dead-code-eliminated, but a fixture's module-level value
 * that Rollup cannot prove free of side effects stays in the bundle.
 */
export function noFixturesInProductionBundle(): Plugin {
    let isProduction = false;
    return {
        name: "no-fixtures-in-production-bundle",
        apply: "build",
        configResolved(config) {
            isProduction = config.isProduction;
        },
        generateBundle(_outputOptions, bundle) {
            if (!isProduction) return;
            const chunks = Object.values(bundle).flatMap((output) =>
                output.type === "chunk" ? [output] : [],
            );
            const bundled = bundledFixtures(chunks);
            if (bundled.length === 0) return;
            const listed = bundled
                .map(({ chunk, fixture }) => `${chunk} renders ${fixture}`)
                .join("; ");
            this.error(
                `${listed}. Fixtures serve specs and the browser preview only: build a fixture's ` +
                    `values inside a function rather than at module level, so tree-shaking drops them.`,
            );
        },
    };
}
