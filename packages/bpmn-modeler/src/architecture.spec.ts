import {
    buildImportGraph,
    readModuleImports,
    readSourceTree,
    requireMatches,
    stripComments,
} from "@miragon/architecture-testing";
import type { SourceFile } from "@miragon/architecture-testing";
import { join, normalize } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/**
 * Import-direction gate for `@miragon/bpmn-modeler`.
 *
 * The published package may reach only *downward* — relatives, the private
 * workspace libs it inlines at build time, and bare npm specifiers. It must
 * never name the private webview↔host protocol (`@miragon/bpmn-modeler-shared`),
 * the extension engine (`@miragon/bpmn-modeler-core`), or anything under
 * `apps/`. Conversely, no `libs/*` may depend on the package (that would invert
 * the layering `packages → libs`, not `libs → packages`).
 */
const PKG_SRC = __dirname;
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const LIBS_ROOT = join(REPO_ROOT, "libs");

const packageSources = readSourceTree(PKG_SRC);
const libSources = readSourceTree(LIBS_ROOT);

function importedModules({ path, text }: SourceFile): string[] {
    return readModuleImports(path, text).map(({ specifier }) => specifier);
}

// Value imports only — `import type` / `export type` are erased at build and so
// never pull runtime code into a bundle.
function valueImportedModules({ path, text }: SourceFile): string[] {
    return readModuleImports(path, text)
        .filter(({ typeOnly }) => !typeOnly)
        .map(({ specifier }) => specifier);
}

function sourcesIn(folder: string): SourceFile[] {
    return requireMatches(
        `${folder}/ sources`,
        packageSources.filter(({ path }) => path.startsWith(`${folder}/`)),
    );
}

function stylesheetsIn(root: string): SourceFile[] {
    return requireMatches(`stylesheets in ${root}`, readSourceTree(root, { extensions: [".css"] }));
}

function cssImportSpecifier(importParams: string): string {
    return /^(?:url\(\s*)?["']?([^"')\s]+)/.exec(importParams.trim())?.[1] ?? importParams;
}

/** `@miragon/bpmn-modeler` exactly, or a subpath of it — but not `-types`/`-core`/… */
const PACKAGE_SELF = /^@miragon\/bpmn-modeler(\/|$)/;

describe("bpmn-modeler import direction", () => {
    it("collects .tsx sources — the #1486 blind spot must stay closed", () => {
        const collected = readSourceTree(join(LIBS_ROOT, "properties-panel", "src"));
        expect(collected.some(({ path }) => path.endsWith(".tsx"))).toBe(true);
    });

    it("package source never names the protocol, the engine, or apps/", () => {
        const offenders: string[] = [];
        for (const file of packageSources) {
            for (const spec of importedModules(file)) {
                const forbidden =
                    spec === "@miragon/bpmn-modeler-shared" ||
                    spec === "@miragon/bpmn-modeler-core" ||
                    spec.startsWith("@miragon/bpmn-modeler-core/") ||
                    /(^|\/)apps\//.test(spec);
                if (forbidden) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `@miragon/bpmn-modeler must not import the private protocol, the ` +
                `engine core, or app code:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("package TS source reads no VS Code `<body>` theme classes", () => {
        // Theme is host policy: the package resolves light/dark from
        // `prefers-color-scheme` or an injected mode, never by reading the host's
        // chrome. A `vscode-*` body class in TS source would mean the watcher
        // leaked back in. (CSS files legitimately style `body.vscode-dark`; this
        // gate is TS-only.)
        const VSCODE_CLASS = /vscode-(dark|light|high-contrast)/;
        const offenders = packageSources
            .filter(({ text }) => VSCODE_CLASS.test(text))
            .map(({ path }) => path);
        expect(
            offenders,
            `package TS source must not read VS Code body theme classes:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("every top-level dark-theme selector is scoped under data-bpmn-theme", () => {
        // The dark sheet is authored scoped so per-instance theming never leaks
        // across instances (and the legacy split is derived by stripping the
        // scope). A top-level rule that forgot the attribute would paint every
        // instance dark. Nested rules are exempt — their parent carries the scope.
        const offenders: string[] = [];
        for (const { path, text } of stylesheetsIn(join(PKG_SRC, "styles", "dark-theme"))) {
            postcss.parse(text).walkRules((rule) => {
                if (rule.parent?.type !== "root") return; // nested rule: parent scopes it
                if (!rule.selector.includes("data-bpmn-theme")) {
                    offenders.push(`${path}: ${rule.selector}`);
                }
            });
        }
        expect(
            offenders,
            `every top-level dark-theme rule must be scoped under ` +
                `[data-bpmn-theme="dark"]:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("plugin CSS comes from its own package, never another package's prebuilt copy", () => {
        // bpmn-js ships diagram-js CSS frozen at its own build, which drifts from the
        // version we pin.
        const isPrebuiltCopy = (spec: string): boolean =>
            spec === "bpmn-js/dist/assets/diagram-js.css";
        const offenders: string[] = [];
        const collectOffender = (path: string, spec: string): void => {
            if (isPrebuiltCopy(spec)) offenders.push(`${path} → ${spec}`);
        };
        for (const { path, text } of stylesheetsIn(PKG_SRC)) {
            postcss.parse(text).walkAtRules("import", (rule) => {
                collectOffender(path, cssImportSpecifier(rule.params));
            });
        }
        for (const file of packageSources) {
            for (const spec of importedModules(file)) {
                collectOffender(file.path, spec);
            }
        }
        expect(offenders, offenders.join("\n")).toEqual([]);
    });

    it("only src/bpmnlint/ value-imports the lint stack (#1407)", () => {
        // The lint stack is injection-only: a host imports `@miragon/bpmn-modeler/lint`
        // (which resolves to `src/bpmnlint/index.ts`) and hands the module in. No
        // other package source may pull it into the runtime graph — a reachable
        // value import (static or dynamic) is exactly what a single-file bundler
        // inlines even under `linting: false`. `import type` stays fine.
        const LINT_STACK = (spec: string): boolean =>
            spec === "bpmnlint" || spec === "bpmn-js-bpmnlint" || /(^|\/)bpmnlint$/.test(spec); // the `./bpmnlint` barrel, not its type subpaths
        sourcesIn("bpmnlint");
        const offenders: string[] = [];
        for (const file of packageSources.filter(({ path }) => !path.startsWith("bpmnlint/"))) {
            for (const spec of valueImportedModules(file)) {
                if (LINT_STACK(spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the lint stack is injection-only — only src/bpmnlint/ may value-import ` +
                `it (use \`import type\` elsewhere):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the design subpath value-imports only the engine-neutral set (#1196)", () => {
        // The `/design` subpath must stay free of the Camunda engine stack at the
        // module-graph level. Unlike `/viewer` it legitimately ships the
        // engine-neutral properties panel and append/create menu, so those (plus
        // preact via the panel) are allowed — but a value import of the Camunda
        // moddles or behaviors, element templates, transaction boundaries, or the lint
        // stack here is exactly what a single-file bundler
        // would inline into a design-only consumer. `import type` stays fine. The
        // runtime graph is gated separately by `check-design-pure-entry.mjs`.
        const isAllowed = (spec: string): boolean =>
            spec.startsWith(".") ||
            spec === "bpmn-js" ||
            spec.startsWith("bpmn-js/") ||
            spec === "diagram-js" ||
            spec.startsWith("diagram-js/") ||
            spec === "@miragon/bpmn-modeler-properties-panel" ||
            spec === "bpmn-js-create-append-anything" ||
            spec === "diagram-js-minimap" ||
            // Engine-neutral canvas chrome shared by every surface:
            // plain bpmn-js simulation, no Camunda stack behind it.
            spec === "bpmn-js-token-simulation" ||
            // Engine-neutral browser clipboard, as the C7/C8 stacks load it.
            // Plain bpmn-js extension, no Camunda stack; the bridge module
            // overrides its `nativeCopyPaste` service in sandboxed hosts.
            spec === "bpmn-js-native-copy-paste" ||
            spec === "@miragon/bpmn-modeler-types" ||
            spec === "@miragon/bpmn-modeler-i18n" ||
            spec === "@miragon/bpmn-modeler-i18n-extras" ||
            spec === "@miragon/bpmn-modeler-append-menu" ||
            spec === "@miragon/bpmn-modeler-flow-navigation" ||
            spec === "@miragon/bpmn-modeler-clipboard" ||
            // Engine-neutral navigation capability (#1444): designer.ts value-imports
            // createModelNavigationModule. The lib's only bare runtime import is
            // bpmn-js/lib/util/ModelUtil, so it drags in no Camunda stack.
            spec === "@miragon/bpmn-model-navigation" ||
            // Engine-neutral definition search: designer.ts value-imports
            // createDefinitionSearchModule; its runtime imports are bpmn-js utils
            // and the panel's own preact.
            spec === "@miragon/bpmn-modeler-definition-search" ||
            // Engine-neutral formatting/cleanup (#1477): designer.ts value-imports
            // createBpmnLayoutModule. Layout is pure geometry — the lib's runtime
            // imports are bpmn-auto-layout and bpmn-moddle, neither of which
            // carries a Camunda stack.
            spec === "@miragon/bpmn-modeler-layout";
        const offenders: string[] = [];
        for (const file of sourcesIn("design")) {
            for (const spec of valueImportedModules(file)) {
                if (!isAllowed(spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the design subpath must stay engine-neutral — value-import only ` +
                `bpmn-js/*, diagram-js/*, the neutral panel/menu packages, or the ` +
                `neutral @miragon libs (use \`import type\` for anything else):\n` +
                `${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the /viewer subpath deep-imports the neutral panel, never its barrel (#1443)", () => {
        // The lib barrel (`libs/properties-panel/src/index.ts`) side-effect
        // imports its CSS, and the viewer entry must import no CSS —
        // `cssCodeSplit: false` on the lib build would fold any reachable sheet
        // into the shared `dist/bpmn-modeler.css`. The panel sheets ship via
        // `dist/viewer.css` instead; deep (file-level) imports stay fine.
        const BARREL = "@miragon/bpmn-modeler-properties-panel";
        const offenders: string[] = [];
        for (const file of sourcesIn("viewer")) {
            for (const spec of valueImportedModules(file)) {
                if (spec === BARREL) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the /viewer subpath must deep-import ` +
                `@miragon/bpmn-modeler-properties-panel/* (the barrel imports ` +
                `CSS, and the viewer entry must stay CSS-free):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the append menu deep-imports the template chooser, never its barrel (#1505)", () => {
        // The chooser barrel value-imports the DI module — and with it
        // minisearch and the chooser CSS. The append menu is reachable from the
        // engine-neutral /design entry, so its value imports must target
        // chooser subpaths; only tree-shaking luck kept minisearch out of the
        // design graph before `check-design-pure-entry.mjs` caught it.
        const appendMenuSources = requireMatches(
            "libs/append-menu/src sources",
            readSourceTree(join(LIBS_ROOT, "append-menu", "src")),
        );
        const BARREL = "@miragon/bpmn-modeler-element-template-chooser";
        const offenders: string[] = [];
        for (const file of appendMenuSources) {
            for (const spec of valueImportedModules(file)) {
                if (spec === BARREL) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the append menu must deep-import ` +
                `@miragon/bpmn-modeler-element-template-chooser/* (the barrel ` +
                `pulls the DI module, minisearch, and CSS into the design ` +
                `graph):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the /design and /viewer subpaths never reach the runtime-mode code (#1442)", () => {
        // Design/implement mode is a runtime toggle on the engine-tagged
        // `createModeler` instance only. The `/design` and `/viewer` subpaths are
        // separate, mode-less surfaces (their own factories), so keeping this code
        // out of their closure by intent stops the mode wiring from leaking into
        // the engine-neutral bundles. `check-design-pure-entry.mjs` backs the
        // design side at the built-graph level; this is the source-level intent.
        const MODE_FILES = ["mode.ts", "modeModules.ts"];
        const MODE_LESS_SURFACES = ["design", "viewer", "modeSession"];
        const graph = buildImportGraph(packageSources);
        requireMatches(
            "mode files",
            graph.files.filter((file) => MODE_FILES.includes(file)),
        );
        MODE_LESS_SURFACES.forEach(sourcesIn);
        const offenders = graph.edges
            .filter(
                ({ from, to }) =>
                    from.split("/").some((segment) => MODE_LESS_SURFACES.includes(segment)) &&
                    to !== undefined &&
                    MODE_FILES.includes(to),
            )
            .map(({ from, specifier }) => `${from} → ${specifier}`);
        expect(
            offenders,
            `the /design, /viewer and /mode subpaths must not import ./mode or ` +
                `./modeModules (runtime mode is a createModeler-only concern):\n` +
                `${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the mode-session subpath value-imports only the injectable set (#1447)", () => {
        // `@miragon/bpmn-modeler/mode` orchestrates the surfaces the consumer
        // injects, so its own graph must stay free of bpmn-js / Camunda code: a
        // value import here is exactly what a single-file bundler would inline
        // into a mode-only consumer. Only relatives *within* the modeSession dir
        // (never `../` up into the surface handles), the pure mode model
        // (`-types`), and i18n are value-importable; the handle types from
        // `../publicApi` / `../viewer` / `../design` must stay `import type`. The
        // built graph is gated separately by `check-mode-pure-entry.mjs`.
        const isAllowed = (spec: string): boolean =>
            spec.startsWith("./") ||
            spec === "@miragon/bpmn-modeler-types" ||
            spec === "@miragon/bpmn-modeler-i18n" ||
            spec === "@miragon/bpmn-modeler-i18n-extras";
        const offenders: string[] = [];
        for (const file of sourcesIn("modeSession")) {
            for (const spec of valueImportedModules(file)) {
                if (!isAllowed(spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the mode subpath must value-import only ./* (within modeSession), the ` +
                `mode model (@miragon/bpmn-modeler-types), or i18n — use \`import type\` ` +
                `for the surface handles (../publicApi, ../viewer, ../design):\n` +
                `${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("private upstream state is reached only through the typed adapters (#1501)", () => {
        // Every access to an upstream package's private `_`-prefixed state must go
        // through a typed adapter that asserts the runtime shape (WP1), so a
        // dependency bump fails loudly against a pinned shape test rather than
        // silently no-op'ing. Only those adapter modules may name the private
        // members. The vendored properties-panel fork is out of scope — it uses
        // `this._x` on its own ported classes pervasively — except our own
        // `modeFilter/` code.
        const ADAPTER_FILES = [
            "libs/bpmn-clipboard/src/directEditingInternals.ts",
            "libs/bpmn-diff/src/differResult.ts",
            "libs/append-menu/src/popupMenuInternals.ts",
            "packages/bpmn-modeler/src/bpmnlint/lintingInternals.ts",
        ];
        const repoSources = [
            ...packageSources.map((file) => ({
                ...file,
                path: `packages/bpmn-modeler/src/${file.path}`,
            })),
            ...libSources.map((file) => ({ ...file, path: `libs/${file.path}` })),
        ];
        for (const adapter of ADAPTER_FILES) {
            requireMatches(
                `private-state adapter ${adapter}`,
                repoSources.filter(({ path }) => path === adapter),
            );
        }
        const inScope = ({ path }: SourceFile): boolean => {
            if (ADAPTER_FILES.includes(path)) return false;
            if (
                path.includes("properties-panel/src/") &&
                !path.includes("properties-panel/src/modeFilter/")
            ) {
                return false;
            }
            return true;
        };
        // Dotted/optional-chained underscore access on anything but `this`.
        const DOTTED_PRIVATE = /(?<!\bthis)(?:\?\.|\.)\s*_[A-Za-z]/;
        // Bracket/quoted access to the specific known-private names (regression guard).
        const QUOTED_PRIVATE =
            /["'](_textbox|_getContext|_added|_removed|_changed|_layoutChanged)["']/;
        const offenders: string[] = [];
        for (const file of repoSources.filter(inScope)) {
            const code = stripComments(file.path, file.text);
            if (DOTTED_PRIVATE.test(code) || QUOTED_PRIVATE.test(code)) {
                offenders.push(file.path);
            }
        }
        expect(
            offenders,
            `private upstream state must be reached only through the typed ` +
                `adapters (directEditingInternals / differResult / ` +
                `popupMenuInternals / lintingInternals):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no libs/* source imports @miragon/bpmn-modeler", () => {
        const offenders: string[] = [];
        for (const file of libSources) {
            for (const spec of importedModules(file)) {
                if (PACKAGE_SELF.test(spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `libs/* must not depend on the package (layering is packages → libs, ` +
                `never the reverse):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});

describe("bpmn-modeler warning sink", () => {
    it("only reporting.ts writes console.warn, so every facade warning reaches onWarning", () => {
        const offenders = packageSources
            .filter(({ path }) => path !== "reporting.ts")
            .filter(({ path, text }) => /\bconsole\.warn\s*\(/.test(stripComments(path, text)))
            .map(({ path }) => path);
        expect(
            offenders,
            `warn through the surface reporter (createReporter), not console.warn:\n` +
                offenders.join("\n"),
        ).toEqual([]);
    });
});
