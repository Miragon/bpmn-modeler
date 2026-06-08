import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`: the engine must stay
 * host-agnostic. The package-wide invariant is "no `vscode`, ever"; the
 * `domain/` layer additionally avoids Node host modules (`node:*`, `fs`,
 * `http`). Pure Node utilities that exist in any Node host (`path`, `Buffer`)
 * are allowed — they are not host capabilities.
 *
 * The checks read source text and follow relative imports themselves rather
 * than using archunit's graph: under this workspace's `moduleResolution:
 * "bundler"` tsconfig, archunit resolves no cross-file edges, so it cannot see
 * the indirection this guard exists to catch (a file reaching `vscode` through
 * an imported sibling).
 */
const SRC_ROOT = __dirname;

/** Source files under `src/`, as root-relative POSIX-ish paths, specs excluded. */
function listSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (absDir: string): void => {
        for (const entry of readdirSync(absDir)) {
            const abs = join(absDir, entry);
            if (statSync(abs).isDirectory()) {
                walk(abs);
            } else if (
                entry.endsWith(".ts") &&
                !entry.endsWith(".d.ts") &&
                !/\.(spec|test)\.ts$/.test(entry)
            ) {
                out.push(
                    normalize(abs.slice(SRC_ROOT.length + 1))
                        .split("\\")
                        .join("/"),
                );
            }
        }
    };
    walk(SRC_ROOT);
    return out;
}

function readSource(file: string): string {
    return readFileSync(join(SRC_ROOT, file), "utf8");
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

/** `vscode` and the Node platform — what the host-agnostic core must not name. */
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
 * source imports one, then propagated backwards along relative-import edges.
 */
function hostReachingFiles(files: string[]): Set<string> {
    const known = new Set(files);
    const importers = new Map<string, string[]>();
    const tainted = new Set<string>();
    for (const file of files) {
        const specifiers = importedModules(readSource(file));
        if (specifiers.some(isHostModule)) {
            tainted.add(file);
        }
        for (const specifier of specifiers) {
            if (!specifier.startsWith(".")) {
                continue;
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

describe("modeler-core architecture", () => {
    const files = listSourceFiles();

    it("no engine file imports vscode", () => {
        const offenders = files.filter((file) =>
            importedModules(readSource(file)).includes("vscode"),
        );
        expect(
            offenders,
            `@miragon/bpmn-modeler-core must be vscode-free; these import it:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("domain does not import vscode or Node host modules", () => {
        const offenders = files.filter(
            (file) =>
                file.includes("/domain/") && importedModules(readSource(file)).some(isHostModule),
        );
        expect(
            offenders,
            `domain must not import vscode / node:* / fs / http:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no engine file transitively reaches a host module", () => {
        const tainted = hostReachingFiles(files);
        const offenders = files.filter((file) => tainted.has(file));
        expect(
            offenders,
            `these transitively import a host module (vscode/node:*/fs/http) — ` +
                `the engine must reach the host only through ports:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});
