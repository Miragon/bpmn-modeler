import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// Archunit resolves no cross-file edges with this workspace’s bundler resolution.
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

const PACKAGE_SELF = /^@miragon\/dmn-modeler(\/|$)/;

describe("dmn-modeler import direction", () => {
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
            `@miragon/dmn-modeler must not import the private protocol, the ` +
                `engine core, or app code:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("package TS source reads no VS Code `<body>` theme classes", () => {
        // Host chrome must be mapped to a theme mode outside the package.
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

    it("every top-level dark-theme selector is scoped under data-dmn-theme", () => {
        const DARK_DIR = join(PKG_SRC, "styles", "dark-theme");
        const offenders: string[] = [];
        for (const entry of readdirSync(DARK_DIR)) {
            if (!entry.endsWith(".css")) continue;
            const root = postcss.parse(readFileSync(join(DARK_DIR, entry), "utf8"));
            root.walkRules((rule) => {
                if (rule.parent?.type !== "root") return; // nested rule: parent scopes it
                if (!rule.selector.includes("data-dmn-theme")) {
                    offenders.push(`${entry}: ${rule.selector}`);
                }
            });
        }
        expect(
            offenders,
            `every top-level dark-theme rule must be scoped under ` +
                `[data-dmn-theme="dark"]:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no libs/* source imports @miragon/dmn-modeler", () => {
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
