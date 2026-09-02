import { readdirSync, readFileSync, statSync } from "node:fs";
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
 *
 * Text-scan rather than archunit's graph: under this workspace's
 * `moduleResolution: "bundler"` tsconfig archunit resolves no cross-file edges
 * (see `libs/modeler-core/src/architecture.spec.ts`).
 */
const PKG_SRC = __dirname;
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const LIBS_ROOT = join(REPO_ROOT, "libs");

function listSourceFiles(root: string): string[] {
    const out: string[] = [];
    const SKIP_DIRS = new Set(["node_modules", "dist", "lib", "coverage"]);
    const walk = (absDir: string): void => {
        for (const entry of readdirSync(absDir)) {
            const abs = join(absDir, entry);
            if (statSync(abs).isDirectory()) {
                if (SKIP_DIRS.has(entry)) continue;
                walk(abs);
            } else if (
                entry.endsWith(".ts") &&
                !entry.endsWith(".d.ts") &&
                !/\.(spec|test)\.ts$/.test(entry)
            ) {
                out.push(abs);
            }
        }
    };
    walk(root);
    return out;
}

const SPECIFIER_PATTERNS: readonly RegExp[] = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
];

function importedModules(content: string): string[] {
    return SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...content.matchAll(pattern)].map((match) => match[1]),
    );
}

// Value imports only — `import type` / `export type` are erased at build and so
// never pull runtime code into a bundle. Used by the lint-injection gate below.
const VALUE_SPECIFIER_PATTERNS: readonly RegExp[] = [
    /\bimport\s+(?!type\b)[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\s+(?!type\b)[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
];

// Drop block + line comments so a specifier *named in prose* (e.g. the
// `typeof import("./bpmnlint")` mention in a jsdoc) is not read as a real
// import. Coarse — it may nick a `//` inside a string literal — but harmless
// here: we only pattern-match import specifiers out of the result.
function stripComments(content: string): string {
    return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function valueImportedModules(content: string): string[] {
    const code = stripComments(content);
    return VALUE_SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...code.matchAll(pattern)].map((match) => match[1]),
    );
}

/** `@miragon/bpmn-modeler` exactly, or a subpath of it — but not `-types`/`-core`/… */
const PACKAGE_SELF = /^@miragon\/bpmn-modeler(\/|$)/;

describe("bpmn-modeler import direction", () => {
    it("package source never names the protocol, the engine, or apps/", () => {
        const offenders: string[] = [];
        for (const file of listSourceFiles(PKG_SRC)) {
            for (const spec of importedModules(readFileSync(file, "utf8"))) {
                const forbidden =
                    spec === "@miragon/bpmn-modeler-shared" ||
                    spec === "@miragon/bpmn-modeler-core" ||
                    spec.startsWith("@miragon/bpmn-modeler-core/") ||
                    /(^|\/)apps\//.test(spec);
                if (forbidden) {
                    offenders.push(`${file.slice(PKG_SRC.length + 1)} → ${spec}`);
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
        // gate is TS-only, matching listSourceFiles.)
        const VSCODE_CLASS = /vscode-(dark|light|high-contrast)/;
        const offenders: string[] = [];
        for (const file of listSourceFiles(PKG_SRC)) {
            if (VSCODE_CLASS.test(readFileSync(file, "utf8"))) {
                offenders.push(file.slice(PKG_SRC.length + 1));
            }
        }
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
        const DARK_DIR = join(PKG_SRC, "styles", "dark-theme");
        const offenders: string[] = [];
        for (const entry of readdirSync(DARK_DIR)) {
            if (!entry.endsWith(".css")) continue;
            const root = postcss.parse(readFileSync(join(DARK_DIR, entry), "utf8"));
            root.walkRules((rule) => {
                if (rule.parent?.type !== "root") return; // nested rule: parent scopes it
                if (!rule.selector.includes("data-bpmn-theme")) {
                    offenders.push(`${entry}: ${rule.selector}`);
                }
            });
        }
        expect(
            offenders,
            `every top-level dark-theme rule must be scoped under ` +
                `[data-bpmn-theme="dark"]:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("only src/bpmnlint/ value-imports the lint stack (#1407)", () => {
        // The lint stack is injection-only: a host imports `@miragon/bpmn-modeler/lint`
        // (which resolves to `src/bpmnlint/index.ts`) and hands the module in. No
        // other package source may pull it into the runtime graph — a reachable
        // value import (static or dynamic) is exactly what a single-file bundler
        // inlines even under `linting: false`. `import type` stays fine.
        const LINT_STACK = (spec: string): boolean =>
            spec === "bpmnlint" || spec === "bpmn-js-bpmnlint" || /(^|\/)bpmnlint$/.test(spec); // the `./bpmnlint` barrel, not its type subpaths
        const BPMNLINT_DIR = join(PKG_SRC, "bpmnlint");
        const offenders: string[] = [];
        for (const file of listSourceFiles(PKG_SRC)) {
            if (file.startsWith(BPMNLINT_DIR)) continue;
            for (const spec of valueImportedModules(readFileSync(file, "utf8"))) {
                if (LINT_STACK(spec)) {
                    offenders.push(`${file.slice(PKG_SRC.length + 1)} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the lint stack is injection-only — only src/bpmnlint/ may value-import ` +
                `it (use \`import type\` elsewhere):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("the viewer subpath + its shared helpers value-import only the lean set (#1405)", () => {
        // The `/viewer` subpath must stay lean at the module-graph level: its
        // sources — and the helpers they reuse — may value-import only bpmn-js,
        // diagram-js, `@miragon/bpmn-modeler-types`, or relatives. A value import
        // of the editor stack (camunda-bpmn-js, properties-panel, preact, …)
        // here is exactly what a single-file bundler would inline into a
        // viewer-only consumer. `import type` stays fine. The runtime graph is
        // gated separately by `scripts/check-viewer-pure-entry.mjs`.
        const VIEWER_DIR = join(PKG_SRC, "viewer");
        const SHARED_HELPERS = new Set(
            ["viewport.ts", "selection.ts", "theme.ts", "elementGeometry.ts"].map((f) =>
                join(PKG_SRC, f),
            ),
        );
        const isAllowed = (spec: string): boolean =>
            spec.startsWith(".") ||
            spec === "bpmn-js" ||
            spec.startsWith("bpmn-js/") ||
            spec === "diagram-js" ||
            spec.startsWith("diagram-js/") ||
            spec === "@miragon/bpmn-modeler-types";
        const offenders: string[] = [];
        for (const file of listSourceFiles(PKG_SRC)) {
            if (!file.startsWith(VIEWER_DIR) && !SHARED_HELPERS.has(file)) continue;
            for (const spec of valueImportedModules(readFileSync(file, "utf8"))) {
                if (!isAllowed(spec)) {
                    offenders.push(`${file.slice(PKG_SRC.length + 1)} → ${spec}`);
                }
            }
        }
        expect(
            offenders,
            `the viewer subpath must stay lean — value-import only bpmn-js/*, ` +
                `diagram-js/*, @miragon/bpmn-modeler-types, or relatives ` +
                `(use \`import type\` for anything else):\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no libs/* source imports @miragon/bpmn-modeler", () => {
        const offenders: string[] = [];
        for (const file of listSourceFiles(LIBS_ROOT)) {
            for (const spec of importedModules(readFileSync(file, "utf8"))) {
                if (PACKAGE_SELF.test(spec)) {
                    offenders.push(`${file.slice(LIBS_ROOT.length + 1)} → ${spec}`);
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
