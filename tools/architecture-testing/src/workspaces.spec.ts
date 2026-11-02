import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readWorkspaces, workspaceOfSpecifier } from "./workspaces";

describe("readWorkspaces", () => {
    let root: string;

    const writeManifest = (path: string, manifest: object): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), JSON.stringify(manifest));
    };

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "workspaces-"));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("lists the children of dir/* entries and plain dirs that carry a manifest", () => {
        writeManifest("package.json", { workspaces: ["libs/*", "docs"] });
        writeManifest("libs/b/package.json", { name: "@scope/b" });
        writeManifest("libs/a/package.json", { name: "@scope/a" });
        mkdirSync(join(root, "libs/no-manifest"));
        writeManifest("docs/package.json", { name: "docs" });

        expect(readWorkspaces(root)).toEqual([
            { name: "@scope/a", dir: "libs/a" },
            { name: "@scope/b", dir: "libs/b" },
            { name: "docs", dir: "docs" },
        ]);
    });

    it("skips a manifest without a name", () => {
        writeManifest("package.json", { workspaces: ["docs"] });
        writeManifest("docs/package.json", {});

        expect(readWorkspaces(root)).toEqual([]);
    });

    it("reads a root without workspaces as none", () => {
        writeManifest("package.json", {});

        expect(readWorkspaces(root)).toEqual([]);
    });

    it.each(["libs/**", "libs/a-*", "{apps,libs}/*", "!libs/a"])(
        "throws on the glob %s",
        (pattern) => {
            writeManifest("package.json", { workspaces: [pattern] });

            expect(() => readWorkspaces(root)).toThrow(pattern);
        },
    );
});

describe("workspaceOfSpecifier", () => {
    const workspaces = [
        { name: "@miragon/bpmn-modeler", dir: "packages/bpmn-modeler" },
        { name: "@miragon/bpmn-modeler-core", dir: "libs/modeler-core" },
    ];

    it.each([
        { specifier: "@miragon/bpmn-modeler", dir: "packages/bpmn-modeler" },
        { specifier: "@miragon/bpmn-modeler/design", dir: "packages/bpmn-modeler" },
        { specifier: "@miragon/bpmn-modeler-core", dir: "libs/modeler-core" },
        { specifier: "@miragon/bpmn-modeler-core/testing", dir: "libs/modeler-core" },
    ])("maps $specifier to $dir", ({ specifier, dir }) => {
        expect(workspaceOfSpecifier(specifier, workspaces)?.dir).toBe(dir);
    });

    it.each(["@miragon/bpmn-modeler-shared", "bpmn-js", "./bpmn-modeler"])(
        "maps %s to no workspace",
        (specifier) => {
            expect(workspaceOfSpecifier(specifier, workspaces)).toBeUndefined();
        },
    );
});
