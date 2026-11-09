import { describe, expect, it } from "vitest";

import {
    addOnScanDirsOf,
    affectsAddOns,
    configSourceDirOf,
    innermostFolderOf,
    nodeModulesDirOf,
    packagesSourceDirOf,
} from "./addOnPaths";

describe("addOnScanDirsOf", () => {
    it("scans the root's config folder for plugins and its node_modules for rule packages", () => {
        expect(addOnScanDirsOf("/work", ".camunda")).toEqual({
            pluginsDir: "/work/.camunda/plugins",
            nodeModulesDir: "/work/node_modules",
        });
    });

    it("follows a config folder of several segments", () => {
        expect(addOnScanDirsOf("/work", "config/camunda").pluginsDir).toBe(
            "/work/config/camunda/plugins",
        );
    });

    it("names a lint config folder's node_modules", () => {
        expect(nodeModulesDirOf("/work/orders")).toBe("/work/orders/node_modules");
    });
});

describe("innermostFolderOf", () => {
    const folders = ["/work", "/work/orders", "/other"];

    it.each([
        { path: "/work/.camunda/plugins/a", folder: "/work" },
        { path: "/work/orders/.camunda/plugins/a", folder: "/work/orders" },
        { path: "/other/node_modules/bpmnlint-plugin-a", folder: "/other" },
        { path: "/work", folder: "/work" },
        { path: "/elsewhere/node_modules/x", folder: undefined },
        { path: "/work2/x", folder: undefined },
    ])("puts $path in $folder", ({ path, folder }) => {
        expect(innermostFolderOf(path, folders)).toBe(folder);
    });

    it("finds the innermost folder whatever order the folders were opened in", () => {
        expect(innermostFolderOf("/work/orders/x", ["/work/orders", "/work"])).toBe("/work/orders");
    });
});

describe("source folders", () => {
    it.each([
        { id: "/work/.camunda/plugins/resize", dir: "/work/.camunda" },
        { id: "/work/orders/.camunda/plugins/resize", dir: "/work/orders/.camunda" },
        { id: "/plugins/resize", dir: "/" },
        { id: "/resize", dir: "/" },
    ])("puts plugin $id in the config folder $dir", ({ id, dir }) => {
        expect(configSourceDirOf(id)).toBe(dir);
    });

    it.each([
        { id: "/work/node_modules/bpmnlint-plugin-a", dir: "/work/node_modules" },
        { id: "/work/node_modules/@acme/bpmnlint-plugin", dir: "/work/node_modules" },
        {
            id: "/work/node_modules/x/node_modules/bpmnlint-plugin-a",
            dir: "/work/node_modules/x/node_modules",
        },
        { id: "/work/rules", dir: "/work/rules" },
    ])("puts rule package $id in $dir", ({ id, dir }) => {
        expect(packagesSourceDirOf(id)).toBe(dir);
    });
});

describe("affectsAddOns", () => {
    it.each([
        { case: "a plugin file", path: "/work/.camunda/plugins/a/client.js", affects: true },
        {
            case: "a nested plugin file",
            path: "/work/orders/.camunda/plugins/a/plugin.json",
            affects: true,
        },
        { case: "the config folder itself", path: "/work/orders/.camunda", affects: true },
        { case: "a template file", path: "/work/.camunda/element-templates/a.json", affects: true },
        { case: "a diagram", path: "/work/orders/order.bpmn", affects: false },
        {
            case: "a folder named like it inside a word",
            path: "/work/x.camunda/plugins/a",
            affects: false,
        },
        {
            case: "a config folder inside node_modules",
            path: "/work/node_modules/p/.camunda/plugins/a",
            affects: false,
        },
        { case: "a path outside the root", path: "/other/.camunda/plugins/a", affects: false },
    ])("is $affects for $case", ({ path, affects }) => {
        expect(affectsAddOns(path, "/work", ".camunda")).toBe(affects);
    });

    it("follows a config folder of several segments", () => {
        expect(affectsAddOns("/work/config/camunda/plugins/a", "/work", "config/camunda")).toBe(
            true,
        );
        expect(affectsAddOns("/work/camunda/plugins/a", "/work", "config/camunda")).toBe(false);
    });
});
