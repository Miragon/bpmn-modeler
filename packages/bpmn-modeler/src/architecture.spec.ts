import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Import-direction gate for `@miragon/bpmn-modeler` (epic #1293, ADR 0006/0007).
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
