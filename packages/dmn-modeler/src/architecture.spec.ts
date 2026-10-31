import { readModuleImports, readSourceTree, requireMatches } from "@miragon/architecture-testing";
import type { SourceFile } from "@miragon/architecture-testing";
import { join, normalize } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const PKG_SRC = __dirname;
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const LIBS_ROOT = join(REPO_ROOT, "libs");

const packageSources = readSourceTree(PKG_SRC);

function importedModules({ path, text }: SourceFile): string[] {
    return readModuleImports(path, text).map(({ specifier }) => specifier);
}

const PACKAGE_SELF = /^@miragon\/dmn-modeler(\/|$)/;

describe("dmn-modeler import direction", () => {
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
            `@miragon/dmn-modeler must not import the private protocol, the ` +
                `engine core, or app code:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("package TS source reads no VS Code `<body>` theme classes", () => {
        // Host chrome must be mapped to a theme mode outside the package.
        const VSCODE_CLASS = /vscode-(dark|light|high-contrast)/;
        const offenders = packageSources
            .filter(({ text }) => VSCODE_CLASS.test(text))
            .map(({ path }) => path);
        expect(
            offenders,
            `package TS source must not read VS Code body theme classes:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("every top-level dark-theme selector is scoped under data-dmn-theme", () => {
        const darkThemeStylesheets = requireMatches(
            "dark-theme stylesheets",
            readSourceTree(join(PKG_SRC, "styles", "dark-theme"), { extensions: [".css"] }),
        );
        const offenders: string[] = [];
        for (const { path, text } of darkThemeStylesheets) {
            postcss.parse(text).walkRules((rule) => {
                if (rule.parent?.type !== "root") return; // nested rule: parent scopes it
                if (!rule.selector.includes("data-dmn-theme")) {
                    offenders.push(`${path}: ${rule.selector}`);
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
        for (const file of readSourceTree(LIBS_ROOT)) {
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
