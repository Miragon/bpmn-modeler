import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractGraph, projectFiles } from "archunit";
import type { FileInfo } from "archunit";

/**
 * Executable architecture tests (#1050). They turn the four-layer +
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
 * field. Comments mentioning a module (e.g. JSDoc that says `vscode.Disposable`)
 * are not matched, since the patterns anchor on the `from`/`import`/`require`
 * keyword and a quoted specifier.
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

/**
 * Builds an archunit custom rule that passes when a file imports none of the
 * specifiers rejected by `isForbidden`.
 */
function importsNothingMatching(isForbidden: (specifier: string) => boolean) {
    return (file: FileInfo): boolean => !importedModules(readSource(file)).some(isForbidden);
}

describe("architecture", () => {
    // archunit builds the TS import graph on the first rule check and caches it
    // by tsconfig path; the cold build is ~5s on CI and would blow the 5s
    // per-test timeout of whichever test happens to run first. Warm the shared
    // cache once here so every test below reads the memoised graph in ~1ms.
    beforeAll(async () => {
        await extractGraph(TSCONFIG);
    }, 60_000);

    // ─── A. Layer purity — regression locks, must stay GREEN ─────────────────
    //
    // Inner layers must not reach outward. The issue's "only `controller/**`
    // (plus `main.ts`/`shared/`) may import `vscode`" is encoded as the two
    // host-module bans on `domain` and `service` below: `infrastructure/**` is
    // the adapter layer and legitimately imports `vscode`, so it is deliberately
    // unrestricted. Globs are `**/<layer>/**` so they match each layer folder
    // under every feature prefix (and under `shared/`).
    describe("layer purity (regression lock — green)", () => {
        for (const outerLayer of ["service", "infrastructure", "controller"]) {
            it(`domain does not depend on ${outerLayer}`, async () => {
                await expect(
                    projectFiles(TSCONFIG)
                        .inFolder("**/domain/**")
                        .shouldNot()
                        .dependOnFiles()
                        .inFolder(`**/${outerLayer}/**`),
                ).toPassAsync();
            });
        }

        it("domain does not import vscode or Node host modules", async () => {
            await expect(
                projectFiles(TSCONFIG)
                    .inFolder("**/domain/**")
                    .should()
                    .adhereTo(
                        importsNothingMatching(isHostModule),
                        "domain must not import vscode / node:* / fs / http",
                    ),
            ).toPassAsync();
        });

        it("service does not depend on controller", async () => {
            await expect(
                projectFiles(TSCONFIG)
                    .inFolder("**/service/**")
                    .shouldNot()
                    .dependOnFiles()
                    .inFolder("**/controller/**"),
            ).toPassAsync();
        });

        it("service does not import vscode", async () => {
            await expect(
                projectFiles(TSCONFIG)
                    .inFolder("**/service/**")
                    .should()
                    .adhereTo(
                        importsNothingMatching((specifier) => specifier === "vscode"),
                        "service must not import vscode (goes through ports)",
                    ),
            ).toPassAsync();
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
        const FEATURE_FOLDERS = [
            "diff",
            "deployment",
            "scriptTask",
            "navigation",
            "migration",
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
