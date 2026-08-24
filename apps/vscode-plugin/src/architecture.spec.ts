import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractGraph, projectFiles } from "archunit";
import type { FileInfo } from "archunit";

/**
 * Executable architecture tests. They turn the four-layer +
 * feature-folder design — until now held by discipline alone — into CI gates so
 * regressions break the build instead of rotting silently.
 *
 * All three blocks are **regression locks that must stay green**: layer purity
 * (no inward layer reaches outward, no `vscode`/host modules leak into
 * `domain`/`service`), the no-cycle rule, and feature isolation (a feature may
 * reach a sibling only through its `index.ts` barrel).
 *
 * archunit resolves the import graph from a TypeScript project. The config is
 * pinned explicitly because the AC runs this via the *root* `vitest run`, whose
 * cwd is the repo root where archunit's auto-detect (walk up for a
 * `tsconfig.json`) finds none. Pinning the workspace config also fixes the
 * `rootDir`. Layer globs are written as recursive `<layer>` matchers (rather
 * than anchored at `src/<layer>`) because each layer subfolder now lives under
 * a feature prefix (`src/<feature>/<layer>/…`) after the Stage-3 reorg.
 */
const WORKSPACE_ROOT = resolve(__dirname, "..");
const TSCONFIG = resolve(WORKSPACE_ROOT, "tsconfig.json");

/**
 * Reads a matched file's source text from an absolute path.
 *
 * archunit hands custom rules a `FileInfo` whose `path` is project-relative
 * (`src/…`) and populates `content` via cwd-relative `fs.readFileSync`. Under
 * the AC's `corepack yarn test` (root `vitest run`, cwd = repo root) that read
 * misses and `content` is silently `""` — which would make every custom rule
 * pass vacuously. Re-reading from `WORKSPACE_ROOT` keeps the host-module bans
 * real regardless of cwd. `resolve` leaves an already-absolute path untouched.
 */
function readSource(file: FileInfo): string {
    return readFileSync(resolve(WORKSPACE_ROOT, file.path), "utf8");
}

/**
 * Module specifiers a file imports, drawn from every import/require form. Read
 * from source text because archunit's `FileInfo` exposes no structured imports
 * field. Prose mentions (e.g. JSDoc `vscode.Disposable`) don't match — the
 * patterns require the `from`/`import`/`require` keyword next to a quoted
 * specifier. A *commented-out* import (`// import … from "vscode"`) still would,
 * since the scan is over raw text with no comment stripping; harmless today
 * because no banned import is left commented in the tree.
 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
    /\bfrom\s*["']([^"']+)["']/g, // import … from "x";  export … from "x"
    /\bimport\s+["']([^"']+)["']/g, // import "x";  (side-effect)
    /\bimport\s*\(\s*["']([^"']+)["']/g, // import("x")  (dynamic)
    /\brequire\s*\(\s*["']([^"']+)["']/g, // require("x")
];

function importedModules(content: string): string[] {
    return SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...content.matchAll(pattern)].map((match) => match[1]),
    );
}

/** `vscode` and the Node platform — what the host-agnostic core must never name. */
function isHostModule(specifier: string): boolean {
    return (
        specifier === "vscode" ||
        specifier.startsWith("node:") ||
        specifier === "fs" ||
        specifier.startsWith("fs/") ||
        specifier === "http" ||
        specifier === "https"
    );
}

// ─── Transitive host-reachability ────────────────────────────────────────────
//
// The plain `isHostModule` ban above is a *text scan of each file's own
// imports* — it never follows the import graph. That is exactly how a `service`
// file importing a concrete `Vs*` adapter (which in turn imports `vscode`)
// slips through: the service's own source never names `vscode`. We close that
// hole by following relative imports transitively and tainting any file that
// can *reach* a host-importing file.
//
// The graph is built from source text rather than archunit's `extractGraph`,
// because under this workspace's `moduleResolution: "bundler"` tsconfig that
// resolver yields no cross-file edges (every edge is a self-edge) — so the
// dependency-based archunit rules cannot see indirection. Only relative
// specifiers are followed; bare/aliased packages are external and (for the
// engine) never reach `vscode`.

/** All non-spec `.ts` files under `src/`, as `src/…`-relative POSIX-ish paths. */
function listSourceFiles(): string[] {
    const root = resolve(WORKSPACE_ROOT, "src");
    const out: string[] = [];
    const walk = (absDir: string): void => {
        for (const entry of readdirSync(absDir)) {
            const abs = join(absDir, entry);
            if (statSync(abs).isDirectory()) {
                walk(abs);
            } else if (entry.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(entry)) {
                out.push(
                    `src/${normalize(abs.slice(root.length + 1))
                        .split("\\")
                        .join("/")}`,
                );
            }
        }
    };
    walk(root);
    return out;
}

/** Resolves a relative import specifier from `fromFile` to a known source path. */
function resolveRelative(
    fromFile: string,
    specifier: string,
    known: Set<string>,
): string | undefined {
    const base = normalize(join(dirname(fromFile), specifier))
        .split("\\")
        .join("/");
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
        if (known.has(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Files that transitively reach a host module: seeded with every file whose own
 * source imports one (the reliable text scan, which also catches type-only
 * imports), then propagated backwards along relative-import edges.
 */
function hostReachingFiles(files: string[]): Set<string> {
    const known = new Set(files);
    const importers = new Map<string, string[]>(); // target → files that import it
    const tainted = new Set<string>();
    for (const file of files) {
        const specifiers = importedModules(readSource({ path: file } as FileInfo));
        if (specifiers.some(isHostModule)) {
            tainted.add(file); // directly imports a host module
        }
        for (const specifier of specifiers) {
            if (!specifier.startsWith(".")) {
                continue; // bare/aliased — external, never reaches vscode in the engine
            }
            const target = resolveRelative(file, specifier, known);
            if (target) {
                (importers.get(target) ?? importers.set(target, []).get(target)!).push(file);
            }
        }
    }
    const queue = [...tainted];
    while (queue.length > 0) {
        for (const importer of importers.get(queue.pop()!) ?? []) {
            if (!tainted.has(importer)) {
                tainted.add(importer);
                queue.push(importer);
            }
        }
    }
    return tainted;
}

describe("architecture", () => {
    // archunit builds the TS import graph on the first rule check and caches it
    // by tsconfig path; the cold build is ~5s on CI and would blow the 5s
    // per-test timeout of whichever test happens to run first. Warm the shared
    // cache once here so every test below reads the memoised graph in ~1ms.
    beforeAll(async () => {
        await extractGraph(TSCONFIG);
    }, 60_000);

    // ─── A. Host isolation — regression lock, must stay GREEN ────────────────
    //
    // The host-agnostic engine (every `domain/`/`service/` layer plus the
    // vscode-free registries) now lives in `@miragon/bpmn-modeler-core`, gated
    // by that package's own `architecture.spec.ts`. What remains here is VS Code
    // host code (`Vs*` adapters, controllers, participants, composition root),
    // which legitimately imports `vscode`.
    //
    // This guard is the regression lock against the engine creeping back into
    // the plugin: if a `domain/`/`service/` file is ever (re)introduced here, it
    // must reach the host only through ports — never by importing a concrete
    // `Vs*` adapter, directly or transitively. The check follows relative
    // imports through source text because archunit resolves no cross-file edges
    // under this workspace's `moduleResolution: "bundler"` tsconfig.
    describe("host isolation (regression lock — green)", () => {
        it("any domain/service code does not transitively reach a host module", () => {
            const files = listSourceFiles();
            const tainted = hostReachingFiles(files);
            const offenders = files.filter(
                (file) =>
                    (file.includes("/domain/") || file.includes("/service/")) && tainted.has(file),
            );
            expect(
                offenders,
                `domain/service must reach the host only through ports, but these ` +
                    `transitively import a host module (e.g. a service importing a ` +
                    `concrete Vs* adapter):\n${offenders.join("\n")}`,
            ).toEqual([]);
        });
    });

    // ─── B. No cycles — regression lock, must stay GREEN ─────────────────────
    describe("no cycles (regression lock — green)", () => {
        it("the source tree is free of import cycles", async () => {
            await expect(
                projectFiles(TSCONFIG).inFolder("src/**").should().haveNoCycles(),
            ).toPassAsync();
        });
    });

    // ─── C. Feature isolation — regression lock, must stay GREEN ─────────────
    //
    // A feature may import a sibling feature only through that sibling's
    // `index.ts` barrel; reaching into its internals is forbidden. Encoded
    // pairwise — source = feature A, target = feature B's files except its
    // `index.ts`. `composition/` and `shared/` (and the generic
    // `modeler/editor-session/` host) are intentionally absent from
    // FEATURE_FOLDERS: the composition root wires features together and the
    // others are common substrate, so none is subject to isolation. Do NOT relax
    // the rules to make CI green; that defeats the gate.
    describe("feature isolation (regression lock — green)", () => {
        // `migration` is intentionally absent: after the engine extraction its
        // only plugin-side file is an `index.ts` barrel.
        const FEATURE_FOLDERS = [
            "diff",
            "deployment",
            "scriptTask",
            "codeLink",
            "navigation",
            "modeler/bpmn",
            "modeler/dmn",
        ];

        for (const sourceFeature of FEATURE_FOLDERS) {
            for (const targetFeature of FEATURE_FOLDERS) {
                if (sourceFeature === targetFeature) {
                    continue;
                }
                it(`${sourceFeature} does not import ${targetFeature} internals`, async () => {
                    await expect(
                        projectFiles(TSCONFIG)
                            .inFolder(`src/${sourceFeature}/**`)
                            .shouldNot()
                            .dependOnFiles()
                            .inFolder(`src/${targetFeature}/**`, {
                                except: { withName: "index.ts" },
                            }),
                    ).toPassAsync();
                });
            }
        }
    });
});
