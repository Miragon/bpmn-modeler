import {
    buildImportGraph,
    exceptionsWithoutIssue,
    impureDomainImports,
    readModuleImports,
    readModulePurity,
    readSourceTree,
    readWorkspaces,
    requireMatches,
    staleExceptions,
    stripComments,
    unexcusedViolations,
    workspaceOfSpecifier,
} from "@miragon/architecture-testing";
import type {
    ImportGraph,
    KnownException,
    ModulePurity,
    SourceFile,
    Violation,
    Workspace,
} from "@miragon/architecture-testing";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import DiagramCore from "diagram-js/lib/core";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, posix, resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import {
    DEBOUNCE_INPUT,
    DIAGRAM_TEMPLATE,
    SURFACE_MODE_SERVICE,
    SURFACE_ROOTS,
} from "./kernel/domain/kernelNames";

/**
 * Import-direction gate for `@miragon/bpmn-modeler`.
 *
 * The published package may reach only *downward* — relatives, the private
 * workspace libs it inlines at build time, and bare npm specifiers. It must
 * never name the private webview↔host protocol (`@miragon/bpmn-modeler-shared`),
 * the extension engine (`@miragon/bpmn-modeler-core`), or anything under
 * `apps/`. Conversely, no `libs/*` may depend on the package (that would invert
 * the layering `packages → libs`, not `libs → packages`).
 *
 * The shared role-folder rules come from the repo-level spec; this one adds
 * that `domain/` imports only pure modules (docs/adr/role-folders.md#domain-imports).
 * The subpath gates read a surface as its folders, its entry and its preset in
 * `composition/`.
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

interface Subpath {
    readonly folders: readonly string[];
    /** The entry and the preset, which sit outside the folders. */
    readonly files: readonly string[];
}

const DESIGN_SUBPATH: Subpath = {
    folders: ["design"],
    files: ["design.ts", "composition/createDesigner.ts"],
};
const VIEWER_SUBPATH: Subpath = {
    folders: ["viewer", "diff"],
    files: ["viewer.ts", "composition/createViewer.ts"],
};
const MODE_SESSION_SUBPATH: Subpath = { folders: ["modeSession"], files: ["mode.ts"] };

function inSubpath({ folders, files }: Subpath, path: string): boolean {
    return files.includes(path) || folders.some((folder) => path.startsWith(`${folder}/`));
}

function sourcesOf(subpath: Subpath): SourceFile[] {
    subpath.folders.forEach(sourcesIn);
    const sources = packageSources.filter(({ path }) => inSubpath(subpath, path));
    for (const file of subpath.files) {
        requireMatches(
            file,
            sources.filter(({ path }) => path === file),
        );
    }
    return sources;
}

function resolvesInto(folder: string, { path }: SourceFile, specifier: string): boolean {
    return (
        specifier.startsWith(".") &&
        posix.normalize(posix.join(posix.dirname(path), specifier)).startsWith(`${folder}/`)
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

// The first rule to read a tree parses it: seconds for libs/ under coverage on CI.
const TREE_PARSE = { timeout: 30_000 };

describe("bpmn-modeler import direction", TREE_PARSE, () => {
    it("keeps shared navigation JavaScript CSS-free for viewer and designer consumers", () => {
        const navigation = join(LIBS_ROOT, "model-navigation", "src");
        const offenders = readSourceTree(navigation).flatMap((file) =>
            valueImportedModules(file)
                .filter((specifier) => /\.(css|less|scss|sass)(\?|$)/.test(specifier))
                .map((specifier) => `${file.path} → ${specifier}`),
        );
        expect(offenders).toEqual([]);
    });

    it.each(["engineModeler", "design", "viewer"])(
        "ships navigation controls through the %s stylesheet",
        (surface) => {
            const file = join(PKG_SRC, "styles", `${surface}.css`);
            const imports: string[] = [];
            postcss.parse(readFileSync(file, "utf8")).walkAtRules("import", (rule) => {
                imports.push(resolve(dirname(file), cssImportSpecifier(rule.params)));
            });
            expect(imports).toContain(join(LIBS_ROOT, "model-navigation", "src", "style.css"));
        },
    );

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

    it("only src/bpmnlint/ and the /lint entry value-import the lint stack (#1407)", () => {
        // The lint stack is injection-only: a host imports `@miragon/bpmn-modeler/lint`
        // (which resolves to `src/lint.ts`) and hands the module in. No
        // other package source may pull it into the runtime graph — a reachable
        // value import (static or dynamic) is exactly what a single-file bundler
        // inlines even under `linting: false`. `import type` stays fine.
        const LINT_STACK = (spec: string): boolean =>
            spec === "bpmnlint" ||
            spec === "bpmn-js-bpmnlint" ||
            /^\.{1,2}\/(\.\.\/)*lint$/.test(spec); // the `/lint` entry
        const LINT_SUBPATH: Subpath = { folders: ["bpmnlint"], files: ["lint.ts"] };
        sourcesOf(LINT_SUBPATH);
        const offenders: string[] = [];
        for (const file of packageSources.filter(({ path }) => !inSubpath(LINT_SUBPATH, path))) {
            for (const spec of valueImportedModules(file)) {
                if (LINT_STACK(spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the lint stack is injection-only — only src/bpmnlint/ and src/lint.ts may value-import ` +
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
            spec === "@miragon/bpmn-modeler-layout" ||
            // Engine-neutral IDs from names: designer.ts value-imports
            // ElementIdsModule; its runtime imports are preact, the panel's own
            // preact and @miragon/bpmn-modeler-types.
            spec === "@miragon/bpmn-modeler-element-ids";
        const offenders: string[] = [];
        for (const file of sourcesOf(DESIGN_SUBPATH)) {
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
        for (const file of sourcesOf(VIEWER_SUBPATH)) {
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
        const MODE_FOLDER = "mode";
        const MODE_LESS_SURFACES = [DESIGN_SUBPATH, VIEWER_SUBPATH, MODE_SESSION_SUBPATH];
        const graph = buildImportGraph(packageSources);
        sourcesIn(MODE_FOLDER);
        MODE_LESS_SURFACES.forEach(sourcesOf);
        const offenders = graph.edges
            .filter(
                ({ from, to }) =>
                    MODE_LESS_SURFACES.some((surface) => inSubpath(surface, from)) &&
                    to !== undefined &&
                    to.startsWith(`${MODE_FOLDER}/`),
            )
            .map(({ from, specifier }) => `${from} → ${specifier}`);
        expect(
            offenders,
            `the /design, /viewer and /mode subpaths must not import mode/ ` +
                `(runtime mode is a createModeler-only concern):\n` +
                `${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the mode-session subpath value-imports only the injectable set (#1447)", () => {
        // `@miragon/bpmn-modeler/mode` orchestrates the surfaces the consumer
        // injects, so its own graph must stay free of bpmn-js / Camunda code: a
        // value import here is exactly what a single-file bundler would inline
        // into a mode-only consumer. Only relatives *within* the modeSession dir
        // (never up into the surface handles), the pure mode model
        // (`-types`), and i18n are value-importable; the handle types from
        // the modeler, viewer and design ports must stay `import type`. The
        // built graph is gated separately by `check-mode-pure-entry.mjs`.
        const isAllowed = (file: SourceFile, spec: string): boolean =>
            resolvesInto("modeSession", file, spec) ||
            spec === "@miragon/bpmn-modeler-types" ||
            spec === "@miragon/bpmn-modeler-types/domain" ||
            spec === "@miragon/bpmn-modeler-i18n" ||
            spec === "@miragon/bpmn-modeler-i18n-extras";
        const offenders: string[] = [];
        for (const file of sourcesOf(MODE_SESSION_SUBPATH)) {
            for (const spec of valueImportedModules(file)) {
                if (!isAllowed(file, spec)) {
                    offenders.push(`${file.path} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the mode subpath must value-import only modeSession/, the ` +
                `mode model (@miragon/bpmn-modeler-types), or i18n — use \`import type\` ` +
                `for the surface handles (the modeler, viewer and design ports):\n` +
                `${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("private upstream state is reached only through the typed adapters (#1501)", () => {
        // Every access to an upstream package's private `_`-prefixed state must go
        // through a typed adapter that asserts the runtime shape (WP1), so a
        // dependency bump fails loudly against a pinned shape test rather than
        // silently no-op'ing. Only those adapter modules may name the private
        // members, and they sit in an `upstreamInternals/` folder. The vendored
        // properties-panel fork is out of scope — it uses `this._x` on its own
        // ported classes pervasively — except our own `modeFilter/` code.
        const ADAPTER_FOLDER = "upstreamInternals";
        const isAdapter = ({ path }: SourceFile): boolean =>
            path.split("/").includes(ADAPTER_FOLDER);
        const repoSources = [
            ...packageSources.map((file) => ({
                ...file,
                path: `packages/bpmn-modeler/src/${file.path}`,
            })),
            ...libSources.map((file) => ({ ...file, path: `libs/${file.path}` })),
        ];
        requireMatches("private-state adapters", repoSources.filter(isAdapter));
        const inScope = (file: SourceFile): boolean => {
            const { path } = file;
            if (isAdapter(file)) return false;
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
                `adapters in an ${ADAPTER_FOLDER}/ folder:\n${offenders.join("\n")}`,
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

describe("bpmn-modeler warning sink", TREE_PARSE, () => {
    it("only the surface reporter writes console.warn, so every facade warning reaches onWarning", () => {
        const REPORTER = "kernel/service/reporting.ts";
        requireMatches(
            REPORTER,
            packageSources.filter(({ path }) => path === REPORTER),
        );
        const offenders = packageSources
            .filter(({ path }) => path !== REPORTER)
            .filter(({ path, text }) => /\bconsole\.warn\s*\(/.test(stripComments(path, text)))
            .map(({ path }) => path);
        expect(
            offenders,
            `warn through the surface reporter (createReporter), not console.warn:\n` +
                offenders.join("\n"),
        ).toEqual([]);
    });
});

/** Keyed by file and specifier; each names the change that removes it. */
const DOMAIN_IMPORT_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "bpmnlint/domain/lintTierMachine.ts",
        to: "@miragon/bpmnlint-plugin-rules",
        until: "#2249 step 2: lintTierMachine takes the default lint config as a value",
    },
];

function impureDomainImportViolations(isPureModule: ModulePurity) {
    return (graph: ImportGraph): Violation[] =>
        impureDomainImports(graph, isPureModule).map(({ from, specifier }) => ({
            from,
            to: specifier,
        }));
}

function describeViolation({ from, to }: Violation): string {
    return `${from} -> ${to}`;
}

describe("bpmn-modeler domain imports", TREE_PARSE, () => {
    const SYNTHETIC_PURE_MODULES: readonly string[] = ["@miragon/bpmn-modeler-types/domain"];
    const syntheticViolations = (text: string): string[] =>
        impureDomainImportViolations((specifier) => SYNTHETIC_PURE_MODULES.includes(specifier))(
            buildImportGraph([{ path: "bpmnlint/domain/x.ts", text }]),
        ).map(describeViolation);

    it("pass a domain file that imports a pure module", () => {
        expect(
            syntheticViolations(
                'import type { Engine } from "@miragon/bpmn-modeler-types/domain";',
            ),
        ).toEqual([]);
    });

    it.each([
        {
            name: "an npm package, even type-only",
            text: 'import type Canvas from "diagram-js/lib/core/Canvas";',
            violation: "bpmnlint/domain/x.ts -> diagram-js/lib/core/Canvas",
        },
        {
            name: "the root entry of the types library, which is not pure",
            text: 'import { asyncDebounce } from "@miragon/bpmn-modeler-types";',
            violation: "bpmnlint/domain/x.ts -> @miragon/bpmn-modeler-types",
        },
    ])("flag a domain file that imports $name", ({ text, violation }) => {
        expect(syntheticViolations(text)).toEqual([violation]);
    });

    const violations = impureDomainImportViolations(readModulePurity(REPO_ROOT))(
        buildImportGraph(packageSources),
    );

    it("domain/ imports no package but a pure module", () => {
        expect(
            unexcusedViolations(violations, DOMAIN_IMPORT_EXCEPTIONS).map(describeViolation),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        expect(staleExceptions(violations, DOMAIN_IMPORT_EXCEPTIONS)).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(DOMAIN_IMPORT_EXCEPTIONS)).toEqual([]);
    });
});

const KERNEL = "kernel/";

/**
 * The workspace libraries the kernel may import besides npm: the shared types
 * and the browser helpers its focus, fit, theme and viewport code run on. Any
 * other workspace (a feature library, the core, this package) is outside.
 */
const KERNEL_LIBRARIES: readonly string[] = [
    "@miragon/bpmn-modeler-types",
    "@miragon/bpmn-modeler-browser",
];

/** Keyed by file and specifier; each names the step that removes it. */
const KERNEL_IMPORT_EXCEPTIONS: readonly KnownException[] = [];

function kernelImportViolations(workspaces: readonly Workspace[]) {
    return ({ edges }: ImportGraph): Violation[] =>
        edges
            .filter(({ from }) => from.startsWith(KERNEL))
            .flatMap(({ from, specifier, to }): Violation[] => {
                if (to !== undefined) {
                    return to.startsWith(KERNEL) ? [] : [{ from, to }];
                }
                const workspace = workspaceOfSpecifier(specifier, workspaces);
                return workspace && !KERNEL_LIBRARIES.includes(workspace.name)
                    ? [{ from, to: specifier }]
                    : [];
            });
}

describe("bpmn-modeler kernel imports", TREE_PARSE, () => {
    const SYNTHETIC_WORKSPACES: readonly Workspace[] = [
        { name: "@miragon/bpmn-modeler", dir: "packages/bpmn-modeler" },
        { name: "@miragon/bpmn-modeler-types", dir: "libs/modeler-types" },
        { name: "@miragon/bpmn-modeler-browser", dir: "libs/modeler-browser" },
        { name: "@miragon/bpmn-modeler-layout", dir: "libs/bpmn-layout" },
        { name: "@miragon/bpmn-modeler-diff", dir: "libs/bpmn-diff" },
    ];
    // One level deep, so the vitest-target check reads these specifiers as inside the package.
    const syntheticViolations = (text: string): string[] =>
        kernelImportViolations(SYNTHETIC_WORKSPACES)(
            buildImportGraph([
                { path: "kernel/x.ts", text },
                { path: "kernel/y.ts", text: "" },
                { path: "modeler/publicApi.ts", text: "" },
                { path: "composition/z.ts", text: "" },
            ]),
        ).map(describeViolation);

    it.each([
        { name: "a kernel file", text: 'import type { Y } from "./y";' },
        {
            name: "the shared types, by a subpath",
            text: 'import type { Engine } from "@miragon/bpmn-modeler-types/domain";',
        },
        {
            name: "the browser helpers",
            text: 'import { ThemeController } from "@miragon/bpmn-modeler-browser";',
        },
        { name: "an npm package", text: 'import type Canvas from "diagram-js/lib/core/Canvas";' },
    ])("pass a kernel file that imports $name", ({ text }) => {
        expect(syntheticViolations(text)).toEqual([]);
    });

    it.each([
        {
            name: "a port outside the kernel, even type-only",
            text: 'import type { X } from "../modeler/publicApi";',
            violation: "kernel/x.ts -> modeler/publicApi.ts",
        },
        {
            name: "composition",
            text: 'import { z } from "../composition/z";',
            violation: "kernel/x.ts -> composition/z.ts",
        },
        {
            name: "a feature library",
            text: 'import { LAYOUT_FORMATTED_EVENT } from "@miragon/bpmn-modeler-layout";',
            violation: "kernel/x.ts -> @miragon/bpmn-modeler-layout",
        },
        {
            name: "a hexagonal library",
            text: 'import type { Diff } from "@miragon/bpmn-modeler-diff/domain";',
            violation: "kernel/x.ts -> @miragon/bpmn-modeler-diff/domain",
        },
        {
            name: "this package by name",
            text: 'import { createModeler } from "@miragon/bpmn-modeler";',
            violation: "kernel/x.ts -> @miragon/bpmn-modeler",
        },
    ])("flag a kernel file that imports $name", ({ text, violation }) => {
        expect(syntheticViolations(text)).toEqual([violation]);
    });

    const violations = kernelImportViolations(readWorkspaces(REPO_ROOT))(
        buildImportGraph(packageSources),
    );

    it("kernel/ imports nothing outside kernel/ but the shared types, the browser helpers and npm", () => {
        expect(
            unexcusedViolations(violations, KERNEL_IMPORT_EXCEPTIONS).map(describeViolation),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        expect(staleExceptions(violations, KERNEL_IMPORT_EXCEPTIONS)).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(KERNEL_IMPORT_EXCEPTIONS)).toEqual([]);
    });
});

interface DiModule {
    readonly [name: string]: unknown;
    readonly __depends__?: readonly DiModule[];
}

function providedDiNames(
    modules: readonly DiModule[],
    names = new Set<string>(),
    visited = new Set<DiModule>(),
): Set<string> {
    for (const module of modules) {
        if (visited.has(module)) continue;
        visited.add(module);
        Object.keys(module)
            .filter((key) => !key.startsWith("__"))
            .forEach((name) => names.add(name));
        providedDiNames(module.__depends__ ?? [], names, visited);
    }
    return names;
}

const baseModules = (base: { prototype: object }): readonly DiModule[] =>
    (base.prototype as { _modules: readonly DiModule[] })._modules;

/** didi, diagram-js and bpmn-js register these in their constructors, beside `DiagramCore`. */
const CONSTRUCTOR_DI_NAMES: readonly string[] = ["injector", "config", "bpmnjs", "moddle"];

const KERNEL_DI_NAMES: readonly string[] = [
    SURFACE_MODE_SERVICE,
    SURFACE_ROOTS,
    DEBOUNCE_INPUT,
    DIAGRAM_TEMPLATE,
];

const DI_LOOKUP =
    /\b(?:get|service|optionalService|getService)\s*(?:<[^>()]*>)?\(\s*["']([\w$]+)["']/g;
const DI_INJECT = /\$inject\s*=\s*\[([^\]]*)\]/g;
const STRING_LITERAL = /["']([\w$]+)["']/g;

function literalDiNames({ path, text }: SourceFile): string[] {
    const code = stripComments(path, text);
    const looked = [...code.matchAll(DI_LOOKUP)].map(([, name]) => name);
    const injected = [...code.matchAll(DI_INJECT)].flatMap(([, list]) =>
        [...list.matchAll(STRING_LITERAL)].map(([, name]) => name),
    );
    return [...looked, ...injected];
}

/** A DI name the kernel spells out that neither a bpmn-js base nor the kernel provides. */
function kernelDiNameViolations(isAllowed: (name: string) => boolean) {
    return (sources: readonly SourceFile[]): Violation[] =>
        sources
            .filter(({ path }) => path.startsWith(KERNEL))
            .flatMap((file) =>
                [...new Set(literalDiNames(file))]
                    .filter((name) => !isAllowed(name))
                    .map((name) => ({ from: file.path, to: name })),
            );
}

/** Keyed by file and DI name; each names the step that moves the lookup into its feature. */
const KERNEL_DI_NAME_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "kernel/service/editableSurface.ts",
        to: "bpmnLintConfig",
        until: "#2802 S5: the lint handle methods move into the lint() feature's accessor",
    },
];

describe("bpmn-modeler kernel DI names", () => {
    const syntheticViolations = (text: string): string[] =>
        kernelDiNameViolations((name) => ["eventBus", SURFACE_ROOTS].includes(name))([
            { path: "kernel/x.ts", text },
        ]).map(describeViolation);

    it.each([
        { name: "a base service", text: 'core.service<EventBus>("eventBus");' },
        { name: "a kernel name by its constant", text: "core.optionalService(DIAGRAM_TEMPLATE);" },
        { name: "a name only in a comment", text: '// get("bpmnLayouter", false)' },
    ])("pass a kernel file that looks up $name", ({ text }) => {
        expect(syntheticViolations(text)).toEqual([]);
    });

    it.each([
        {
            name: "an optional feature service",
            text: 'surface.optionalService<Layouter>("bpmnLayouter");',
        },
        { name: "a feature service by get", text: 'injector.get("bpmnLayouter", false);' },
        {
            name: "a feature service by injection",
            text: 'Fit.$inject = ["eventBus", "bpmnLayouter"];',
        },
    ])("flag a kernel file that names $name", ({ text }) => {
        expect(syntheticViolations(text)).toEqual(["kernel/x.ts -> bpmnLayouter"]);
    });

    const baseNames = providedDiNames([
        DiagramCore as DiModule,
        ...baseModules(NavigatedViewer),
        ...baseModules(Modeler),
    ]);
    const allowed = new Set([...baseNames, ...CONSTRUCTOR_DI_NAMES, ...KERNEL_DI_NAMES]);
    const violations = kernelDiNameViolations((name) => allowed.has(name))(sourcesIn("kernel"));

    it("reads the base names from the bpmn-js module tree", () => {
        expect([...baseNames]).toEqual(
            expect.arrayContaining(["eventBus", "canvas", "selection", "searchPad"]),
        );
    });

    it("kernel/ looks up no DI name but the bases' and its own", () => {
        expect(
            unexcusedViolations(violations, KERNEL_DI_NAME_EXCEPTIONS).map(describeViolation),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        expect(staleExceptions(violations, KERNEL_DI_NAME_EXCEPTIONS)).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(KERNEL_DI_NAME_EXCEPTIONS)).toEqual([]);
    });
});
