import { describe, expect, it } from "vitest";

import { configArtifactLocation, configFolderPath } from "./configArtifacts";

describe("configFolderPath", () => {
    it.each([
        {
            behaviour: "names an entry of the config folder a directory holds",
            directory: "/work/proj",
            configFolder: ".camunda",
            entryPath: ["deployment-targets.json"],
            path: "/work/proj/.camunda/deployment-targets.json",
        },
        {
            behaviour: "names the config folder itself without an entry",
            directory: "/work/proj",
            configFolder: ".camunda",
            entryPath: [],
            path: "/work/proj/.camunda",
        },
        {
            behaviour: "joins an entry path of several segments",
            directory: "/work/proj",
            configFolder: ".camunda",
            entryPath: ["tmp", "scripting"],
            path: "/work/proj/.camunda/tmp/scripting",
        },
        {
            behaviour: "accepts a config folder nested below the directory",
            directory: "/work/proj",
            configFolder: "config/camunda",
            entryPath: ["deployment-targets.json"],
            path: "/work/proj/config/camunda/deployment-targets.json",
        },
        {
            behaviour: "ignores a trailing slash on the config folder",
            directory: "/work/proj",
            configFolder: ".camunda/",
            entryPath: ["deployment-targets.json"],
            path: "/work/proj/.camunda/deployment-targets.json",
        },
        {
            behaviour: "keeps a drive root reported with its slash",
            directory: "/c:/",
            configFolder: ".camunda",
            entryPath: ["deployment-targets.json"],
            path: "/c:/.camunda/deployment-targets.json",
        },
        {
            behaviour: "keeps the UNC root of a share",
            directory: "//server/share",
            configFolder: ".camunda",
            entryPath: ["deployment-targets.json"],
            path: "//server/share/.camunda/deployment-targets.json",
        },
    ])("$behaviour", ({ directory, configFolder, entryPath, path }) => {
        expect(configFolderPath(directory, configFolder, ...entryPath)).toBe(path);
    });
});

describe("configArtifactLocation", () => {
    it.each([
        {
            behaviour: "mirrors the document's path below the root under the code-link area",
            workspaceRoot: "/work/proj",
            area: "code-link",
            documentPath: "/work/proj/processes/order.bpmn",
            suffix: ".json",
            path: "/work/proj/.camunda/code-link/processes/order.bpmn.json",
            documentBelowRoot: "processes/order.bpmn",
        },
        {
            behaviour: "appends a compound suffix under the vars area",
            workspaceRoot: "/work/proj",
            area: "vars",
            documentPath: "/work/proj/processes/order.bpmn",
            suffix: ".vars.json",
            path: "/work/proj/.camunda/vars/processes/order.bpmn.vars.json",
            documentBelowRoot: "processes/order.bpmn",
        },
        {
            behaviour: "places a document at the root directly in the area",
            workspaceRoot: "/work/proj",
            area: "code-link",
            documentPath: "/work/proj/order.bpmn",
            suffix: ".json",
            path: "/work/proj/.camunda/code-link/order.bpmn.json",
            documentBelowRoot: "order.bpmn",
        },
        {
            behaviour: "ignores a trailing slash on the root",
            workspaceRoot: "/work/proj/",
            area: "code-link",
            documentPath: "/work/proj/order.bpmn",
            suffix: ".json",
            path: "/work/proj/.camunda/code-link/order.bpmn.json",
            documentBelowRoot: "order.bpmn",
        },
        {
            behaviour: "keeps a drive root reported with its slash",
            workspaceRoot: "/c:/",
            area: "code-link",
            documentPath: "/c:/processes/order.bpmn",
            suffix: ".json",
            path: "/c:/.camunda/code-link/processes/order.bpmn.json",
            documentBelowRoot: "processes/order.bpmn",
        },
        {
            behaviour: "keeps the vars area of a drive root",
            workspaceRoot: "/c:/",
            area: "vars",
            documentPath: "/c:/order.bpmn",
            suffix: ".vars.json",
            path: "/c:/.camunda/vars/order.bpmn.vars.json",
            documentBelowRoot: "order.bpmn",
        },
        {
            behaviour: "keeps the UNC root of a workspace on a share",
            workspaceRoot: "//server/share/proj",
            area: "code-link",
            documentPath: "//server/share/proj/order.bpmn",
            suffix: ".json",
            path: "//server/share/proj/.camunda/code-link/order.bpmn.json",
            documentBelowRoot: "order.bpmn",
        },
        {
            behaviour: "mirrors the documents of a workspace opened at the filesystem root",
            workspaceRoot: "/",
            area: "code-link",
            documentPath: "/work/order.bpmn",
            suffix: ".json",
            path: "/.camunda/code-link/work/order.bpmn.json",
            documentBelowRoot: "work/order.bpmn",
        },
    ])("$behaviour", ({ workspaceRoot, area, documentPath, suffix, path, documentBelowRoot }) => {
        expect(
            configArtifactLocation({
                workspaceRoot,
                configFolder: ".camunda",
                area,
                documentPath,
                suffix,
            }),
        ).toEqual({ path, documentBelowRoot });
    });

    it("places the area in the configured folder", () => {
        expect(
            configArtifactLocation({
                workspaceRoot: "/work/proj",
                configFolder: "config/camunda",
                area: "code-link",
                documentPath: "/work/proj/order.bpmn",
                suffix: ".json",
            }).path,
        ).toBe("/work/proj/config/camunda/code-link/order.bpmn.json");
    });

    it.each([
        {
            behaviour: "throws for a document outside the root",
            workspaceRoot: "/work/proj",
            documentPath: "/work/other/order.bpmn",
        },
        {
            behaviour: "throws for a document in a sibling that shares the root's name prefix",
            workspaceRoot: "/work/proj",
            documentPath: "/work/proj2/order.bpmn",
        },
        {
            behaviour: "throws for a document on another drive",
            workspaceRoot: "/c:/",
            documentPath: "/d:/order.bpmn",
        },
        {
            behaviour: "throws for the root itself, which names no document",
            workspaceRoot: "/work/proj",
            documentPath: "/work/proj",
        },
    ])("$behaviour", ({ workspaceRoot, documentPath }) => {
        expect(() =>
            configArtifactLocation({
                workspaceRoot,
                configFolder: ".camunda",
                area: "code-link",
                documentPath,
                suffix: ".json",
            }),
        ).toThrow(
            `No config artifact for ${documentPath}: it is not below the workspace root ${workspaceRoot}.`,
        );
    });
});
