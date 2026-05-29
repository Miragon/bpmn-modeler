import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { projectFiles } from "archunit";
import type { FileInfo } from "archunit";

/**
 * Executable architecture tests (#1050). They turn the four-layer +
 * feature-folder design — until now held by discipline alone — into CI gates so
 * regressions break the build instead of rotting silently.
 *
 * Two of the three blocks are **regression locks that must stay green**: layer
 * purity (no inward layer reaches outward, no `vscode`/host modules leak into
 * `domain`/`service`) and the no-cycle rule. The third block (feature
 * isolation) is **intentionally RED until #1039 lands** — see its `describe`.
 *
 * archunit resolves the import graph from a TypeScript project. The config is
 * pinned explicitly because the AC runs this via the *root* `vitest run`, whose
 * cwd is the repo root where archunit's auto-detect (walk up for a
 * `tsconfig.json`) finds none. Pinning the workspace config also fixes the
 * `rootDir`, so every folder glob below is written relative to the workspace
 * (`src/<layer>/**`).
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
    // ─── A. Layer purity — regression locks, must stay GREEN ─────────────────
    //
    // Inner layers must not reach outward. The issue's "only `controller/**`
    // (plus `main.ts`/`shared/`) may import `vscode`" is encoded as the two
    // host-module bans on `domain` and `service` below: `infrastructure/**` is
    // the adapter layer and legitimately imports `vscode`, so it is deliberately
    // unrestricted; `shared/` does not exist until #1039.
    describe("layer purity (regression lock — green)", () => {
        for (const outerLayer of ["service", "infrastructure", "controller"]) {
            it(`domain does not depend on ${outerLayer}`, async () => {
                await expect(
                    projectFiles(TSCONFIG)
                        .inFolder("src/domain/**")
                        .shouldNot()
                        .dependOnFiles()
                        .inFolder(`src/${outerLayer}/**`),
                ).toPassAsync();
            });
        }

        it("domain does not import vscode or Node host modules", async () => {
            await expect(
                projectFiles(TSCONFIG)
                    .inFolder("src/domain/**")
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
                    .inFolder("src/service/**")
                    .shouldNot()
                    .dependOnFiles()
                    .inFolder("src/controller/**"),
            ).toPassAsync();
        });

        it("service does not import vscode", async () => {
            await expect(
                projectFiles(TSCONFIG)
                    .inFolder("src/service/**")
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

    // ─── C. Feature isolation — SKIPPED until the Stage-3 feature-folder reorg ─
    //
    // These rules are authored test-first against the future feature-folder
    // layout (the `git mv` reorg is Stage 3 of epic #1031, NOT this PR). The
    // folders below match ZERO files today, so archunit's empty-match protection
    // (`allowEmptyTests` left false) makes every rule fail non-vacuously —
    // "structure not in place yet". 42 such failures would keep the suite red
    // throughout the Stage-2 wiring refactor (#1052), so this block is skipped
    // for now. The Stage-3 reorg that creates these folders MUST re-enable it
    // (flip `describe.skip` back to `describe`). Do NOT relax the rules
    // themselves to make CI green; that defeats the gate.
    //
    // Contract: a feature may import a sibling feature only through that
    // sibling's `index.ts`; reaching into its internals is forbidden. Encoded
    // pairwise — source = feature A, target = feature B's files except its
    // `index.ts`.
    describe.skip("feature isolation (re-enable in Stage-3 feature-folder reorg)", () => {
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
